import { describe, expect, it } from 'vitest'
import { decryptSnapshot, encryptSnapshot } from './storage'

describe('snapshot locale cifrato', () => {
  it('round trip e rifiuto della manomissione', async () => {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const encrypted = await encryptSnapshot(key, { contacts: [{ id: 'segreto' }] })
    await expect(decryptSnapshot(key, encrypted)).resolves.toEqual({ contacts: [{ id: 'segreto' }] })
    encrypted.ciphertext[0] ^= 1
    await expect(decryptSnapshot(key, encrypted)).rejects.toThrow()
  })
})
