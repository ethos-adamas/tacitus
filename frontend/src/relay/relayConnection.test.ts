import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalIdentity } from '../identity';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => false }));
vi.mock('../identity', () => ({
  authenticationSignature: vi.fn(async () => new Uint8Array([3])),
  toBase64Url: (value: Uint8Array) => String(value[0]),
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
  native: false,
  nickname: 'alice',
  publicKey: new Uint8Array([1]),
  tacitusId: '00000-00000-00000-00000-000000',
};

const flushEvents = () => new Promise(resolve => setTimeout(resolve));

describe('Relay connection', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    FakeWebSocket.instances = [];
  });

  it('hides connection state and V2 wire frames behind its interface', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.stubGlobal('location', {
      host: 'localhost:5173',
      protocol: 'http:',
    });
    const states: string[] = [];
    const events: Record<string, unknown>[] = [];
    const { createRelayConnection } = await import('./relayConnection');
    const relay = createRelayConnection({
      onDisconnected: vi.fn(),
      onError: vi.fn(),
      onEvent: event => {
        events.push(event);
      },
      onStateChanged: state => states.push(state),
    });

    relay.connect(identity);
    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe('ws://localhost:5173/ws');
    expect(states).toEqual(['connecting']);

    socket.onmessage?.({ data: JSON.stringify({ v: 2, type: 'auth.ready' }) });
    socket.onmessage?.({
      data: JSON.stringify({ v: 2, type: 'contact.pending' }),
    });
    await flushEvents();
    relay.send('contact.add', { tacitus_id: identity.tacitusId });

    expect(states).toEqual(['connecting', 'online']);
    expect(events).toEqual([{ v: 2, type: 'contact.pending' }]);
    expect(JSON.parse(socket.sent[0])).toMatchObject({
      v: 2,
      type: 'contact.add',
      tacitus_id: identity.tacitusId,
    });
  });
});
