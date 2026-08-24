import type { TacitusId } from '../../domain/tacitusId';
import { parseTacitusId } from '../../domain/tacitusId';

export type RelayFrame =
  | { tipo: 'autenticazione-richiesta'; nonce: string }
  | {
      tipo: 'autenticazione-completata';
      nickname: string;
      tacitusId: TacitusId;
    }
  | { tipo: 'errore'; codice: string; richiesta?: string }
  | { tipo: 'conferma'; richiesta: string }
  | { tipo: 'intento-confermato'; tacitusId: TacitusId }
  | {
      tipo: 'contatto-associato';
      tacitusId: TacitusId;
      nickname: string;
      online: boolean;
    }
  | { tipo: 'relazione-cambiata'; tacitusId: TacitusId; attiva: boolean }
  | { tipo: 'contatto-rimosso'; tacitusId: TacitusId }
  | { tipo: 'presenza-cambiata'; tacitusId: TacitusId; online: boolean }
  | { tipo: 'handshake-ricevuto'; tacitusId: TacitusId; body: string }
  | { tipo: 'messaggio-ricevuto'; tacitusId: TacitusId; body: string };

const invalidFrame = () => new Error('Frame ricevuto non valido.');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const recordOf = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) throw invalidFrame();
  return value;
};

const stringOf = (record: Record<string, unknown>, field: string): string => {
  const value = record[field];
  if (typeof value !== 'string') throw invalidFrame();
  return value;
};

const booleanOf = (record: Record<string, unknown>, field: string): boolean => {
  const value = record[field];
  if (typeof value !== 'boolean') throw invalidFrame();
  return value;
};

const optionalStringOf = (
  record: Record<string, unknown>,
  field: string,
): string | undefined => {
  const value = record[field];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw invalidFrame();
  return value;
};

const tacitusIdOf = (
  record: Record<string, unknown>,
  field: string,
): TacitusId => parseTacitusId(stringOf(record, field));

const parseRecord = (record: Record<string, unknown>): RelayFrame => {
  if (record.v !== 3) throw invalidFrame();
  switch (stringOf(record, 'type')) {
    case 'auth.challenge':
      return {
        tipo: 'autenticazione-richiesta',
        nonce: stringOf(record, 'nonce'),
      };
    case 'auth.ready':
      return {
        tipo: 'autenticazione-completata',
        nickname: stringOf(record, 'nickname'),
        tacitusId: tacitusIdOf(record, 'tacitus_id'),
      };
    case 'error': {
      return {
        tipo: 'errore',
        codice: stringOf(record, 'code'),
        richiesta: optionalStringOf(record, 'request_id'),
      };
    }
    case 'handshake.sent':
    case 'message.sent':
    case 'contact.blocked':
    case 'contact.unblocked':
      const richiesta = stringOf(record, 'request_id');
      if (
        record.type === 'contact.blocked' ||
        record.type === 'contact.unblocked'
      ) {
        tacitusIdOf(record, 'tacitus_id');
      }
      return { tipo: 'conferma', richiesta };
    case 'contact.pending':
      optionalStringOf(record, 'request_id');
      return {
        tipo: 'intento-confermato',
        tacitusId: tacitusIdOf(record, 'tacitus_id'),
      };
    case 'contact.matched':
      return {
        tipo: 'contatto-associato',
        tacitusId: tacitusIdOf(record, 'tacitus_id'),
        nickname: stringOf(record, 'nickname'),
        online: booleanOf(record, 'online'),
      };
    case 'contact.state':
      return {
        tipo: 'relazione-cambiata',
        tacitusId: tacitusIdOf(record, 'tacitus_id'),
        attiva: booleanOf(record, 'active'),
      };
    case 'contact.removed':
      stringOf(record, 'request_id');
      return {
        tipo: 'contatto-rimosso',
        tacitusId: tacitusIdOf(record, 'tacitus_id'),
      };
    case 'presence.changed':
      return {
        tipo: 'presenza-cambiata',
        tacitusId: tacitusIdOf(record, 'tacitus_id'),
        online: booleanOf(record, 'online'),
      };
    case 'handshake.received':
      return {
        tipo: 'handshake-ricevuto',
        tacitusId: tacitusIdOf(record, 'from_id'),
        body: stringOf(record, 'body'),
      };
    case 'message.received':
      return {
        tipo: 'messaggio-ricevuto',
        tacitusId: tacitusIdOf(record, 'from_id'),
        body: stringOf(record, 'body'),
      };
    default:
      throw invalidFrame();
  }
};

export const parseRelayFrame = (value: string): RelayFrame => {
  try {
    return parseRecord(recordOf(JSON.parse(value)));
  } catch {
    throw invalidFrame();
  }
};
