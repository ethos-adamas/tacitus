import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseTacitusId } from '../../../domain/tacitusId';
import type { LocalIdentity } from '../../identity/identityProvider';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('../../identity/identityProvider', () => ({
  authenticationSignature: vi.fn(async () => new Uint8Array([3])),
}));

class FakeWebSocket {
  static readonly OPEN = 1;
  static instances: FakeWebSocket[] = [];
  onclose?: () => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  readonly url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  close = () => {
    this.readyState = 3;
  };
  send = (body: string) => {
    this.sent.push(body);
  };
}

const identity: LocalIdentity = {
  provider: 'native',
  nickname: 'alice',
  publicKey: new Uint8Array([1]),
  tacitusId: parseTacitusId('00000-00000-00000-00000-000000'),
};

const flushEvents = () => new Promise(resolve => setTimeout(resolve));

describe('Connessione Relay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWebSocket.instances = [];
  });

  it('nasconde WebSocket e frame wire dietro comandi ed eventi tipizzati', async () => {
    // Given
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('location', {
      host: 'localhost:5173',
      protocol: 'http:',
    });
    const states: string[] = [];
    const frames: unknown[] = [];
    const { createRelayConnection } = await import('../relayConnection');
    const relay = createRelayConnection({
      onDisconnected: vi.fn(),
      onError: vi.fn(),
      onFrame: frame => frames.push(frame),
      onStateChanged: state => states.push(state),
    });

    // When
    relay.connect(identity, []);
    const socket = FakeWebSocket.instances[0];
    socket.onmessage?.({
      data: JSON.stringify({
        v: 3,
        type: 'auth.challenge',
        nonce: 'challenge',
      }),
    });
    await flushEvents();
    socket.onmessage?.({
      data: JSON.stringify({
        v: 3,
        type: 'auth.ready',
        nickname: identity.nickname,
        tacitus_id: identity.tacitusId,
      }),
    });
    socket.onmessage?.({
      data: JSON.stringify({
        v: 3,
        type: 'contact.pending',
        tacitus_id: identity.tacitusId,
      }),
    });
    await flushEvents();
    relay.aggiungiContatto(identity.tacitusId);

    // Then
    expect(socket.url).toBe('ws://localhost:5173/ws');
    expect(states).toEqual(['connecting', 'online']);
    expect(frames).toEqual([
      { tipo: 'intento-confermato', tacitusId: identity.tacitusId },
    ]);
    expect(socket.sent.map(value => JSON.parse(value).type)).toEqual([
      'auth.respond',
      'contact.blocks.sync',
      'contact.add',
    ]);
    expect(JSON.parse(socket.sent[2])).toMatchObject({
      v: 3,
      type: 'contact.add',
      tacitus_id: identity.tacitusId,
    });
  });
});
