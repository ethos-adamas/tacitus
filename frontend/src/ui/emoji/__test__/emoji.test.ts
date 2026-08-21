import { describe, expect, it } from 'vitest';
import { findShortcodeToken, rankEmoji, replaceToken } from '../emoji';

describe('compositore Emoji', () => {
  it('apre i suggerimenti solo per uno shortcode iniziato al confine di una parola', () => {
    // Given
    const text = 'ciao :thu';

    // When
    const token = findShortcodeToken(text, 9);

    // Then
    expect(token).toEqual({
      start: 5,
      end: 9,
      query: 'thu',
    });
    expect(findShortcodeToken(':s', 2)).toEqual({
      start: 0,
      end: 2,
      query: 's',
    });
    expect(findShortcodeToken('ciao:', 5)).toBeUndefined();
    expect(findShortcodeToken(':', 1)).toBeUndefined();
    expect(findShortcodeToken(':smile:', 7)).toBeUndefined();
  });

  it('sostituisce soltanto lo shortcode selezionato', () => {
    // Given
    const text = 'ciao :thu dopo';
    const token = { start: 5, end: 9, query: 'thu' };

    // When
    const result = replaceToken(text, token, '👍');

    // Then
    expect(result).toBe('ciao 👍 dopo');
  });

  it('ordina prima gli shortcode con prefisso e applica la tonalità globale', () => {
    // Given
    const emojis = [
      {
        annotation: 'smiling face with hearts',
        shortcodes: ['smiling_face_with_hearts'],
        unicode: '🥰',
      },
      { annotation: 'red heart', shortcodes: ['heart'], unicode: '❤' },
      {
        annotation: 'hand',
        shortcodes: ['heart_hands'],
        unicode: '🫶',
        skins: [{ tone: 3, unicode: '🫶🏽' }],
      },
    ];

    // When
    const suggestions = rankEmoji('hea', emojis, 3);

    // Then
    expect(suggestions.map(({ shortcode }) => shortcode)).toEqual([
      'heart',
      'heart_hands',
      'smiling_face_with_hearts',
    ]);
    expect(suggestions[1].unicode).toBe('🫶🏽');
  });
});
