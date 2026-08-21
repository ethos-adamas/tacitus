import { isTauri } from '@tauri-apps/api/core';
import {
  authenticationSignature,
  toBase64Url,
  type LocalIdentity,
} from '../identity';

export type RelayEvent = Record<string, unknown>;
type RelayState = 'connecting' | 'online';

type RelayConnectionOptions = {
  onDisconnected: () => void;
  onError: (message: string) => void;
  onEvent: (event: RelayEvent, identity: LocalIdentity) => Promise<void> | void;
  onStateChanged: (state: RelayState) => void;
};

export type RelayConnection = {
  close: () => void;
  connect: (identity: LocalIdentity) => void;
  send: (type: string, fields: Record<string, unknown>) => void;
};

const errorLabels: Record<string, string> = {
  authentication_failed: 'Autenticazione fallita.',
  contact_unavailable: 'Il contatto non è disponibile.',
  identity_collision: 'Collisione del Tacitus ID: crea una nuova Identità.',
  invalid_request: 'Richiesta non valida.',
  payload_too_large: 'Payload troppo grande.',
  too_many_contacts: 'Troppi Intenti di contatto aperti.',
};

const socketUrl = () =>
  import.meta.env.VITE_RELAY_URL ??
  (isTauri()
    ? 'wss://tacitus.ethos-adamas.it/ws'
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);

export const createRelayConnection = ({
  onDisconnected,
  onError,
  onEvent,
  onStateChanged,
}: RelayConnectionOptions): RelayConnection => {
  let currentIdentity: LocalIdentity | undefined;
  let reconnectTimer: number | undefined;
  let receiveQueue = Promise.resolve();
  let socket: WebSocket | undefined;

  const send = (type: string, fields: Record<string, unknown>) => {
    if (socket?.readyState !== WebSocket.OPEN) {
      throw new Error('Connessione non disponibile.');
    }
    socket.send(
      JSON.stringify({
        v: 2,
        type,
        request_id: crypto.randomUUID(),
        ...fields,
      }),
    );
  };

  const handleEvent = async (event: RelayEvent, identity: LocalIdentity) => {
    const type = String(event.type ?? '');
    if (type === 'auth.challenge' && typeof event.nonce === 'string') {
      const signature = await authenticationSignature(identity, event.nonce);
      if (currentIdentity !== identity) return;
      socket?.send(
        JSON.stringify({
          v: 2,
          type: 'auth.respond',
          nickname: identity.nickname,
          public_key: toBase64Url(identity.publicKey),
          signature: toBase64Url(signature),
        }),
      );
      return;
    }
    if (type === 'auth.ready') {
      onStateChanged('online');
      return;
    }
    if (type === 'error') {
      onError(
        errorLabels[String(event.code)] ??
          'Il server ha rifiutato la richiesta.',
      );
      return;
    }
    await onEvent(event, identity);
  };

  const connect = (identity: LocalIdentity) => {
    currentIdentity = identity;
    clearTimeout(reconnectTimer);
    socket?.close();
    onDisconnected();
    onStateChanged('connecting');

    const nextSocket = new WebSocket(socketUrl());
    socket = nextSocket;
    nextSocket.onmessage = ({ data }) => {
      receiveQueue = receiveQueue
        .then(() =>
          handleEvent(JSON.parse(String(data)) as RelayEvent, identity),
        )
        .catch(() => onError('Frame ricevuto non valido.'));
    };
    nextSocket.onerror = () => onError('Connessione al server non riuscita.');
    nextSocket.onclose = () => {
      if (socket !== nextSocket) return;
      onDisconnected();
      if (currentIdentity === identity) {
        reconnectTimer = window.setTimeout(() => connect(identity), 2_000);
      }
    };
  };

  const close = () => {
    currentIdentity = undefined;
    clearTimeout(reconnectTimer);
    const currentSocket = socket;
    socket = undefined;
    currentSocket?.close();
    onDisconnected();
  };

  return { close, connect, send };
};
