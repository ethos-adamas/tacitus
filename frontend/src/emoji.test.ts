import { describe, expect, it } from 'vitest'
import { findShortcodeToken, rankEmoji, replaceToken } from './emoji'

describe('compositore emoji', () => {
  it('apre i suggerimenti solo per uno shortcode iniziato al confine di una parola', () => {
    expect(findShortcodeToken('ciao :thu', 9)).toEqual({ start: 5, end: 9, query: 'thu' })
    expect(findShortcodeToken(':s', 2)).toEqual({ start: 0, end: 2, query: 's' })
    expect(findShortcodeToken('ciao:', 5)).toBeUndefined()
    expect(findShortcodeToken(':', 1)).toBeUndefined()
    expect(findShortcodeToken(':smile:', 7)).toBeUndefined()
  })

  it('sostituisce soltanto lo shortcode selezionato', () => {
    expect(replaceToken('ciao :thu dopo', { start: 5, end: 9, query: 'thu' }, '👍'))
      .toBe('ciao 👍 dopo')
  })

  it('ordina prima gli shortcode con prefisso e applica la tonalità globale', () => {
    const suggestions = rankEmoji('hea', [
      { annotation: 'smiling face with hearts', shortcodes: ['smiling_face_with_hearts'], unicode: '🥰' },
      { annotation: 'red heart', shortcodes: ['heart'], unicode: '❤' },
      { annotation: 'hand', shortcodes: ['heart_hands'], unicode: '🫶', skins: [{ tone: 3, unicode: '🫶🏽' }] },
    ], 3)
    expect(suggestions.map(({ shortcode }) => shortcode)).toEqual([
      'heart', 'heart_hands', 'smiling_face_with_hearts',
    ])
    expect(suggestions[1].unicode).toBe('🫶🏽')
  })
})
