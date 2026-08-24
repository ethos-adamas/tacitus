import { describe, expect, it } from 'vitest';
import { parseRelayFrame } from '../relayFrame';

describe('frame del Relay', () => {
  it('converte un frame wire valido in un evento tipizzato', () => {
    // Given
    const frame = JSON.stringify({
      v: 3,
      type: 'contact.matched',
      tacitus_id: '2G2DX-6P175-0PJ6E-Q37T0-Q94YJC',
      nickname: 'alice',
      online: true,
    });

    // When
    const event = parseRelayFrame(frame);

    // Then
    expect(event).toEqual({
      tipo: 'contatto-associato',
      tacitusId: '2G2DX-6P175-0PJ6E-Q37T0-Q94YJC',
      nickname: 'alice',
      online: true,
    });
  });

  it('rifiuta il frame al trust boundary quando manca un campo richiesto', () => {
    // Given
    const frame = JSON.stringify({
      v: 3,
      type: 'message.received',
      from_id: '2G2DX-6P175-0PJ6E-Q37T0-Q94YJC',
    });

    // When
    const parse = () => parseRelayFrame(frame);

    // Then
    expect(parse).toThrow('Frame ricevuto non valido.');
  });

  it('valida anche i campi dei frame gestiti internamente dal Relay', () => {
    // Given
    const frame = JSON.stringify({ v: 3, type: 'auth.ready' });

    // When
    const parse = () => parseRelayFrame(frame);

    // Then
    expect(parse).toThrow('Frame ricevuto non valido.');
  });
});
