import { PeerSession } from '../generated/tacitus_protocol';
import { identityDocument, sign, type LocalIdentity } from '../identity';

export type DecryptedMessage = {
  message_id: string;
  created_at: number;
  text: string;
};

type SecureSessionEstablished = {
  nickname?: string;
  ready: boolean;
};

type SecureSessionsOptions = {
  sendHandshake: (peerId: string, body: string) => void;
};

export type SecureSessions = {
  clear: () => void;
  decrypt: (peerId: string, body: string) => DecryptedMessage;
  drop: (peerId: string) => void;
  encrypt: (peerId: string, text: string, createdAt: number) => string;
  isReady: (peerId: string) => boolean;
  receive: (
    identity: LocalIdentity,
    peerId: string,
    body: string,
  ) => Promise<SecureSessionEstablished>;
  start: (identity: LocalIdentity, peerId: string) => void;
};

export const createSecureSessions = ({
  sendHandshake,
}: SecureSessionsOptions): SecureSessions => {
  const sessions = new Map<string, PeerSession>();

  const drop = (peerId: string) => {
    sessions.get(peerId)?.free();
    sessions.delete(peerId);
  };

  const clear = () => {
    sessions.forEach(session => session.free());
    sessions.clear();
  };

  const sendOutbound = (peerId: string, session: PeerSession) => {
    const outbound = session.takeOutbound();
    if (outbound) sendHandshake(peerId, outbound);
  };

  const start = (identity: LocalIdentity, peerId: string) => {
    if (identity.tacitusId >= peerId || sessions.has(peerId)) return;
    const session = PeerSession.start(identityDocument(identity), peerId);
    sessions.set(peerId, session);
    sendOutbound(peerId, session);
  };

  const receive = async (
    identity: LocalIdentity,
    peerId: string,
    body: string,
  ): Promise<SecureSessionEstablished> => {
    try {
      let session = sessions.get(peerId);
      if (!session) {
        if (JSON.parse(body).type !== 'offer') {
          throw new Error('Offerta di handshake mancante.');
        }
        session = PeerSession.answer(identityDocument(identity), peerId, body);
        sessions.set(peerId, session);
      } else {
        session.receiveHandshake(body);
      }
      const payload = session.signaturePayload();
      if (payload) session.completeSignature(await sign(identity, payload));
      sendOutbound(peerId, session);
      return { nickname: session.peerNickname, ready: session.ready };
    } catch (reason) {
      drop(peerId);
      throw reason;
    }
  };

  const isReady = (peerId: string) => sessions.get(peerId)?.ready === true;

  const encrypt = (peerId: string, text: string, createdAt: number) => {
    const session = sessions.get(peerId);
    if (!session?.ready) throw new Error('Sessione sicura assente.');
    return session.encrypt(text, BigInt(createdAt));
  };

  const decrypt = (peerId: string, body: string) => {
    const session = sessions.get(peerId);
    if (!session?.ready) throw new Error('Sessione sicura assente.');
    return JSON.parse(session.decrypt(body)) as DecryptedMessage;
  };

  return { clear, decrypt, drop, encrypt, isReady, receive, start };
};
