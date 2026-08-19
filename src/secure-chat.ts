import {
  createMessage,
  decrypt,
  decryptKey,
  encrypt,
  readKey,
  readMessage,
  readPrivateKey,
  sign,
  type PrivateKey,
  type PublicKey,
} from 'openpgp'
import type { Contact, ContactKey, MessagePayload } from './domain'

const IDENTITY_KEY = 'secret-chat.identity.v1'
const DATA_PREFIX = 'secret-chat.data.v1.'
const MAX_ARMORED_KEY_BYTES = 32 * 1024

export type IdentityKeys = {
  fingerprint: string
  userIds: string[]
  publicKey: PublicKey
  privateKey: PrivateKey
}

export type StoredIdentity = {
  nickname: string
  publicKey: string
  fingerprint: string
}

async function assertUsableKey(key: PublicKey) {
  if (await key.isRevoked()) throw new Error('La chiave è revocata.')
  const expiration = await key.getExpirationTime()
  if (expiration instanceof Date && expiration <= new Date()) {
    throw new Error('La chiave è scaduta.')
  }
  await key.getSigningKey()
  await key.getEncryptionKey()
}

function assertKeySize(armoredKey: string) {
  if (new TextEncoder().encode(armoredKey).byteLength > MAX_ARMORED_KEY_BYTES) {
    throw new Error('La chiave supera il limite di 32 KiB.')
  }
}

export async function importIdentityKeys(
  publicArmoredKey: string,
  privateArmoredKey: string,
  passphrase: string,
): Promise<IdentityKeys> {
  assertKeySize(publicArmoredKey)
  assertKeySize(privateArmoredKey)
  const publicKey = await readKey({ armoredKey: publicArmoredKey.trim() })
  if (publicKey.isPrivate()) throw new Error('Inserisci una chiave pubblica nel campo pubblico.')
  await assertUsableKey(publicKey)

  let privateKey = await readPrivateKey({ armoredKey: privateArmoredKey.trim() })
  if (!privateKey.isDecrypted()) {
    privateKey = await decryptKey({ privateKey, passphrase })
  }
  await assertUsableKey(privateKey)
  if (publicKey.getFingerprint() !== privateKey.getFingerprint()) {
    throw new Error('Chiave pubblica e privata non appartengono alla stessa identità.')
  }

  return {
    fingerprint: publicKey.getFingerprint(),
    userIds: publicKey.getUserIDs(),
    publicKey,
    privateKey,
  }
}

export async function importContactKey(publicArmoredKey: string): Promise<ContactKey> {
  assertKeySize(publicArmoredKey)
  const key = await readKey({ armoredKey: publicArmoredKey.trim() })
  if (key.isPrivate()) throw new Error('Importa soltanto la chiave pubblica del contatto.')
  await assertUsableKey(key)
  return {
    fingerprint: key.getFingerprint(),
    publicKey: key.armor(),
    userIds: key.getUserIDs(),
  }
}

export async function signAuthentication(
  nickname: string,
  nonce: string,
  privateKey: PrivateKey,
) {
  const message = await createMessage({
    binary: new TextEncoder().encode(`secret-chat/auth/v1\n${nickname}\n${nonce}`),
  })
  const signature = await sign({ message, signingKeys: privateKey, detached: true, format: 'binary' })
  return btoa(String.fromCharCode(...signature))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
}

export async function encryptMessage(
  payload: MessagePayload,
  ownPublicKey: PublicKey,
  privateKey: PrivateKey,
  contactPublicKey: string,
) {
  const recipientKey = await readKey({ armoredKey: contactPublicKey })
  return encrypt({
    message: await createMessage({ text: JSON.stringify(payload) }),
    encryptionKeys: [recipientKey, ownPublicKey],
    signingKeys: privateKey,
    format: 'armored',
  })
}

export async function decryptMessage(
  ciphertext: string,
  privateKey: PrivateKey,
  verificationKeys: string[],
): Promise<MessagePayload> {
  const result = await decrypt({
    message: await readMessage({ armoredMessage: ciphertext }),
    decryptionKeys: privateKey,
    verificationKeys: await Promise.all(verificationKeys.map((armoredKey) => readKey({ armoredKey }))),
    expectSigned: true,
    format: 'utf8',
  })
  if (!result.signatures.length) throw new Error('Il messaggio non è firmato.')
  await Promise.all(result.signatures.map(({ verified }) => verified))
  const payload: unknown = JSON.parse(result.data)
  if (!payload || typeof payload !== 'object') throw new Error('Payload del messaggio non valido.')
  return payload as MessagePayload
}

export function loadStoredIdentity(): StoredIdentity | undefined {
  try {
    const value = localStorage.getItem(IDENTITY_KEY)
    return value ? (JSON.parse(value) as StoredIdentity) : undefined
  } catch {
    return undefined
  }
}

export function loadContacts(fingerprint: string): Contact[] {
  try {
    const value = localStorage.getItem(`${DATA_PREFIX}${fingerprint}`)
    return value ? (JSON.parse(value) as { contacts: Contact[] }).contacts : []
  } catch {
    return []
  }
}

export function saveLocalData(identity: StoredIdentity, contacts: Contact[]) {
  localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity))
  localStorage.setItem(`${DATA_PREFIX}${identity.fingerprint}`, JSON.stringify({ contacts }))
}

export function clearLocalData(fingerprint?: string) {
  localStorage.removeItem(IDENTITY_KEY)
  if (fingerprint) localStorage.removeItem(`${DATA_PREFIX}${fingerprint}`)
}

export function serializeLocalData(identity: StoredIdentity, contacts: Contact[]) {
  return JSON.stringify({ identity, contacts })
}
