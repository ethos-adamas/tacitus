use serde::Serialize;
use std::collections::{HashMap, HashSet};
use tacitus_protocol::parse_tacitus_id;
use tokio::sync::{mpsc, watch};

const MAX_PENDING_CONTACTS: usize = 20;
const MAX_RELAY_BODY_BYTES: usize = 48 * 1024;

#[derive(Clone, Debug)]
pub struct SessionChannel {
    id: String,
    frames: mpsc::UnboundedSender<ServerFrame>,
    close: watch::Sender<bool>,
}

impl SessionChannel {
    pub fn new(
        id: String,
    ) -> (
        Self,
        mpsc::UnboundedReceiver<ServerFrame>,
        watch::Receiver<bool>,
    ) {
        let (frames, receiver) = mpsc::unbounded_channel();
        let (close, close_receiver) = watch::channel(false);
        (Self { id, frames, close }, receiver, close_receiver)
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn send(&self, frame: ServerFrame) -> Result<(), StateError> {
        self.frames
            .send(frame)
            .map_err(|_| StateError::ContactUnavailable)
    }

    fn close(&self) {
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
        tacitus_id: String,
    },
    #[serde(rename = "contact.pending")]
    ContactPending {
        v: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        tacitus_id: String,
    },
    #[serde(rename = "contact.matched")]
    ContactMatched {
        v: u8,
        tacitus_id: String,
        nickname: String,
        online: bool,
    },
    #[serde(rename = "contact.state")]
    ContactState {
        v: u8,
        tacitus_id: String,
        active: bool,
    },
    #[serde(rename = "contact.removed")]
    ContactRemoved {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "presence.changed")]
    PresenceChanged {
        v: u8,
        tacitus_id: String,
        online: bool,
    },
    #[serde(rename = "handshake.sent")]
    HandshakeSent { v: u8, request_id: String },
    #[serde(rename = "handshake.received")]
    HandshakeReceived {
        v: u8,
        from_id: String,
        body: String,
    },
    #[serde(rename = "message.sent")]
    MessageSent { v: u8, request_id: String },
    #[serde(rename = "message.received")]
    MessageReceived {
        v: u8,
        from_id: String,
        body: String,
    },
    #[serde(rename = "error")]
    Error {
        v: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        code: &'static str,
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PayloadKind {
    Handshake,
    Message,
}

#[derive(Clone, Debug)]
pub struct Delivery {
    recipient: SessionChannel,
    frame: ServerFrame,
}

impl Delivery {
    fn new(recipient: SessionChannel, frame: ServerFrame) -> Self {
        Self { recipient, frame }
    }
    pub fn send(self) -> Result<(), StateError> {
        self.recipient.send(self.frame)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StateError {
    InvalidRequest,
    AuthenticationFailed,
    IdentityCollision,
    ContactUnavailable,
    TooManyContacts,
    PayloadTooLarge,
}

impl StateError {
    pub fn code(self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid_request",
            Self::AuthenticationFailed => "authentication_failed",
            Self::IdentityCollision => "identity_collision",
            Self::ContactUnavailable => "contact_unavailable",
            Self::TooManyContacts => "too_many_contacts",
            Self::PayloadTooLarge => "payload_too_large",
        }
    }
}

#[derive(Default)]
pub struct AppState {
    identities: HashMap<String, Identity>,
    identity_by_session: HashMap<String, String>,
    intents: HashSet<Intent>,
    relations: HashSet<Pair>,
}

struct Identity {
    nickname: String,
    public_key: Vec<u8>,
    session: Option<SessionChannel>,
    disconnected_session: Option<String>,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct Intent {
    session_id: String,
    from: String,
    to: String,
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct Pair(String, String);

impl Pair {
    fn new(first: &str, second: &str) -> Self {
        if first <= second {
            Self(first.to_owned(), second.to_owned())
        } else {
            Self(second.to_owned(), first.to_owned())
        }
    }

    fn other<'a>(&'a self, identity: &str) -> Option<&'a str> {
        if self.0 == identity {
            Some(&self.1)
        } else if self.1 == identity {
            Some(&self.0)
        } else {
            None
        }
    }
}

impl AppState {
    pub fn register(
        &mut self,
        tacitus_id: &str,
        nickname: &str,
        public_key: Vec<u8>,
        session: SessionChannel,
    ) -> Result<Vec<Delivery>, StateError> {
        parse_tacitus_id(tacitus_id).map_err(|_| StateError::AuthenticationFailed)?;
        if let Some(identity) = self.identities.get_mut(tacitus_id) {
            if identity.public_key != public_key || identity.nickname != nickname {
                return Err(StateError::IdentityCollision);
            }
            if let Some(replaced) = identity.session.replace(session.clone()) {
                self.identity_by_session.remove(replaced.id());
                self.intents
                    .retain(|intent| intent.session_id != replaced.id());
                replaced.close();
            }
            identity.disconnected_session = None;
        } else {
            self.identities.insert(
                tacitus_id.to_owned(),
                Identity {
                    nickname: nickname.to_owned(),
                    public_key,
                    session: Some(session.clone()),
                    disconnected_session: None,
                },
            );
        }
        self.identity_by_session
            .insert(session.id().to_owned(), tacitus_id.to_owned());

        let mut deliveries = Vec::new();
        for pair in &self.relations {
            let Some(peer_id) = pair.other(tacitus_id) else {
                continue;
            };
            let Some(peer) = self.identities.get(peer_id) else {
                continue;
            };
            deliveries.push(Delivery::new(
                session.clone(),
                ServerFrame::ContactMatched {
                    v: 2,
                    tacitus_id: peer_id.to_owned(),
                    nickname: peer.nickname.clone(),
                    online: peer.session.is_some(),
                },
            ));
            if let Some(peer_session) = &peer.session {
                deliveries.push(Delivery::new(
                    peer_session.clone(),
                    ServerFrame::PresenceChanged {
                        v: 2,
                        tacitus_id: tacitus_id.to_owned(),
                        online: true,
                    },
                ));
            }
        }
        Ok(deliveries)
    }

    pub fn unregister(&mut self, session_id: &str) -> Vec<Delivery> {
        let Some(tacitus_id) = self.identity_by_session.remove(session_id) else {
            return Vec::new();
        };
        let Some(identity) = self.identities.get_mut(&tacitus_id) else {
            return Vec::new();
        };
        if identity.session.as_ref().map(SessionChannel::id) != Some(session_id) {
            return Vec::new();
        }
        identity.session = None;
        identity.disconnected_session = Some(session_id.to_owned());
        self.intents
            .retain(|intent| intent.session_id != session_id);
        self.relations
            .iter()
            .filter_map(|pair| pair.other(&tacitus_id))
            .filter_map(|peer_id| {
                self.identities
                    .get(peer_id)
                    .and_then(|peer| peer.session.clone())
            })
            .map(|recipient| {
                Delivery::new(
                    recipient,
                    ServerFrame::PresenceChanged {
                        v: 2,
                        tacitus_id: tacitus_id.clone(),
                        online: false,
                    },
                )
            })
            .collect()
    }

    pub fn expire_disconnect(&mut self, tacitus_id: &str, session_id: &str) -> Vec<Delivery> {
        let Some(identity) = self.identities.get_mut(tacitus_id) else {
            return Vec::new();
        };
        if identity.session.is_some()
            || identity.disconnected_session.as_deref() != Some(session_id)
        {
            return Vec::new();
        }
        identity.disconnected_session = None;

        let relations = self
            .relations
            .iter()
            .filter(|pair| pair.other(tacitus_id).is_some())
            .cloned()
            .collect::<Vec<_>>();
        let mut deliveries = Vec::new();
        for relation in relations {
            self.relations.remove(&relation);
            let Some(peer_id) = relation.other(tacitus_id).map(str::to_owned) else {
                continue;
            };
            let Some(peer_session) = self
                .identities
                .get(&peer_id)
                .and_then(|peer| peer.session.clone())
            else {
                continue;
            };
            self.intents.insert(Intent {
                session_id: peer_session.id().to_owned(),
                from: peer_id,
                to: tacitus_id.to_owned(),
            });
            deliveries.push(Delivery::new(
                peer_session,
                ServerFrame::ContactPending {
                    v: 2,
                    request_id: None,
                    tacitus_id: tacitus_id.to_owned(),
                },
            ));
        }
        deliveries
    }

    pub fn add_contact(
        &mut self,
        session_id: &str,
        request_id: &str,
        target_id: &str,
    ) -> Result<Vec<Delivery>, StateError> {
        parse_tacitus_id(target_id).map_err(|_| StateError::InvalidRequest)?;
        let from_id = self.identity_for_session(session_id)?.to_owned();
        if from_id == target_id {
            return Err(StateError::InvalidRequest);
        }
        let pair = Pair::new(&from_id, target_id);
        if self.relations.contains(&pair) {
            return self.relation_snapshot(session_id, target_id);
        }
        if self
            .intents
            .iter()
            .filter(|intent| intent.session_id == session_id)
            .count()
            >= MAX_PENDING_CONTACTS
        {
            return Err(StateError::TooManyContacts);
        }
        self.intents.insert(Intent {
            session_id: session_id.to_owned(),
            from: from_id.clone(),
            to: target_id.to_owned(),
        });
        let reverse = self.intents.iter().any(|intent| {
            intent.from == target_id
                && intent.to == from_id
                && self
                    .identity_by_session
                    .get(&intent.session_id)
                    .is_some_and(|identity| identity == target_id)
        });
        if !reverse {
            return Ok(vec![Delivery::new(
                self.session(session_id)?,
                ServerFrame::ContactPending {
                    v: 2,
                    request_id: Some(request_id.to_owned()),
                    tacitus_id: target_id.to_owned(),
                },
            )]);
        }
        self.relations.insert(pair);
        self.intents.retain(|intent| {
            !((intent.from == from_id && intent.to == target_id)
                || (intent.from == target_id && intent.to == from_id))
        });
        let own = self
            .identities
            .get(&from_id)
            .ok_or(StateError::ContactUnavailable)?;
        let peer = self
            .identities
            .get(target_id)
            .ok_or(StateError::ContactUnavailable)?;
        let own_session = own.session.clone().ok_or(StateError::ContactUnavailable)?;
        let peer_session = peer.session.clone().ok_or(StateError::ContactUnavailable)?;
        Ok(vec![
            Delivery::new(
                own_session,
                ServerFrame::ContactMatched {
                    v: 2,
                    tacitus_id: target_id.to_owned(),
                    nickname: peer.nickname.clone(),
                    online: true,
                },
            ),
            Delivery::new(
                peer_session,
                ServerFrame::ContactMatched {
                    v: 2,
                    tacitus_id: from_id,
                    nickname: own.nickname.clone(),
                    online: true,
                },
            ),
        ])
    }

    pub fn cancel_contact(
        &mut self,
        session_id: &str,
        request_id: &str,
        target_id: &str,
    ) -> Result<Vec<Delivery>, StateError> {
        parse_tacitus_id(target_id).map_err(|_| StateError::InvalidRequest)?;
        let from_id = self.identity_for_session(session_id)?.to_owned();
        self.intents.retain(|intent| {
            !(intent.session_id == session_id && intent.from == from_id && intent.to == target_id)
        });
        Ok(vec![
            Delivery::new(
                self.session(session_id)?,
                ServerFrame::ContactState {
                    v: 2,
                    tacitus_id: target_id.to_owned(),
                    active: false,
                },
            ),
            Delivery::new(
                self.session(session_id)?,
                ServerFrame::ContactRemoved {
                    v: 2,
                    request_id: request_id.to_owned(),
                    tacitus_id: target_id.to_owned(),
                },
            ),
        ])
    }

    pub fn remove_contact(
        &mut self,
        session_id: &str,
        request_id: &str,
        target_id: &str,
    ) -> Result<Vec<Delivery>, StateError> {
        parse_tacitus_id(target_id).map_err(|_| StateError::InvalidRequest)?;
        let from_id = self.identity_for_session(session_id)?.to_owned();
        self.relations.remove(&Pair::new(&from_id, target_id));
        self.intents.retain(|intent| {
            !((intent.from == from_id && intent.to == target_id)
                || (intent.from == target_id && intent.to == from_id))
        });
        let mut deliveries = vec![Delivery::new(
            self.session(session_id)?,
            ServerFrame::ContactRemoved {
                v: 2,
                request_id: request_id.to_owned(),
                tacitus_id: target_id.to_owned(),
            },
        )];
        if let Some(peer) = self
            .identities
            .get(target_id)
            .and_then(|identity| identity.session.clone())
        {
            deliveries.push(Delivery::new(
                peer,
                ServerFrame::ContactState {
                    v: 2,
                    tacitus_id: from_id,
                    active: false,
                },
            ));
        }
        Ok(deliveries)
    }

    pub fn route(
        &self,
        session_id: &str,
        request_id: &str,
        target_id: &str,
        kind: PayloadKind,
        body: String,
    ) -> Result<Vec<Delivery>, StateError> {
        if body.is_empty() || body.len() > MAX_RELAY_BODY_BYTES {
            return Err(StateError::PayloadTooLarge);
        }
        let from_id = self.identity_for_session(session_id)?;
        if !self.relations.contains(&Pair::new(from_id, target_id)) {
            return Err(StateError::ContactUnavailable);
        }
        let sender = self.session(session_id)?;
        let recipient = self
            .identities
            .get(target_id)
            .and_then(|identity| identity.session.clone())
            .ok_or(StateError::ContactUnavailable)?;
        let (ack, received) = match kind {
            PayloadKind::Handshake => (
                ServerFrame::HandshakeSent {
                    v: 2,
                    request_id: request_id.to_owned(),
                },
                ServerFrame::HandshakeReceived {
                    v: 2,
                    from_id: from_id.to_owned(),
                    body,
                },
            ),
            PayloadKind::Message => (
                ServerFrame::MessageSent {
                    v: 2,
                    request_id: request_id.to_owned(),
                },
                ServerFrame::MessageReceived {
                    v: 2,
                    from_id: from_id.to_owned(),
                    body,
                },
            ),
        };
        Ok(vec![
            Delivery::new(sender, ack),
            Delivery::new(recipient, received),
        ])
    }

    pub fn is_online(&self, tacitus_id: &str) -> bool {
        self.identities
            .get(tacitus_id)
            .is_some_and(|identity| identity.session.is_some())
    }

    fn relation_snapshot(
        &self,
        session_id: &str,
        target_id: &str,
    ) -> Result<Vec<Delivery>, StateError> {
        let peer = self
            .identities
            .get(target_id)
            .ok_or(StateError::ContactUnavailable)?;
        Ok(vec![Delivery::new(
            self.session(session_id)?,
            ServerFrame::ContactMatched {
                v: 2,
                tacitus_id: target_id.to_owned(),
                nickname: peer.nickname.clone(),
                online: peer.session.is_some(),
            },
        )])
    }

    fn identity_for_session(&self, session_id: &str) -> Result<&str, StateError> {
        self.identity_by_session
            .get(session_id)
            .map(String::as_str)
            .ok_or(StateError::AuthenticationFailed)
    }

    fn session(&self, session_id: &str) -> Result<SessionChannel, StateError> {
        let identity = self.identity_for_session(session_id)?;
        self.identities
            .get(identity)
            .and_then(|identity| identity.session.clone())
            .ok_or(StateError::AuthenticationFailed)
    }
}
