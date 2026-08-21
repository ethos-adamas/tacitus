import { describe, expect, it } from 'vitest';
import { parseTacitusId } from '../tacitusId';

describe('Tacitus ID', () => {
  it('normalizza Crockford e rifiuta codici incompleti', () => {
    // Given
    const id = '2g2dx-6p175-0pj6e-q37t0-q94yjc';

    // When
    const normalized = parseTacitusId(id);

    // Then
    expect(normalized).toBe('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');
    expect(() => parseTacitusId('ABC')).toThrow();
  });
});
