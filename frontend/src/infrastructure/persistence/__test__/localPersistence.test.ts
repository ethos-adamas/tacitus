import { describe, expect, it } from 'vitest';
import {
  decryptSnapshot,
  encryptSnapshot,
  parsePersistedState,
} from '../localPersistence';

const ALICE_ID = '2G2DX-6P175-0PJ6E-Q37T0-Q94YJC';

describe('snapshot locale cifrato', () => {
  it('rifiuta uno snapshot manomesso', async () => {
    // Given
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const encrypted = await encryptSnapshot(key, { value: 'segreto' });

    // When
    const decrypted = await decryptSnapshot(key, encrypted);
    encrypted.ciphertext[0] ^= 1;

    // Then
    expect(decrypted).toEqual({ value: 'segreto' });
    await expect(decryptSnapshot(key, encrypted)).rejects.toThrow();
  });

  it('accetta soltanto uno snapshot conforme al modello persistito', () => {
    // Given
    const snapshot = {
      conversazioni: {
        idConversazioneAttiva: ALICE_ID,
        perContatto: {
          [ALICE_ID]: {
            tacitusId: ALICE_ID,
            bozza: '',
            messaggi: [],
            nonLetti: 0,
          },
        },
      },
      relazioni: {
        intenti: {},
        contatti: {
          [ALICE_ID]: { tacitusId: ALICE_ID, nickname: 'alice' },
        },
        relazioni: {
          [ALICE_ID]: { tacitusId: ALICE_ID, stato: 'attiva' },
        },
      },
    };

    // When
    const parsed = parsePersistedState(snapshot);
    const parseInvalid = () =>
      parsePersistedState({
        ...snapshot,
        conversazioni: {
          perContatto: {
            [ALICE_ID]: {
              ...snapshot.conversazioni.perContatto[ALICE_ID],
              nonLetti: -1,
            },
          },
        },
      });

    // Then
    expect(parsed.conversazioni).toEqual({
      perContatto: snapshot.conversazioni.perContatto,
    });
    expect(parseInvalid).toThrow('Dati locali non validi.');
  });
});
