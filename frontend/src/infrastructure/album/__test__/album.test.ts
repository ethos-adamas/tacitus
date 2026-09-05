import { describe, expect, it } from 'vitest';
import { parseAlbumFrame } from '../album';

describe('contenuto Album non fidato', () => {
  it('ammette solo offerte limitate e chunk contigui validabili', () => {
    // Given
    const id = crypto.randomUUID();
    const valid = { type: 'album.offer', id, sizes: [12, 5 * 1024 * 1024] };
    // When / Then
    expect(parseAlbumFrame(JSON.stringify(valid))).toEqual(valid);
    for (const sizes of [
      [],
      Array(11).fill(12),
      [0],
      [-1],
      [1.5],
      [5 * 1024 * 1024 + 1],
    ]) {
      expect(() =>
        parseAlbumFrame(JSON.stringify({ ...valid, sizes })),
      ).toThrow();
    }
    for (const frame of [
      { type: 'album.offer', id: '<img>', sizes: [12] },
      { type: 'album.chunk', id, index: 10, offset: 0, data: 'AA' },
      { type: 'album.chunk', id, index: 0, offset: -1, data: 'AA' },
      { type: 'album.chunk', id, index: 0, offset: 0, data: '!@' },
      { type: 'album.answer', id, accepted: 'yes' },
      { type: 'album.unknown', id },
    ])
      expect(() => parseAlbumFrame(JSON.stringify(frame))).toThrow();
  });
});
