import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalIdentity } from '../identity';

class FakePeerSession {
  static instances: FakePeerSession[] = [];

  peerNickname = 'bob';
  ready = false;
  freed = false;
  outbound: string | undefined = 'offer';

  constructor() {
    FakePeerSession.instances.push(this);
  }

  static start = () => new FakePeerSession();
  static answer = () => new FakePeerSession();

  completeSignature = () => {
    this.ready = true;
    this.outbound = 'answer';
  };
  decrypt = () =>
    JSON.stringify({ message_id: 'm1', created_at: 7, text: 'ciao' });
  encrypt = (text: string) => `encrypted:${text}`;
  free = () => {
    this.freed = true;
  };
  receiveHandshake = () => undefined;
  signaturePayload = () => new Uint8Array([1]);
  takeOutbound = () => {
    const outbound = this.outbound;
    this.outbound = undefined;
    return outbound;
  };
}

vi.mock('../generated/tacitus_protocol', () => ({
  PeerSession: FakePeerSession,
}));
vi.mock('../identity', () => ({
  identityDocument: vi.fn(() => ({})),
  sign: vi.fn(async () => new Uint8Array([2])),
}));

const identity: LocalIdentity = {
  native: false,
  nickname: 'alice',
  publicKey: new Uint8Array([1]),
  tacitusId: '00000-00000-00000-00000-000000',
};

describe('Secure sessions', () => {
  beforeEach(() => {
    FakePeerSession.instances = [];
  });

  it('owns handshake, encryption and native resource cleanup', async () => {
    const handshakes: string[] = [];
    const { createSecureSessions } = await import('./secureSessions');
    const sessions = createSecureSessions({
      sendHandshake: (_peerId, body) => handshakes.push(body),
    });
    const peerId = '10000-00000-00000-00000-000000';

    sessions.start(identity, peerId);
    expect(handshakes).toEqual(['offer']);

    const established = await sessions.receive(identity, peerId, 'answer');
    expect(established).toEqual({ nickname: 'bob', ready: true });
    expect(handshakes).toEqual(['offer', 'answer']);
    expect(sessions.encrypt(peerId, 'ciao', 7)).toBe('encrypted:ciao');
    expect(sessions.decrypt(peerId, 'ciphertext')).toEqual({
      message_id: 'm1',
      created_at: 7,
      text: 'ciao',
    });

    sessions.drop(peerId);
    expect(FakePeerSession.instances[0].freed).toBe(true);
    expect(sessions.isReady(peerId)).toBe(false);
  });
});
