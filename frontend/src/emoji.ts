import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url'

export const EMOJI_DATA_SOURCE = emojiDataUrl

export type ShortcodeToken = {
  start: number
  end: number
  query: string
}

export type EmojiSuggestion = {
  annotation: string
  shortcode: string
  unicode: string
  baseUnicode: string
}

type EmojiRecord = {
  annotation?: string
  name?: string
  shortcodes?: string[]
  unicode?: string
  skins?: { tone: number; unicode: string }[]
}

let databasePromise: Promise<import('emoji-picker-element/database').default> | undefined

function database() {
  databasePromise ??= import('emoji-picker-element/database')
    .then(({ default: Database }) => new Database({ dataSource: EMOJI_DATA_SOURCE, locale: 'en' }))
  return databasePromise
}

export function findShortcodeToken(text: string, cursor: number): ShortcodeToken | undefined {
  const beforeCursor = text.slice(0, cursor)
  const match = /(?:^|\s):([a-z0-9_+-]+)$/i.exec(beforeCursor)
  if (!match) return undefined
  const colon = beforeCursor.lastIndexOf(':')
  return { start: colon, end: cursor, query: match[1].toLowerCase() }
}

export function replaceToken(text: string, token: ShortcodeToken, unicode: string) {
  return `${text.slice(0, token.start)}${unicode}${text.slice(token.end)}`
}

export function rankEmoji(query: string, records: EmojiRecord[], skinTone = 0): EmojiSuggestion[] {
  return records.flatMap((emoji, order) => {
    if (!emoji.unicode || !emoji.shortcodes?.length) return []
    const shortcodes = emoji.shortcodes.map((shortcode) => shortcode.toLowerCase())
    const shortcode = shortcodes.find((candidate) => candidate === query)
      ?? shortcodes.find((candidate) => candidate.startsWith(query))
      ?? shortcodes.find((candidate) => candidate.includes(query))
      ?? shortcodes[0]
    const annotation = emoji.annotation ?? emoji.name ?? shortcode
    const score = shortcode === query ? 0
      : shortcode.startsWith(query) ? 1
        : annotation.toLowerCase().startsWith(query) ? 2 : 3
    return [{
      suggestion: {
        annotation,
        shortcode,
        unicode: emoji.skins?.find(({ tone }) => tone === skinTone)?.unicode ?? emoji.unicode,
        baseUnicode: emoji.unicode,
      },
      order,
      score,
    }]
  }).sort((left, right) => left.score - right.score || left.order - right.order)
    .slice(0, 8)
    .map(({ suggestion }) => suggestion)
}

export async function searchEmoji(query: string) {
  const store = await database()
  const [records, skinTone] = await Promise.all([
    store.getEmojiBySearchQuery(query),
    store.getPreferredSkinTone(),
  ])
  return rankEmoji(query, records as EmojiRecord[], skinTone)
}

export async function rememberEmoji(unicode: string) {
  await (await database()).incrementFavoriteEmojiCount(unicode)
}
