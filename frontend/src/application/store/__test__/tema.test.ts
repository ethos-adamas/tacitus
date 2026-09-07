import { describe, expect, it } from 'vitest';
import {
  sceltaTemaCambiata,
  temaDiSistemaCambiato,
  temaReducer,
} from '../temaSlice';

describe('stato del tema', () => {
  it('aggiorna il sistema solo per la scelta system', () => {
    // Given
    const initial = { scelta: 'system' as const, effettivo: 'light' as const };

    // When
    const followingSystem = temaReducer(initial, temaDiSistemaCambiato('dark'));
    const explicit = temaReducer(
      temaReducer(
        initial,
        sceltaTemaCambiata({ scelta: 'retro', effettivo: 'retro' }),
      ),
      temaDiSistemaCambiato('light'),
    );

    // Then
    expect(followingSystem.effettivo).toBe('dark');
    expect(explicit).toEqual({ scelta: 'retro', effettivo: 'retro' });
  });
});
