import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LocalIdentity } from '../../identity/identityProvider';
import { parseTacitusId } from '../../../domain/tacitusId';

class FakePeerSession {
  static instances: FakePeerSession[] = [];
  static decrypted = JSON.stringify({
    message_id: 'm1',
    created_at: 7,
    text: 'ciao',
  });
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
  decrypt = () => FakePeerSession.decrypted;
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

vi.mock('../../../generated/tacitus_protocol', () => ({
  PeerSession: FakePeerSession,
}));
vi.mock('../../identity/identityProvider', () => ({
  identityDocument: vi.fn(() => ({})),
  sign: vi.fn(async () => new Uint8Array([2])),
}));

const identity: LocalIdentity = {
  provider: 'native',
  nickname: 'alice',
  publicKey: new Uint8Array([1]),
  tacitusId: parseTacitusId('00000-00000-00000-00000-000000'),
};

describe('Sessioni sicure', () => {
  beforeEach(() => {
    FakePeerSession.instances = [];
    FakePeerSession.decrypted = JSON.stringify({
      message_id: 'm1',
      created_at: 7,
      text: 'ciao',
    });
  });

  it('possiede handshake, cifratura e rilascio delle risorse native', async () => {
    // Given
    const handshakes: string[] = [];
    const { createSessioniSicure } = await import('../sessioniSicure');
    const sessions = createSessioniSicure((_peerId, body) =>
      handshakes.push(body),
    );
    const peerId = parseTacitusId('10000-00000-00000-00000-000000');

    // When
    sessions.avvia(identity, peerId);
    const established = await sessions.ricevi(identity, peerId, 'answer');
    const encrypted = sessions.cifra(peerId, 'ciao', 7);
    const decrypted = sessions.decifra(peerId, 'ciphertext');
    sessions.elimina(peerId);

    // Then
    expect(handshakes).toEqual(['offer', 'answer']);
    expect(established).toEqual({ nickname: 'bob', pronta: true });
    expect(encrypted).toBe('encrypted:ciao');
    expect(decrypted).toEqual({
      message_id: 'm1',
      created_at: 7,
      text: 'ciao',
    });
    expect(FakePeerSession.instances[0].freed).toBe(true);
  });

  it('rifiuta un Messaggio decifrato con struttura non valida', async () => {
    // Given
    const { createSessioniSicure } = await import('../sessioniSicure');
    const sessions = createSessioniSicure(() => undefined);
    const peerId = parseTacitusId('10000-00000-00000-00000-000000');
    sessions.avvia(identity, peerId);
    await sessions.ricevi(identity, peerId, 'answer');
    FakePeerSession.decrypted = JSON.stringify({
      text: 'senza identificativo',
    });

    // When
    const decrypt = () => sessions.decifra(peerId, 'ciphertext');

    // Then
    expect(decrypt).toThrow('Messaggio decifrato non valido.');
  });
});

it('una firma sospesa non ripristina né elimina una nuova Sessione dopo la disconnessione', async () => {
  // Given
  const { sign } = await import('../../identity/identityProvider');
  let complete!: (signature: Uint8Array) => void;
  vi.mocked(sign).mockImplementationOnce(
    () =>
      new Promise(resolve => {
        complete = resolve;
      }),
  );
  const { createSessioniSicure } = await import('../sessioniSicure');
  const send = vi.fn();
  const sessions = createSessioniSicure(send);
  const peerId = parseTacitusId('10000-00000-00000-00000-000000');
  sessions.avvia(identity, peerId);
  const old = sessions.ricevi(identity, peerId, 'answer');
  // When
  sessions.eliminaTutte();
  sessions.avvia(identity, peerId);
  await sessions.ricevi(identity, peerId, 'answer');
  send.mockClear();
  complete(new Uint8Array([2]));
  const result = await old;
  // Then
  expect(result.pronta).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(sessions.pronta(peerId)).toBe(true);
});
