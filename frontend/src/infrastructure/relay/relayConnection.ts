import { isTauri } from '@tauri-apps/api/core';
import type { TacitusId } from '../../domain/tacitusId';
import {
  authenticationSignature,
  type LocalIdentity,
} from '../identity/identityProvider';
import { toBase64Url } from '../encoding/base64Url';
import { parseRelayFrame, type RelayFrame } from './relayFrame';

type RelayState = 'connecting' | 'online';

type RelayConnectionOptions = {
  onDisconnected: () => void;
  onError: (message: string) => void;
  onFrame: (frame: Exclude<RelayFrame, { tipo: 'conferma' }>) => void;
  onStateChanged: (state: RelayState) => void;
};

export type RelayCommands = {
  aggiungiContatto: (tacitusId: TacitusId) => void;
  annullaIntento: (tacitusId: TacitusId) => void;
  bloccaContatto: (tacitusId: TacitusId) => void;
  rimuoviContatto: (tacitusId: TacitusId) => void;
  sbloccaContatto: (tacitusId: TacitusId) => void;
  inviaHandshake: (tacitusId: TacitusId, body: string) => void;
  inviaMessaggio: (tacitusId: TacitusId, body: string) => void;
};

export type RelayConnection = RelayCommands & {
  close: () => void;
  connect: (identity: LocalIdentity, blocchi: TacitusId[]) => void;
};

const errorLabels: Record<string, string> = {
  authentication_failed: 'Autenticazione fallita.',
  contact_unavailable: 'Il contatto non è disponibile.',
  identity_collision: 'Collisione del Tacitus ID: crea una nuova Identità.',
  invalid_request: 'Richiesta non valida.',
  payload_too_large: 'Dati inviati troppo grandi.',
  server_busy: 'Server temporaneamente occupato.',
  server_unavailable: 'Server temporaneamente non disponibile.',
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
  onFrame,
  onStateChanged,
}: RelayConnectionOptions): RelayConnection => {
  let currentIdentity: LocalIdentity | undefined;
  const currentBlocks = new Set<TacitusId>();
  let reconnectTimer: number | undefined;
  let receiveQueue = Promise.resolve();
  let socket: WebSocket | undefined;

  const send = (type: string, fields: Record<string, unknown>) => {
    if (socket?.readyState !== WebSocket.OPEN) {
      throw new Error('Connessione non disponibile.');
    }
    socket.send(
      JSON.stringify({
        v: 3,
        type,
        request_id: crypto.randomUUID(),
        ...fields,
      }),
    );
  };

  const handleFrame = async (value: string, identity: LocalIdentity) => {
    const frame = parseRelayFrame(value);
    if (frame.tipo === 'autenticazione-richiesta') {
      const signature = await authenticationSignature(identity, frame.nonce);
      if (currentIdentity !== identity || socket?.readyState !== WebSocket.OPEN)
        return;
      socket.send(
        JSON.stringify({
          v: 3,
          type: 'auth.respond',
          nickname: identity.nickname,
          public_key: toBase64Url(identity.publicKey),
          signature: toBase64Url(signature),
        }),
      );
      socket.send(
        JSON.stringify({
          v: 3,
          type: 'contact.blocks.sync',
          tacitus_ids: [...currentBlocks],
        }),
      );
      return;
    }
    if (frame.tipo === 'autenticazione-completata') {
      onStateChanged('online');
      return;
    }
    if (frame.tipo === 'errore') {
      onError(
        errorLabels[frame.codice] ?? 'Il server ha rifiutato la richiesta.',
      );
      return;
    }
    if (frame.tipo !== 'conferma') onFrame(frame);
  };

  const connect = (identity: LocalIdentity, blocchi: TacitusId[]) => {
    currentIdentity = identity;
    currentBlocks.clear();
    blocchi.forEach(tacitusId => currentBlocks.add(tacitusId));
    clearTimeout(reconnectTimer);
    socket?.close();
    onDisconnected();
    onStateChanged('connecting');

    const nextSocket = new WebSocket(socketUrl());
    socket = nextSocket;
    nextSocket.onmessage = ({ data }) => {
      receiveQueue = receiveQueue
        .then(() => handleFrame(String(data), identity))
        .catch(() => onError('Frame ricevuto non valido.'));
    };
    nextSocket.onerror = () => onError('Connessione al server non riuscita.');
    nextSocket.onclose = () => {
      if (socket !== nextSocket) return;
      onDisconnected();
      if (currentIdentity === identity) {
        reconnectTimer = window.setTimeout(
          () => connect(identity, [...currentBlocks]),
          2_000,
        );
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

  return {
    aggiungiContatto: tacitusId =>
      send('contact.add', { tacitus_id: tacitusId }),
    annullaIntento: tacitusId =>
      send('contact.cancel', { tacitus_id: tacitusId }),
    bloccaContatto: tacitusId => {
      currentBlocks.add(tacitusId);
      send('contact.block', { tacitus_id: tacitusId });
    },
    close,
    connect,
    inviaHandshake: (tacitusId, body) =>
      send('handshake.send', { to_id: tacitusId, body }),
    inviaMessaggio: (tacitusId, body) =>
      send('message.send', { to_id: tacitusId, body }),
    rimuoviContatto: tacitusId =>
      send('contact.remove', { tacitus_id: tacitusId }),
    sbloccaContatto: tacitusId => {
      currentBlocks.delete(tacitusId);
      send('contact.unblock', { tacitus_id: tacitusId });
    },
  };
};
