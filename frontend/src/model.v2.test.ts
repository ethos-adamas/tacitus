import { describe, expect, it } from 'vitest'
import { addMessage, createContact, matchContact, normalizeTacitusId, resetContactConnection } from './domain'

describe('modello client V2', () => {
  it('normalizza il Tacitus ID Crockford e rifiuta codici incompleti', () => {
    expect(normalizeTacitusId('2g2dx-6p175-0pj6e-q37t0-q94yjc')).toBe('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC')
    expect(() => normalizeTacitusId('ABC')).toThrow()
  })

  it('mantiene la Conversazione quando una nuova Sessione protegge la Relazione', () => {
    const pending = createContact('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC')
    const withHistory = addMessage(pending, {
      id: 'one', direction: 'incoming', text: 'prima', createdAt: 1,
    })
    const matched = matchContact(withHistory, 'alice', true)
    const reconnected = matchContact({ ...matched, secure: false }, 'alice', true)
    expect(reconnected.messages).toEqual(withHistory.messages)
    expect(reconnected.secure).toBe(false)
  })

  it('azzera lo stato volatile del Contatto senza perdere la Conversazione', () => {
    const contact = matchContact(createContact('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC'), 'alice', true)
    const disconnected = resetContactConnection(addMessage(contact, {
      id: 'one', direction: 'incoming', text: 'resta', createdAt: 1,
    }))
    expect(disconnected).toMatchObject({
      pending: false, reactivationRequired: true, online: false, secure: false,
    })
    expect(disconnected.messages[0]?.text).toBe('resta')
  })
})
