use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet, VecDeque},
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, watch};

#[derive(Clone, Debug)]
pub struct SessionChannel {
    id: String,
    frames: mpsc::Sender<ServerFrame>,
    close: watch::Sender<bool>,
}

impl SessionChannel {
    pub fn new(id: String) -> (Self, mpsc::Receiver<ServerFrame>, watch::Receiver<bool>) {
        let (frames, receiver) = mpsc::channel(64);
        let (close, close_receiver) = watch::channel(false);
        (Self { id, frames, close }, receiver, close_receiver)
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn try_send(
        &self,
        frame: ServerFrame,
    ) -> Result<(), mpsc::error::TrySendError<ServerFrame>> {
        self.frames.try_send(frame)
    }

    pub fn close(&self) {
        self.close.send_replace(true);
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type")]
pub enum ServerFrame {
    #[serde(rename = "auth.challenge")]
    AuthChallenge { v: u8, nonce: String },
    #[serde(rename = "auth.ready")]
    AuthReady {
        v: u8,
        nickname: String,
        fingerprint: String,
    },
    #[serde(rename = "contact.pending")]
    ContactPending {
        v: u8,
        request_id: String,
        target_fingerprint: String,
    },
    #[serde(rename = "contact.matched")]
    ContactMatched {
        v: u8,
        nickname: String,
        fingerprint: String,
        relationship_epoch: String,
    },
    #[serde(rename = "contact.state")]
    ContactState {
        v: u8,
        fingerprint: String,
        active: bool,
        #[serde(skip_serializing_if = "Option::is_none")]
        nickname: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        relationship_epoch: Option<String>,
    },
    #[serde(rename = "presence.changed")]
    PresenceChanged {
        v: u8,
        fingerprint: String,
        online: bool,
    },
    #[serde(rename = "message.sent")]
    MessageSent {
        v: u8,
        request_id: String,
        message_id: String,
    },
    #[serde(rename = "message.received")]
    MessageReceived {
        v: u8,
        message_id: String,
        nickname: String,
        from_fingerprint: String,
        ciphertext: String,
    },
    #[serde(rename = "error")]
    Error {
        v: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        code: &'static str,
    },
}

#[derive(Clone, Debug)]
pub struct Delivery {
    pub sender: SessionChannel,
    pub frame: ServerFrame,
}

#[derive(Debug, Default)]
pub struct Transition {
    pub deliveries: Vec<Delivery>,
    pub log: Option<String>,
}

#[derive(Debug)]
pub struct Registration {
    pub nickname: String,
    pub deliveries: Vec<Delivery>,
}

#[derive(Debug)]
pub struct MessageRoute {
    pub sender: SessionChannel,
    pub frame: ServerFrame,
}

#[derive(Debug, PartialEq)]
pub enum StateError {
    InvalidRequest,
    AuthenticationFailed,
    NicknameUnavailable,
    RateLimited { close: bool },
    ContactUnavailable,
    MessageTooLarge,
}

impl StateError {
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid_request",
            Self::AuthenticationFailed => "authentication_failed",
            Self::NicknameUnavailable => "nickname_unavailable",
            Self::RateLimited { .. } => "rate_limited",
            Self::ContactUnavailable => "contact_unavailable",
            Self::MessageTooLarge => "message_too_large",
        }
    }
}

pub enum RateKind {
    Message,
    Contact,
}

#[derive(Default)]
pub struct AppState {
    identities: HashMap<String, Identity>,
    nickname_by_fingerprint: HashMap<String, String>,
    fingerprint_by_session: HashMap<String, String>,
    intents: HashSet<Intent>,
    relations: HashMap<Pair, Relation>,
    limits: HashMap<String, Limits>,
}

struct Identity {
    fingerprint: String,
    #[allow(dead_code)]
    public_key: String,
    session: Option<Session>,
}

#[derive(Clone)]
struct Session {
    id: String,
    sender: SessionChannel,
}

#[derive(Clone, Eq, Hash, PartialEq)]
struct Intent {
    session_id: String,
    from: String,
    to: String,
}

#[derive(Clone, Eq, Hash, PartialEq)]
struct Pair(String, String);

impl Pair {
    fn new(a: &str, b: &str) -> Self {
        if a <= b {
            Self(a.to_owned(), b.to_owned())
        } else {
            Self(b.to_owned(), a.to_owned())
        }
    }

    fn other(&self, fingerprint: &str) -> Option<&str> {
        if self.0 == fingerprint {
            Some(&self.1)
        } else if self.1 == fingerprint {
            Some(&self.0)
        } else {
            None
        }
    }
}

#[derive(Default)]
struct Relation {
    grants: HashSet<String>,
    epoch: Option<String>,
}

impl Relation {
    fn active(&self) -> bool {
        self.grants.len() == 2 && self.epoch.is_some()
    }
}

#[derive(Default)]
struct Limits {
    messages: VecDeque<Instant>,
    contacts: VecDeque<Instant>,
    violations: u8,
}

impl AppState {
    pub fn register(
        &mut self,
        nickname: &str,
        fingerprint: &str,
        public_key: String,
        session_id: String,
        sender: SessionChannel,
    ) -> Result<Registration, StateError> {
        let nickname = normalize_nickname(nickname)?;
        let fingerprint = fingerprint.to_ascii_lowercase();
        if self
            .nickname_by_fingerprint
            .get(&fingerprint)
            .is_some_and(|registered| registered != &nickname)
        {
            return Err(StateError::NicknameUnavailable);
        }

        let replaced = if let Some(identity) = self.identities.get_mut(&nickname) {
            if identity.fingerprint != fingerprint {
                return Err(StateError::NicknameUnavailable);
            }
            identity.public_key = public_key;
            identity
                .session
                .replace(Session {
                    id: session_id.clone(),
                    sender: sender.clone(),
                })
                .map(|session| session.sender)
        } else {
            self.nickname_by_fingerprint
                .insert(fingerprint.clone(), nickname.clone());
            self.identities.insert(
                nickname.clone(),
                Identity {
                    fingerprint: fingerprint.clone(),
                    public_key,
                    session: Some(Session {
                        id: session_id.clone(),
                        sender: sender.clone(),
                    }),
                },
            );
            None
        };

        if let Some(old_session) = self.fingerprint_by_session.iter().find_map(|(id, value)| {
            (value == &fingerprint && id != &session_id).then(|| id.clone())
        }) {
            self.fingerprint_by_session.remove(&old_session);
            self.intents
                .retain(|intent| intent.session_id != old_session);
            self.limits.remove(&old_session);
        }
        self.fingerprint_by_session
            .insert(session_id.clone(), fingerprint.clone());
        self.limits.entry(session_id).or_default();

        let mut deliveries = Vec::new();
        for (pair, relation) in &self.relations {
            if let Some(other) = pair.other(&fingerprint) {
                if relation.active()
                    && let Some(epoch) = &relation.epoch
                {
                    deliveries.extend(self.matched_deliveries(&fingerprint, other, epoch));
                } else {
                    deliveries.push(Delivery {
                        sender: sender.clone(),
                        frame: ServerFrame::ContactState {
                            v: 1,
                            fingerprint: other.to_owned(),
                            active: false,
                            nickname: None,
                            relationship_epoch: None,
                        },
                    });
                }
            }
        }
        if let Some(replaced) = replaced {
            replaced.close();
        }
        Ok(Registration {
            nickname,
            deliveries,
        })
    }

    pub fn disconnect(&mut self, session_id: &str) -> Vec<Delivery> {
        let Some(fingerprint) = self.fingerprint_by_session.remove(session_id) else {
            return Vec::new();
        };
        let Some(nickname) = self.nickname_by_fingerprint.get(&fingerprint) else {
            return Vec::new();
        };
        let Some(identity) = self.identities.get_mut(nickname) else {
            return Vec::new();
        };
        if identity.session.as_ref().map(|session| session.id.as_str()) != Some(session_id) {
            return Vec::new();
        }
        identity.session = None;
        self.intents
            .retain(|intent| intent.session_id != session_id);
        self.limits.remove(session_id);

        self.relations
            .iter()
            .filter(|(pair, relation)| relation.active() && pair.other(&fingerprint).is_some())
            .filter_map(|(pair, _)| pair.other(&fingerprint))
            .filter_map(|other| self.online_sender(other))
            .map(|sender| Delivery {
                sender,
                frame: ServerFrame::PresenceChanged {
                    v: 1,
                    fingerprint: fingerprint.clone(),
                    online: false,
                },
            })
            .collect()
    }

    pub fn add_contact(
        &mut self,
        session_id: &str,
        target_fingerprint: &str,
        request_id: String,
    ) -> Result<Transition, StateError> {
        let (from, from_sender) = self.session_identity(session_id)?;
        let target = target_fingerprint.to_ascii_lowercase();
        if from == target {
            return Err(StateError::InvalidRequest);
        }
        if self
            .relations
            .get(&Pair::new(&from, &target))
            .is_some_and(Relation::active)
        {
            return Err(StateError::ContactUnavailable);
        }
        let intent = Intent {
            session_id: session_id.to_owned(),
            from: from.clone(),
            to: target.clone(),
        };
        if !self.intents.contains(&intent)
            && self
                .intents
                .iter()
                .filter(|item| item.session_id == session_id)
                .count()
                >= 20
        {
            return Err(self.rate_violation(session_id)?);
        }
        self.intents.insert(intent);
        let mut transition = Transition {
            deliveries: vec![Delivery {
                sender: from_sender,
                frame: ServerFrame::ContactPending {
                    v: 1,
                    request_id,
                    target_fingerprint: target.clone(),
                },
            }],
            log: None,
        };

        let Some(target_session) = self.online_session(&target) else {
            return Ok(transition);
        };
        let reverse = Intent {
            session_id: target_session.id,
            from: target.clone(),
            to: from.clone(),
        };
        if !self.intents.contains(&reverse) {
            return Ok(transition);
        }

        self.intents.retain(|item| {
            !((item.from == from && item.to == target) || (item.from == target && item.to == from))
        });
        let pair = Pair::new(&from, &target);
        let relation = self.relations.entry(pair).or_default();
        let was_known = !relation.grants.is_empty();
        relation.grants.insert(from.clone());
        relation.grants.insert(target.clone());
        let epoch = random_token::<16>();
        relation.epoch = Some(epoch.clone());
        transition
            .deliveries
            .extend(self.matched_deliveries(&from, &target, &epoch));
        transition.log = Some(self.relation_log(
            if was_known {
                "relation_restored"
            } else {
                "relation_created"
            },
            &from,
            &target,
        ));
        Ok(transition)
    }

    pub fn cancel_contact(
        &mut self,
        session_id: &str,
        target_fingerprint: &str,
    ) -> Result<Transition, StateError> {
        let (from, sender) = self.session_identity(session_id)?;
        let target = target_fingerprint.to_ascii_lowercase();
        let before = self.intents.len();
        self.intents.retain(|intent| {
            !(intent.session_id == session_id && intent.from == from && intent.to == target)
        });
        if self.intents.len() == before {
            return Err(StateError::ContactUnavailable);
        }
        Ok(Transition {
            deliveries: vec![Delivery {
                sender,
                frame: ServerFrame::ContactState {
                    v: 1,
                    fingerprint: target,
                    active: false,
                    nickname: None,
                    relationship_epoch: None,
                },
            }],
            log: None,
        })
    }

    pub fn block_contact(
        &mut self,
        session_id: &str,
        target_fingerprint: &str,
    ) -> Result<Transition, StateError> {
        let (from, _) = self.session_identity(session_id)?;
        let target = target_fingerprint.to_ascii_lowercase();
        let relation = self
            .relations
            .get_mut(&Pair::new(&from, &target))
            .ok_or(StateError::ContactUnavailable)?;
        if !relation.grants.remove(&from) {
            return Err(StateError::ContactUnavailable);
        }
        relation.epoch = None;
        self.intents
            .retain(|intent| !(intent.from == from && intent.to == target));
        Ok(Transition {
            deliveries: self.inactive_deliveries(&from, &target),
            log: Some(self.relation_log("relation_blocked", &from, &target)),
        })
    }

    pub fn unblock_contact(
        &mut self,
        session_id: &str,
        target_fingerprint: &str,
    ) -> Result<Transition, StateError> {
        let (from, _) = self.session_identity(session_id)?;
        let target = target_fingerprint.to_ascii_lowercase();
        let relation = self
            .relations
            .get_mut(&Pair::new(&from, &target))
            .ok_or(StateError::ContactUnavailable)?;
        if !relation.grants.insert(from.clone()) {
            return Err(StateError::ContactUnavailable);
        }
        if !relation.grants.contains(&target) {
            return Ok(Transition {
                deliveries: self.inactive_deliveries(&from, &target),
                log: None,
            });
        }
        let epoch = random_token::<16>();
        relation.epoch = Some(epoch.clone());
        Ok(Transition {
            deliveries: self.matched_deliveries(&from, &target, &epoch),
            log: Some(self.relation_log("relation_restored", &from, &target)),
        })
    }

    pub fn route_message(
        &self,
        session_id: &str,
        target_fingerprint: &str,
        message_id: String,
        ciphertext: String,
    ) -> Result<MessageRoute, StateError> {
        if ciphertext.len() > 60 * 1024 || message_id.is_empty() || message_id.len() > 64 {
            return Err(StateError::MessageTooLarge);
        }
        let (from, _) = self.session_identity(session_id)?;
        let target = target_fingerprint.to_ascii_lowercase();
        let relation = self
            .relations
            .get(&Pair::new(&from, &target))
            .filter(|relation| relation.active())
            .ok_or(StateError::ContactUnavailable)?;
        if !relation.grants.contains(&from) || !relation.grants.contains(&target) {
            return Err(StateError::ContactUnavailable);
        }
        let sender = self
            .online_sender(&target)
            .ok_or(StateError::ContactUnavailable)?;
        let nickname = self
            .nickname(&from)
            .ok_or(StateError::AuthenticationFailed)?;
        Ok(MessageRoute {
            sender,
            frame: ServerFrame::MessageReceived {
                v: 1,
                message_id,
                nickname,
                from_fingerprint: from,
                ciphertext,
            },
        })
    }

    pub fn check_rate(
        &mut self,
        session_id: &str,
        kind: RateKind,
        now: Instant,
    ) -> Result<(), StateError> {
        let limits = self
            .limits
            .get_mut(session_id)
            .ok_or(StateError::AuthenticationFailed)?;
        let (attempts, window, maximum) = match kind {
            RateKind::Message => (&mut limits.messages, Duration::from_secs(1), 10),
            RateKind::Contact => (&mut limits.contacts, Duration::from_secs(60), 10),
        };
        while attempts
            .front()
            .is_some_and(|time| now.duration_since(*time) >= window)
        {
            attempts.pop_front();
        }
        if attempts.len() >= maximum {
            limits.violations = limits.violations.saturating_add(1);
            return Err(StateError::RateLimited {
                close: limits.violations >= 3,
            });
        }
        attempts.push_back(now);
        Ok(())
    }

    fn session_identity(&self, session_id: &str) -> Result<(String, SessionChannel), StateError> {
        let fingerprint = self
            .fingerprint_by_session
            .get(session_id)
            .ok_or(StateError::AuthenticationFailed)?;
        let session = self
            .online_session(fingerprint)
            .filter(|session| session.id == session_id)
            .ok_or(StateError::AuthenticationFailed)?;
        Ok((fingerprint.clone(), session.sender))
    }

    fn online_session(&self, fingerprint: &str) -> Option<Session> {
        self.nickname_by_fingerprint
            .get(fingerprint)
            .and_then(|nickname| self.identities.get(nickname))
            .and_then(|identity| identity.session.clone())
    }

    fn online_sender(&self, fingerprint: &str) -> Option<SessionChannel> {
        self.online_session(fingerprint)
            .map(|session| session.sender)
    }

    fn nickname(&self, fingerprint: &str) -> Option<String> {
        self.nickname_by_fingerprint.get(fingerprint).cloned()
    }

    fn matched_deliveries(&self, a: &str, b: &str, epoch: &str) -> Vec<Delivery> {
        [(a, b), (b, a)]
            .into_iter()
            .filter_map(|(recipient, contact)| {
                Some((
                    self.online_sender(recipient)?,
                    self.nickname(contact)?,
                    contact,
                ))
            })
            .flat_map(|(sender, nickname, contact)| {
                [
                    Delivery {
                        sender: sender.clone(),
                        frame: ServerFrame::ContactMatched {
                            v: 1,
                            nickname,
                            fingerprint: contact.to_owned(),
                            relationship_epoch: epoch.to_owned(),
                        },
                    },
                    Delivery {
                        sender,
                        frame: ServerFrame::PresenceChanged {
                            v: 1,
                            fingerprint: contact.to_owned(),
                            online: self.online_session(contact).is_some(),
                        },
                    },
                ]
            })
            .collect()
    }

    fn inactive_deliveries(&self, a: &str, b: &str) -> Vec<Delivery> {
        [(a, b), (b, a)]
            .into_iter()
            .filter_map(|(recipient, contact)| {
                Some(Delivery {
                    sender: self.online_sender(recipient)?,
                    frame: ServerFrame::ContactState {
                        v: 1,
                        fingerprint: contact.to_owned(),
                        active: false,
                        nickname: None,
                        relationship_epoch: None,
                    },
                })
            })
            .collect()
    }

    fn relation_log(&self, event: &str, from: &str, target: &str) -> String {
        format!(
            "{} {} {}",
            event,
            self.nickname(from).unwrap_or_default(),
            self.nickname(target).unwrap_or_default()
        )
    }

    fn rate_violation(&mut self, session_id: &str) -> Result<StateError, StateError> {
        let limits = self
            .limits
            .get_mut(session_id)
            .ok_or(StateError::AuthenticationFailed)?;
        limits.violations = limits.violations.saturating_add(1);
        Ok(StateError::RateLimited {
            close: limits.violations >= 3,
        })
    }
}

fn normalize_nickname(nickname: &str) -> Result<String, StateError> {
    let nickname = nickname.to_ascii_lowercase();
    if (3..=24).contains(&nickname.len())
        && nickname
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
    {
        Ok(nickname)
    } else {
        Err(StateError::InvalidRequest)
    }
}

pub fn random_token<const N: usize>() -> String {
    URL_SAFE_NO_PAD.encode(rand::random::<[u8; N]>())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sender(session: &str) -> SessionChannel {
        SessionChannel::new(session.into()).0
    }

    fn register(
        state: &mut AppState,
        nickname: &str,
        fingerprint: &str,
        session: &str,
    ) -> Registration {
        state
            .register(
                nickname,
                fingerprint,
                format!("PUBLIC {nickname}"),
                session.into(),
                sender(session),
            )
            .unwrap()
    }

    fn match_contacts(state: &mut AppState) -> String {
        state
            .add_contact("alice-session", "bob-fp", "a".into())
            .unwrap();
        let transition = state
            .add_contact("bob-session", "alice-fp", "b".into())
            .unwrap();
        transition
            .deliveries
            .iter()
            .find_map(|delivery| match &delivery.frame {
                ServerFrame::ContactMatched {
                    relationship_epoch, ..
                } => Some(relationship_epoch.clone()),
                _ => None,
            })
            .unwrap()
    }

    #[test]
    fn nickname_is_normalized_and_cannot_change_key() {
        let mut state = AppState::default();
        register(&mut state, "Alice_1", "fingerprint-a", "session-a");
        assert_eq!(
            state
                .register(
                    "alice_1",
                    "fingerprint-b",
                    "PUBLIC".into(),
                    "session-b".into(),
                    sender("session-b")
                )
                .unwrap_err(),
            StateError::NicknameUnavailable,
        );
        assert_eq!(
            state
                .register(
                    "no",
                    "fingerprint-c",
                    "PUBLIC".into(),
                    "session-c".into(),
                    sender("session-c")
                )
                .unwrap_err(),
            StateError::InvalidRequest,
        );
    }

    #[test]
    fn replacement_session_survives_old_cleanup() {
        let mut state = AppState::default();
        let (old, _frames, close) = SessionChannel::new("old".into());
        state
            .register("alice", "alice-fp", "PUBLIC".into(), "old".into(), old)
            .unwrap();
        register(&mut state, "alice", "alice-fp", "new");
        assert!(*close.borrow());
        assert!(state.disconnect("old").is_empty());
        assert_eq!(state.fingerprint_by_session.get("new").unwrap(), "alice-fp");
    }

    #[test]
    fn match_requires_both_intents_and_never_contains_public_key() {
        let mut state = AppState::default();
        register(&mut state, "alice", "alice-fp", "alice-session");
        register(&mut state, "bob", "bob-fp", "bob-session");
        let first = state
            .add_contact("alice-session", "bob-fp", "a".into())
            .unwrap();
        assert_eq!(first.deliveries.len(), 1);
        assert_eq!(first.deliveries[0].sender.id(), "alice-session");
        assert!(matches!(
            first.deliveries[0].frame,
            ServerFrame::ContactPending { .. }
        ));

        let second = state
            .add_contact("bob-session", "alice-fp", "b".into())
            .unwrap();
        let json = serde_json::to_string(
            &second
                .deliveries
                .iter()
                .find(|delivery| matches!(delivery.frame, ServerFrame::ContactMatched { .. }))
                .unwrap()
                .frame,
        )
        .unwrap();
        assert!(!json.contains("PUBLIC"));
        assert_eq!(second.log.as_deref(), Some("relation_created bob alice"));
    }

    #[test]
    fn disconnect_removes_pending_intents() {
        let mut state = AppState::default();
        register(&mut state, "alice", "alice-fp", "alice-session");
        register(&mut state, "bob", "bob-fp", "bob-session");
        state
            .add_contact("alice-session", "bob-fp", "a".into())
            .unwrap();
        state.disconnect("alice-session");
        register(&mut state, "alice", "alice-fp", "alice-new");
        let result = state
            .add_contact("bob-session", "alice-fp", "b".into())
            .unwrap();
        assert!(
            !result
                .deliveries
                .iter()
                .any(|delivery| matches!(delivery.frame, ServerFrame::ContactMatched { .. }))
        );
    }

    #[test]
    fn block_and_unblock_rotate_epoch() {
        let mut state = AppState::default();
        register(&mut state, "alice", "alice-fp", "alice-session");
        register(&mut state, "bob", "bob-fp", "bob-session");
        let first_epoch = match_contacts(&mut state);
        assert_eq!(
            state
                .block_contact("alice-session", "bob-fp")
                .unwrap()
                .log
                .as_deref(),
            Some("relation_blocked alice bob")
        );
        let restored = state.unblock_contact("alice-session", "bob-fp").unwrap();
        let second_epoch = restored
            .deliveries
            .iter()
            .find_map(|delivery| match &delivery.frame {
                ServerFrame::ContactMatched {
                    relationship_epoch, ..
                } => Some(relationship_epoch.clone()),
                _ => None,
            })
            .unwrap();
        assert_ne!(first_epoch, second_epoch);
        assert_eq!(
            state
                .unblock_contact("alice-session", "bob-fp")
                .unwrap_err(),
            StateError::ContactUnavailable,
        );
        assert_eq!(
            state
                .add_contact("alice-session", "bob-fp", "again".into())
                .unwrap_err(),
            StateError::ContactUnavailable,
        );
        assert_eq!(
            state.cancel_contact("alice-session", "bob-fp").unwrap_err(),
            StateError::ContactUnavailable,
        );

        state.block_contact("alice-session", "bob-fp").unwrap();
        state.disconnect("alice-session");
        let registration = register(&mut state, "alice", "alice-fp", "alice-new");
        assert!(registration.deliveries.iter().any(|delivery| matches!(
            delivery.frame,
            ServerFrame::ContactState {
                active: false,
                ref fingerprint,
                ..
            } if fingerprint == "bob-fp"
        )));
    }

    #[test]
    fn unblock_cannot_create_a_relation() {
        let mut state = AppState::default();
        register(&mut state, "alice", "alice-fp", "alice-session");
        assert_eq!(
            state
                .unblock_contact("alice-session", "bob-fp")
                .unwrap_err(),
            StateError::ContactUnavailable,
        );
    }

    #[test]
    fn presence_and_messages_are_visible_only_in_active_relations() {
        let mut state = AppState::default();
        register(&mut state, "alice", "alice-fp", "alice-session");
        register(&mut state, "bob", "bob-fp", "bob-session");
        assert_eq!(
            state
                .route_message("alice-session", "bob-fp", "id".into(), "ciphertext".into())
                .unwrap_err(),
            StateError::ContactUnavailable,
        );
        match_contacts(&mut state);
        assert!(
            state
                .route_message("alice-session", "bob-fp", "id".into(), "ciphertext".into())
                .is_ok()
        );
        assert_eq!(
            state
                .route_message(
                    "alice-session",
                    "bob-fp",
                    "id".into(),
                    "x".repeat(60 * 1024 + 1),
                )
                .unwrap_err(),
            StateError::MessageTooLarge,
        );
        let deliveries = state.disconnect("bob-session");
        assert_eq!(deliveries.len(), 1);
        assert!(matches!(
            deliveries[0].frame,
            ServerFrame::PresenceChanged { online: false, .. }
        ));
        assert_eq!(
            state
                .route_message("alice-session", "bob-fp", "id".into(), "ciphertext".into())
                .unwrap_err(),
            StateError::ContactUnavailable,
        );
    }

    #[test]
    fn rate_limits_close_after_repeated_violations() {
        let mut state = AppState::default();
        register(&mut state, "alice", "alice-fp", "alice-session");
        let now = Instant::now();
        for _ in 0..10 {
            state
                .check_rate("alice-session", RateKind::Message, now)
                .unwrap();
        }
        for close in [false, false, true] {
            assert_eq!(
                state.check_rate("alice-session", RateKind::Message, now),
                Err(StateError::RateLimited { close }),
            );
        }

        let mut contact_rate = AppState::default();
        register(&mut contact_rate, "alice", "alice-fp", "alice-session");
        for _ in 0..10 {
            contact_rate
                .check_rate("alice-session", RateKind::Contact, now)
                .unwrap();
        }
        assert_eq!(
            contact_rate.check_rate("alice-session", RateKind::Contact, now),
            Err(StateError::RateLimited { close: false }),
        );

        let mut contacts = AppState::default();
        register(&mut contacts, "alice", "alice-fp", "alice-session");
        for index in 0..20 {
            contacts
                .add_contact(
                    "alice-session",
                    &format!("target-{index}"),
                    index.to_string(),
                )
                .unwrap();
        }
        for close in [false, false, true] {
            assert_eq!(
                contacts
                    .add_contact("alice-session", "target-overflow", "overflow".into())
                    .unwrap_err(),
                StateError::RateLimited { close },
            );
        }
    }
}
