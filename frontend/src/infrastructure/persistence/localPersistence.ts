import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ConversazioniState } from '../../application/store/conversazioniSlice';
import type { RelazioniState } from '../../application/store/relazioniSlice';
import type { Conversazione } from '../../domain/conversazioni';
import type { Messaggio } from '../../domain/messaggi';
import type {
  Contatto,
  IntentoDiContatto,
  Relazione,
} from '../../domain/relazioni';
import { parseTacitusId, type TacitusId } from '../../domain/tacitusId';
import { fromBase64Url, toBase64Url } from '../encoding/base64Url';
import type { LocalIdentity } from '../identity/identityProvider';

const DATABASE = 'tacitus-v3';
const LEGACY_DATABASE = 'tacitus-v2';
const VERSION = 1;
const IDENTITY_STORE = 'identity';
const SNAPSHOT_STORE = 'snapshot';
const STORAGE_VERSION_KEY = 'tacitus.storage.version';
const SNAPSHOT_AAD = new TextEncoder().encode('tacitus/local-snapshot/v3');

export type PersistedState = {
  conversazioni: Pick<ConversazioniState, 'perContatto'>;
  relazioni: RelazioniState;
};

export type EncryptedSnapshot = {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
};

type StoredSnapshot = EncryptedSnapshot | { native: string };

let pendingSave = Promise.resolve();

const bytes = (value: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(value);

export const encryptSnapshot = async (
  key: CryptoKey,
  value: unknown,
): Promise<EncryptedSnapshot> => {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: SNAPSHOT_AAD },
    key,
    plaintext,
  );
  return { nonce, ciphertext: new Uint8Array(ciphertext) };
};

export const decryptSnapshot = async (
  key: CryptoKey,
  value: EncryptedSnapshot,
): Promise<unknown> => {
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: bytes(value.nonce),
      additionalData: SNAPSHOT_AAD,
    },
    key,
    bytes(value.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext));
};

const invalidData = (): never => {
  throw new Error('Dati locali non validi.');
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const record = (value: unknown): Record<string, unknown> => {
  if (!isRecord(value)) {
    return invalidData();
  }
  return value;
};

const string = (value: unknown): string =>
  typeof value === 'string' ? value : invalidData();

const number = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : invalidData();

const entriesByTacitusId = <T>(
  value: unknown,
  parse: (value: Record<string, unknown>, tacitusId: TacitusId) => T,
): Record<TacitusId, T> => {
  const result: Record<TacitusId, T> = {};
  Object.entries(record(value)).forEach(([key, item]) => {
    const tacitusId = parseTacitusId(key);
    result[tacitusId] = parse(record(item), tacitusId);
  });
  return result;
};

const parseMessage = (value: unknown): Messaggio => {
  const item = record(value);
  const direzione = item.direzione;
  if (direzione !== 'ricevuto' && direzione !== 'inviato') return invalidData();
  return {
    id: string(item.id),
    direzione,
    testo: string(item.testo),
    creatoIl: number(item.creatoIl),
  };
};

const parseConversation = (
  value: Record<string, unknown>,
  tacitusId: TacitusId,
): Conversazione => {
  if (parseTacitusId(string(value.tacitusId)) !== tacitusId) {
    return invalidData();
  }
  if (!Array.isArray(value.messaggi)) return invalidData();
  const nonLetti = number(value.nonLetti);
  if (!Number.isInteger(nonLetti) || nonLetti < 0) return invalidData();
  return {
    tacitusId,
    bozza: string(value.bozza),
    messaggi: value.messaggi.map(parseMessage),
    nonLetti,
  };
};

export const parsePersistedState = (value: unknown): PersistedState => {
  const snapshot = record(value);
  const conversazioni = record(snapshot.conversazioni);
  const relazioni = record(snapshot.relazioni);
  return {
    conversazioni: {
      perContatto: entriesByTacitusId(
        conversazioni.perContatto,
        parseConversation,
      ),
    },
    relazioni: {
      intenti: entriesByTacitusId<IntentoDiContatto>(
        relazioni.intenti,
        (item, tacitusId) => {
          if (parseTacitusId(string(item.tacitusId)) !== tacitusId) {
            return invalidData();
          }
          return { tacitusId };
        },
      ),
      contatti: entriesByTacitusId<Contatto>(
        relazioni.contatti,
        (item, tacitusId) => {
          if (parseTacitusId(string(item.tacitusId)) !== tacitusId) {
            return invalidData();
          }
          return { tacitusId, nickname: string(item.nickname) };
        },
      ),
      relazioni: entriesByTacitusId<Relazione>(
        relazioni.relazioni,
        (item, tacitusId) => {
          if (parseTacitusId(string(item.tacitusId)) !== tacitusId) {
            return invalidData();
          }
          const stato = item.stato;
          if (stato !== 'attiva' && stato !== 'da-riattivare') {
            return invalidData();
          }
          return { tacitusId, stato };
        },
      ),
    },
  };
};

const parseLocalIdentity = (value: unknown): LocalIdentity => {
  const identity = record(value);
  const provider = identity.provider;
  const base = {
    nickname: string(identity.nickname),
    tacitusId: parseTacitusId(string(identity.tacitusId)),
    publicKey:
      identity.publicKey instanceof Uint8Array
        ? new Uint8Array(identity.publicKey)
        : invalidData(),
  };
  if (provider === 'native') return { ...base, provider };
  if (
    provider !== 'browser' ||
    typeof CryptoKey === 'undefined' ||
    !(identity.privateKey instanceof CryptoKey) ||
    !(identity.storageKey instanceof CryptoKey)
  ) {
    return invalidData();
  }
  return {
    ...base,
    provider,
    privateKey: identity.privateKey,
    storageKey: identity.storageKey,
  };
};

const parseEncryptedSnapshot = (value: unknown): EncryptedSnapshot => {
  const snapshot = record(value);
  if (
    !(snapshot.nonce instanceof Uint8Array) ||
    !(snapshot.ciphertext instanceof Uint8Array)
  ) {
    return invalidData();
  }
  return {
    nonce: new Uint8Array(snapshot.nonce),
    ciphertext: new Uint8Array(snapshot.ciphertext),
  };
};

const openDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(IDENTITY_STORE)) {
        request.result.createObjectStore(IDENTITY_STORE);
        request.result.createObjectStore(SNAPSHOT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const request = <T>(operation: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });

const deleteDatabase = (name: string): Promise<void> =>
  new Promise((resolve, reject) => {
    const deletion = indexedDB.deleteDatabase(name);
    deletion.onsuccess = () => resolve();
    deletion.onerror = () => reject(deletion.error);
    deletion.onblocked = () => reject(new Error('Database locale occupato.'));
  });

export const resetLegacyData = async (): Promise<void> => {
  if (localStorage.getItem(STORAGE_VERSION_KEY) === '3') return;
  if (isTauri()) await invoke('plugin:identity|delete');
  await deleteDatabase(LEGACY_DATABASE);
  localStorage.removeItem('tacitus.theme');
  localStorage.removeItem('tacitus.notifications');
  localStorage.removeItem('tacitus.notifications.denied');
  localStorage.setItem(STORAGE_VERSION_KEY, '3');
};

export const loadIdentity = async (): Promise<LocalIdentity | undefined> => {
  const database = await openDatabase();
  try {
    const value = await request(
      database
        .transaction(IDENTITY_STORE)
        .objectStore(IDENTITY_STORE)
        .get('current'),
    );
    if (!value) return undefined;
    return parseLocalIdentity(value);
  } finally {
    database.close();
  }
};

export const saveIdentity = async (identity: LocalIdentity): Promise<void> => {
  const database = await openDatabase();
  try {
    await request(
      database
        .transaction(IDENTITY_STORE, 'readwrite')
        .objectStore(IDENTITY_STORE)
        .put(identity, 'current'),
    );
  } finally {
    database.close();
  }
};

export const loadState = async (
  identity: LocalIdentity,
): Promise<PersistedState | undefined> => {
  const database = await openDatabase();
  try {
    const encrypted = await request(
      database
        .transaction(SNAPSHOT_STORE)
        .objectStore(SNAPSHOT_STORE)
        .get('current'),
    );
    if (!encrypted) return undefined;
    if (identity.provider === 'native') {
      const stored = record(encrypted);
      const response = await invoke<{ value: string }>('plugin:identity|open', {
        payload: { value: string(stored.native) },
      });
      return parsePersistedState(
        JSON.parse(new TextDecoder().decode(fromBase64Url(response.value))),
      );
    }
    return parsePersistedState(
      await decryptSnapshot(
        identity.storageKey,
        parseEncryptedSnapshot(encrypted),
      ),
    );
  } finally {
    database.close();
  }
};

export const saveState = async (
  identity: LocalIdentity,
  state: PersistedState,
): Promise<void> => {
  let encrypted: StoredSnapshot;
  if (identity.provider === 'native') {
    const plaintext = new TextEncoder().encode(JSON.stringify(state));
    const response = await invoke<{ value: string }>('plugin:identity|seal', {
      payload: { value: toBase64Url(plaintext) },
    });
    encrypted = { native: response.value };
  } else {
    encrypted = await encryptSnapshot(identity.storageKey, state);
  }
  const database = await openDatabase();
  try {
    await request(
      database
        .transaction(SNAPSHOT_STORE, 'readwrite')
        .objectStore(SNAPSHOT_STORE)
        .put(encrypted, 'current'),
    );
  } finally {
    database.close();
  }
};

export const enqueueStateSave = (
  identity: LocalIdentity,
  state: PersistedState,
): Promise<void> => {
  pendingSave = pendingSave
    .catch(() => undefined)
    .then(() => saveState(identity, state));
  return pendingSave;
};

export const clearLocalData = async (): Promise<void> => {
  await pendingSave.catch(() => undefined);
  if (isTauri()) await invoke('plugin:identity|delete');
  await deleteDatabase(DATABASE);
  localStorage.clear();
};
