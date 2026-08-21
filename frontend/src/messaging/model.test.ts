import { describe, expect, it } from 'vitest';
import { normalizeTacitusId } from './model';

describe('Tacitus ID', () => {
  it('normalizza Crockford e rifiuta codici incompleti', () => {
    expect(normalizeTacitusId('2g2dx-6p175-0pj6e-q37t0-q94yjc')).toBe(
      '2G2DX-6P175-0PJ6E-Q37T0-Q94YJC',
    );
    expect(() => normalizeTacitusId('ABC')).toThrow();
  });
});
