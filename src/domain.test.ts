import { describe, expect, it } from 'vitest'
import {
  acceptIncomingMessage,
  activateRelation,
  changeContactKey,
  createContact,
  type ContactKey,
  type MessagePayload,
} from './domain'
import { serializeLocalData } from './secure-chat'

const oldKey: ContactKey = {
  fingerprint: 'A'.repeat(40),
  publicKey: 'PUBLIC OLD',
  userIds: ['Alice <alice@example.test>'],
}
const newKey: ContactKey = {
  fingerprint: 'B'.repeat(40),
  publicKey: 'PUBLIC NEW',
  userIds: ['Alice <alice@example.test>'],
}

function incoming(overrides: Partial<MessagePayload> = {}): MessagePayload {
  return {
    v: 1,
    message_id: 'message-1',
    relationship_epoch: 'epoch-2',
    sequence: 1,
    from_fingerprint: newKey.fingerprint,
    to_fingerprint: 'C'.repeat(40),
    created_at: '2026-08-19T12:00:00.000Z',
    text: 'ciao',
    ...overrides,
  }
}

describe('relazione e conversazione', () => {
  it('sospende la relazione e unisce la cronologia quando cambia fingerprint', () => {
    const active = activateRelation(createContact(oldKey), 'alice', 'epoch-1')
    const changed = changeContactKey(active, newKey, '2026-08-19T12:00:00.000Z')

    expect(changed.status).toBe('inactive')
    expect(changed.relationshipEpoch).toBeUndefined()
    expect(changed.keys.map(({ fingerprint }) => fingerprint)).toEqual([
      newKey.fingerprint,
      oldKey.fingerprint,
    ])
    expect(changed.conversation).toEqual([{
      kind: 'fingerprint-changed',
      from: oldKey.fingerprint,
      to: newKey.fingerprint,
      createdAt: '2026-08-19T12:00:00.000Z',
    }])
  })

  it('rifiuta epoch precedente, sequenza e message_id duplicati', () => {
    const contact = activateRelation(createContact(newKey), 'alice', 'epoch-2')
    expect(() => acceptIncomingMessage(
      contact,
      'C'.repeat(40),
      incoming({ relationship_epoch: 'epoch-1' }),
    )).toThrow()

    const accepted = acceptIncomingMessage(contact, 'C'.repeat(40), incoming())
    expect(() => acceptIncomingMessage(accepted, 'C'.repeat(40), incoming({ message_id: 'message-2' }))).toThrow()
    expect(() => acceptIncomingMessage(accepted, 'C'.repeat(40), incoming({ message_id: 'message-1', sequence: 2 }))).toThrow()
  })

  it('serializza soltanto materiale pubblico e ciphertext', () => {
    const contact = createContact(oldKey)
    contact.conversation.push({
      kind: 'message',
      direction: 'incoming',
      messageId: 'message-1',
      ciphertext: '-----BEGIN PGP MESSAGE-----',
      createdAt: '2026-08-19T12:00:00.000Z',
    })
    const serialized = serializeLocalData({
      nickname: 'alice',
      publicKey: 'PUBLIC ALICE',
      fingerprint: 'C'.repeat(40),
    }, [contact])

    expect(serialized).toContain('PUBLIC ALICE')
    expect(serialized).toContain('BEGIN PGP MESSAGE')
    expect(serialized).not.toContain('PRIVATE KEY')
    expect(serialized).not.toContain('ciao in chiaro')
  })
})
