import { PeerSession } from '../../generated/tacitus_protocol';
import {
  identityDocument,
  sign,
  type LocalIdentity,
} from '../identity/identityProvider';
import type { TacitusId } from '../../domain/tacitusId';

export type MessaggioDecifrato = {
  message_id: string;
  created_at: number;
  text: string;
};

export type GestoreSessioniSicure = {
  cifra: (tacitusId: TacitusId, testo: string, creatoIl: number) => string;
  decifra: (tacitusId: TacitusId, body: string) => MessaggioDecifrato;
  elimina: (tacitusId: TacitusId) => void;
  eliminaTutte: () => void;
  pronta: (tacitusId: TacitusId) => boolean;
  ricevi: (
    identita: LocalIdentity,
    tacitusId: TacitusId,
    body: string,
  ) => Promise<{ nickname?: string; pronta: boolean }>;
  avvia: (identita: LocalIdentity, tacitusId: TacitusId) => void;
};

const parseMessaggioDecifrato = (value: string): MessaggioDecifrato => {
  const parsed: unknown = JSON.parse(value);
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('message_id' in parsed) ||
    typeof parsed.message_id !== 'string' ||
    !('created_at' in parsed) ||
    typeof parsed.created_at !== 'number' ||
    !Number.isFinite(parsed.created_at) ||
    !('text' in parsed) ||
    typeof parsed.text !== 'string'
  ) {
    throw new Error('Messaggio decifrato non valido.');
  }
  return {
    message_id: parsed.message_id,
    created_at: parsed.created_at,
    text: parsed.text,
  };
};

export const createSessioniSicure = (
  inviaHandshake: (tacitusId: TacitusId, body: string) => void,
): GestoreSessioniSicure => {
  const sessioni = new Map<TacitusId, PeerSession>();

  const elimina = (tacitusId: TacitusId) => {
    sessioni.get(tacitusId)?.free();
    sessioni.delete(tacitusId);
  };

  const eliminaTutte = () => {
    sessioni.forEach(sessione => sessione.free());
    sessioni.clear();
  };

  const inviaInUscita = (tacitusId: TacitusId, sessione: PeerSession) => {
    const body = sessione.takeOutbound();
    if (body) inviaHandshake(tacitusId, body);
  };

  const avvia = (identita: LocalIdentity, tacitusId: TacitusId) => {
    if (identita.tacitusId >= tacitusId || sessioni.has(tacitusId)) return;
    const sessione = PeerSession.start(identityDocument(identita), tacitusId);
    sessioni.set(tacitusId, sessione);
    inviaInUscita(tacitusId, sessione);
  };

  const ricevi = async (
    identita: LocalIdentity,
    tacitusId: TacitusId,
    body: string,
  ) => {
    try {
      let sessione = sessioni.get(tacitusId);
      if (!sessione) {
        if (JSON.parse(body).type !== 'offer') {
          throw new Error('Offerta di handshake mancante.');
        }
        sessione = PeerSession.answer(
          identityDocument(identita),
          tacitusId,
          body,
        );
        sessioni.set(tacitusId, sessione);
      } else {
        sessione.receiveHandshake(body);
      }
      const payload = sessione.signaturePayload();
      if (payload) sessione.completeSignature(await sign(identita, payload));
      inviaInUscita(tacitusId, sessione);
      return { nickname: sessione.peerNickname, pronta: sessione.ready };
    } catch (reason) {
      elimina(tacitusId);
      throw reason;
    }
  };

  const pronta = (tacitusId: TacitusId) =>
    sessioni.get(tacitusId)?.ready === true;

  const cifra = (tacitusId: TacitusId, testo: string, creatoIl: number) => {
    const sessione = sessioni.get(tacitusId);
    if (!sessione?.ready) throw new Error('Sessione sicura assente.');
    return sessione.encrypt(testo, BigInt(creatoIl));
  };

  const decifra = (tacitusId: TacitusId, body: string) => {
    const sessione = sessioni.get(tacitusId);
    if (!sessione?.ready) throw new Error('Sessione sicura assente.');
    return parseMessaggioDecifrato(sessione.decrypt(body));
  };

  return { avvia, cifra, decifra, elimina, eliminaTutte, pronta, ricevi };
};
