import { expect, it } from 'vitest';
import { parseTacitusId } from '../../../domain/tacitusId';
import { CONTACT_FIELDS, contactField } from '../contactField';

it('assegna a ogni Contatto un campo colore stabile tra quelli del tema', () => {
  // Given
  const alice = parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');

  // When
  const field = contactField(alice);

  // Then
  expect(field).toBe(contactField(alice));
  expect(Number.isInteger(field)).toBe(true);
  expect(field).toBeGreaterThanOrEqual(0);
  expect(field).toBeLessThan(CONTACT_FIELDS);
});
