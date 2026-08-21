import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { createIdentity, type LocalIdentity } from '../identity';
import {
  createRelayConnection,
  type RelayConnection,
  type RelayEvent,
} from '../relay/relayConnection';
import {
  createSecureSessions,
  type SecureSessions,
} from '../secure-session/secureSessions';
import {
  clearLocalData,
  loadContacts,
  loadIdentity,
  saveContacts,
  saveIdentity,
} from '../storage';
import { useAppDispatch, useAppSelector, useAppStore } from '../store';
import {
  contactDeactivated,
  contactDraftChanged,
  contactIntentRecorded,
  contactMatched,
  contactPresenceChanged,
  contactReactivationRequested,
  contactRemoved,
  contactSelected,
  conversationsLoaded,
  incomingMessageRecorded,
  outgoingMessageRecorded,
  relayConnecting,
  relayDisconnected,
  relayReady,
  secureSessionEstablished,
  selectContacts,
} from './messagingSlice';
import { MAX_MESSAGE_LENGTH, normalizeTacitusId, type Contact } from './model';

type UseMessagingOptions = {
  onError: (message: string) => void;
  onIncomingMessage: (tacitusId: string, onOpen: () => void) => void;
};

const relayTacitusId = (event: RelayEvent) => {
  if (typeof event.tacitus_id === 'string')
    return normalizeTacitusId(event.tacitus_id);
  if (typeof event.from_id === 'string')
    return normalizeTacitusId(event.from_id);
  return undefined;
};

export const useMessaging = ({
  onError,
  onIncomingMessage,
}: UseMessagingOptions) => {
  const dispatch = useAppDispatch();
  const appStore = useAppStore();
  const contacts = useAppSelector(selectContacts);
  const [identity, setIdentity] = useState<LocalIdentity>();
  const [loading, setLoading] = useState(true);
  const relayRef = useRef<RelayConnection | undefined>(undefined);
  const secureSessionsRef = useRef<SecureSessions | undefined>(undefined);
  const onErrorRef = useRef(onError);
  const onIncomingMessageRef = useRef(onIncomingMessage);

  const getContact = (tacitusId: string) =>
    selectContacts(appStore.getState()).find(
      contact => contact.tacitusId === tacitusId,
    );

  const selectContact = (tacitusId: string | undefined) => {
    dispatch(contactSelected(tacitusId));
  };

  const handleRelayEvent = async (
    event: RelayEvent,
    current: LocalIdentity,
  ) => {
    const type = String(event.type ?? '');
    const tacitusId = relayTacitusId(event);
    if (!tacitusId) return;

    if (type === 'contact.pending') {
      if (!getContact(tacitusId)) return;
      dispatch(contactIntentRecorded(tacitusId));
      return;
    }
    if (type === 'contact.matched' && typeof event.nickname === 'string') {
      const online = event.online === true;
      if (!getContact(tacitusId)) return;
      dispatch(contactMatched({ tacitusId, nickname: event.nickname, online }));
      if (online) secureSessionsRef.current?.start(current, tacitusId);
      return;
    }
    if (type === 'presence.changed' && typeof event.online === 'boolean') {
      dispatch(contactPresenceChanged({ tacitusId, online: event.online }));
      if (event.online) secureSessionsRef.current?.start(current, tacitusId);
      else secureSessionsRef.current?.drop(tacitusId);
      return;
    }
    if (type === 'contact.state' && event.active === false) {
      secureSessionsRef.current?.drop(tacitusId);
      dispatch(contactDeactivated(tacitusId));
      return;
    }
    if (type === 'contact.removed') {
      secureSessionsRef.current?.drop(tacitusId);
      dispatch(contactRemoved(tacitusId));
      return;
    }
    if (type === 'handshake.received' && typeof event.body === 'string') {
      const established = await secureSessionsRef.current?.receive(
        current,
        tacitusId,
        event.body,
      );
      if (established?.ready) {
        dispatch(
          secureSessionEstablished({
            tacitusId,
            nickname: established.nickname,
          }),
        );
      }
      return;
    }
    if (type === 'message.received' && typeof event.body === 'string') {
      const message = secureSessionsRef.current?.decrypt(tacitusId, event.body);
      if (!message) return;
      dispatch(
        incomingMessageRecorded({
          tacitusId,
          message: {
            id: message.message_id,
            direction: 'incoming',
            text: message.text,
            createdAt: message.created_at,
          },
        }),
      );
      onIncomingMessageRef.current(tacitusId, () => selectContact(tacitusId));
    }
  };
  const onRelayEvent = useEffectEvent(handleRelayEvent);

  const addContact = (code: string) => {
    const tacitusId = normalizeTacitusId(code);
    if (tacitusId === identity?.tacitusId) {
      throw new Error('Non puoi aggiungere la tua Identità.');
    }
    dispatch(contactIntentRecorded(tacitusId));
    relayRef.current?.send('contact.add', { tacitus_id: tacitusId });
  };

  const createLocalIdentity = async (nickname: string) => {
    const created = await createIdentity(nickname);
    await saveIdentity(created);
    setIdentity(created);
    dispatch(conversationsLoaded([]));
    relayRef.current?.connect(created);
  };

  const deleteLocalIdentity = async () => {
    relayRef.current?.close();
    secureSessionsRef.current?.clear();
    await clearLocalData();
    setIdentity(undefined);
  };

  const removeContact = (contact: Contact) => {
    secureSessionsRef.current?.drop(contact.tacitusId);
    relayRef.current?.send(
      contact.pending ? 'contact.cancel' : 'contact.remove',
      { tacitus_id: contact.tacitusId },
    );
    dispatch(contactRemoved(contact.tacitusId));
  };

  const reactivateContact = (contact: Contact) => {
    relayRef.current?.send('contact.add', { tacitus_id: contact.tacitusId });
    dispatch(contactReactivationRequested(contact.tacitusId));
  };

  const updateDraft = (contact: Contact, draft: string) => {
    dispatch(contactDraftChanged({ tacitusId: contact.tacitusId, draft }));
  };

  const sendMessage = (contact: Contact) => {
    const text = contact.draft.trim();
    const secureSessions = secureSessionsRef.current;
    if (
      !text ||
      text.length > MAX_MESSAGE_LENGTH ||
      !secureSessions?.isReady(contact.tacitusId) ||
      !contact.online
    )
      return;
    const createdAt = new Date().valueOf();
    const body = secureSessions.encrypt(contact.tacitusId, text, createdAt);
    relayRef.current?.send('message.send', { to_id: contact.tacitusId, body });
    dispatch(
      outgoingMessageRecorded({
        tacitusId: contact.tacitusId,
        message: {
          id: crypto.randomUUID(),
          direction: 'outgoing',
          text,
          createdAt,
        },
      }),
    );
  };

  useEffect(() => {
    const secureSessions = createSecureSessions({
      sendHandshake: (peerId, body) =>
        relayRef.current?.send('handshake.send', {
          to_id: peerId,
          body,
        }),
    });
    secureSessionsRef.current = secureSessions;
    const relay = createRelayConnection({
      onDisconnected: () => {
        secureSessions.clear();
        dispatch(relayDisconnected());
      },
      onError: message => onErrorRef.current(message),
      onEvent: onRelayEvent,
      onStateChanged: state => {
        if (state === 'connecting') dispatch(relayConnecting());
        if (state === 'online') dispatch(relayReady());
      },
    });
    relayRef.current = relay;

    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadIdentity();
        if (!stored) return;
        const savedContacts = await loadContacts(stored);
        if (cancelled) return;
        setIdentity(stored);
        dispatch(conversationsLoaded(savedContacts));
        relay.connect(stored);
      } catch {
        if (!cancelled) {
          onErrorRef.current(
            'I dati locali non possono essere decifrati. Cancella i dati per ripartire.',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      relay.close();
      relayRef.current = undefined;
      secureSessionsRef.current = undefined;
    };
  }, [dispatch]);

  useEffect(() => {
    onErrorRef.current = onError;
    onIncomingMessageRef.current = onIncomingMessage;
  }, [onError, onIncomingMessage]);

  useEffect(() => {
    if (!identity || loading) return;
    void saveContacts(identity, contacts).catch(() =>
      onErrorRef.current('Salvataggio locale non riuscito.'),
    );
  }, [contacts, identity, loading]);

  return {
    addContact,
    createIdentity: createLocalIdentity,
    deleteIdentity: deleteLocalIdentity,
    identity,
    loading,
    reactivateContact,
    removeContact,
    selectContact,
    sendMessage,
    updateDraft,
  };
};
