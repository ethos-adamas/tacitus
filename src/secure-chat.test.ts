import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateKey } from 'openpgp'
import type { MessageContent } from './domain'
import {
  decryptMessage,
  encryptMessage,
  importContactKey,
  importIdentityKeys,
  saveLocalData,
  type IdentityKeys,
} from './secure-chat'

type ArmoredPair = { publicKey: string; privateKey: string }

let alicePair: ArmoredPair
let bobPair: ArmoredPair
let evePair: ArmoredPair
let alice: IdentityKeys
let bob: IdentityKeys
let storedValues: Map<string, string>

beforeEach(() => {
  storedValues = new Map()
  vi.stubGlobal('localStorage', {
    get length() { return storedValues.size },
    clear: () => storedValues.clear(),
    getItem: (key: string) => storedValues.get(key) ?? null,
    key: (index: number) => [...storedValues.keys()][index] ?? null,
    removeItem: (key: string) => storedValues.delete(key),
    setItem: (key: string, value: string) => storedValues.set(key, value),
  } satisfies Storage)
})

afterEach(() => vi.unstubAllGlobals())

beforeAll(async () => {
  [alicePair, bobPair, evePair] = await Promise.all([
    generateKey({ userIDs: [{ name: 'Alice', email: 'alice@example.test' }] }),
    generateKey({ userIDs: [{ name: 'Bob', email: 'bob@example.test' }] }),
    generateKey({ userIDs: [{ name: 'Eve', email: 'eve@example.test' }] }),
  ])
  alice = await importIdentityKeys(alicePair.publicKey, alicePair.privateKey, '')
  bob = await importIdentityKeys(bobPair.publicKey, bobPair.privateKey, '')
}, 30_000)

describe('importazione OpenPGP', () => {
  it('accetta una coppia valida e rifiuta una coppia non corrispondente', async () => {
    expect(alice.fingerprint).toHaveLength(40)
    await expect(importIdentityKeys(alicePair.publicKey, bobPair.privateKey, '')).rejects.toThrow(
      'non appartengono alla stessa identità',
    )
  })

  it('importa e rende persistibile la chiave pubblica di un contatto', async () => {
    const contactKey = await importContactKey(bobPair.publicKey)
    const identity = {
      nickname: 'alice',
      publicKey: alicePair.publicKey,
      fingerprint: alice.fingerprint,
    }
    const contact = Object.assign({
      id: 'bob',
      currentFingerprint: contactKey.fingerprint,
      keys: [contactKey],
      status: 'inactive' as const,
      online: false,
      blocked: false,
      unread: 0,
      nextSequence: 1,
      highestReceivedSequence: 0,
      receivedMessageIds: [],
      conversation: [],
    }, {
      privateKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----',
      passphrase: 'non-salvare',
      plaintext: 'segreto in chiaro',
    })
    saveLocalData(identity, [contact])
    const serialized = [...storedValues.values()].join('\n')

    expect(serialized).toContain(contactKey.fingerprint)
    expect(serialized).toContain('BEGIN PGP PUBLIC KEY BLOCK')
    expect(serialized).not.toContain('PRIVATE KEY')
    expect(serialized).not.toContain('non-salvare')
    expect(serialized).not.toContain('segreto in chiaro')
  })
})

describe('messaggio cifrato', () => {
  const content = (): MessageContent => ({
    v: 1,
    message_id: crypto.randomUUID(),
    relationship_epoch: 'test-epoch',
    sequence: 1,
    from_fingerprint: alice.fingerprint,
    to_fingerprint: bob.fingerprint,
    created_at: '2026-08-19T12:00:00.000Z',
    text: 'segreto condiviso',
  })

  it('firma, cifra per entrambi e verifica il round trip', async () => {
    const original = content()
    const ciphertext = await encryptMessage(
      original,
      alice.publicKey,
      alice.privateKey,
      bobPair.publicKey,
    )

    await expect(decryptMessage(ciphertext, bob.privateKey, [alicePair.publicKey])).resolves.toEqual(original)
    await expect(decryptMessage(ciphertext, alice.privateKey, [alicePair.publicKey])).resolves.toEqual(original)
  })

  it('rifiuta una firma non valida o una chiave non importata', async () => {
    const ciphertext = await encryptMessage(
      content(),
      alice.publicKey,
      alice.privateKey,
      bobPair.publicKey,
    )

    await expect(decryptMessage(ciphertext, bob.privateKey, [evePair.publicKey])).rejects.toThrow()
    await expect(decryptMessage(ciphertext, bob.privateKey, [])).rejects.toThrow()
  })

  it('rifiuta una firma storica che dichiara il fingerprint corrente', async () => {
    const forged = { ...content(), from_fingerprint: bob.fingerprint }
    const ciphertext = await encryptMessage(
      forged,
      alice.publicKey,
      alice.privateKey,
      bobPair.publicKey,
    )

    await expect(
      decryptMessage(ciphertext, bob.privateKey, [alicePair.publicKey, bobPair.publicKey]),
    ).rejects.toThrow('fingerprint dichiarato')
  })
})
