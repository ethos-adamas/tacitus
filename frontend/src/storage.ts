import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Contact } from './messaging/model';
import { fromBase64Url, toBase64Url } from './identity/base64Url';
import type { LocalIdentity } from './identity/identityProvider';

const DATABASE = 'tacitus-v2';
const VERSION = 1;
const IDENTITY_STORE = 'identity';
const SNAPSHOT_STORE = 'snapshot';
const SNAPSHOT_AAD = new TextEncoder().encode('tacitus/local-snapshot/v2');

export type EncryptedSnapshot = { nonce: Uint8Array; ciphertext: Uint8Array };
type StoredSnapshot = EncryptedSnapshot | { native: string };

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

export const decryptSnapshot = async <T>(
  key: CryptoKey,
  value: EncryptedSnapshot,
): Promise<T> => {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: bytes(value.nonce), additionalData: SNAPSHOT_AAD },
    key,
    bytes(value.ciphertext),
  );
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
};

const openDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
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
};

const request = <T>(operation: IDBRequest<T>): Promise<T> => {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
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
    const identity = value as LocalIdentity;
    return { ...identity, publicKey: new Uint8Array(identity.publicKey) };
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

export const loadContacts = async (
  identity: LocalIdentity,
): Promise<Contact[]> => {
  const database = await openDatabase();
  try {
    const encrypted = await request(
      database
        .transaction(SNAPSHOT_STORE)
        .objectStore(SNAPSHOT_STORE)
        .get('current'),
    );
    if (!encrypted) return [];
    if (identity.native) {
      const response = await invoke<{ value: string }>('plugin:identity|open', {
        payload: { value: (encrypted as { native: string }).native },
      });
      return (
        JSON.parse(new TextDecoder().decode(fromBase64Url(response.value))) as {
          contacts: Contact[];
        }
      ).contacts;
    }
    if (!identity.storageKey) throw new Error('Chiave locale assente.');
    return (
      await decryptSnapshot<{ contacts: Contact[] }>(
        identity.storageKey,
        encrypted as EncryptedSnapshot,
      )
    ).contacts;
  } finally {
    database.close();
  }
};

export const saveContacts = async (
  identity: LocalIdentity,
  contacts: Contact[],
): Promise<void> => {
  let encrypted: StoredSnapshot;
  if (identity.native) {
    const plaintext = new TextEncoder().encode(JSON.stringify({ contacts }));
    const response = await invoke<{ value: string }>('plugin:identity|seal', {
      payload: { value: toBase64Url(plaintext) },
    });
    encrypted = { native: response.value };
  } else {
    if (!identity.storageKey) throw new Error('Chiave locale assente.');
    encrypted = await encryptSnapshot(identity.storageKey, { contacts });
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

export const clearLocalData = async (): Promise<void> => {
  if (isTauri()) await invoke('plugin:identity|delete');
  const database = await openDatabase();
  try {
    const transaction = database.transaction(
      [IDENTITY_STORE, SNAPSHOT_STORE],
      'readwrite',
    );
    transaction.objectStore(IDENTITY_STORE).clear();
    transaction.objectStore(SNAPSHOT_STORE).clear();
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};
