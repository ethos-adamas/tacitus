import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from 'react'
import type PickerElement from 'emoji-picker-element/picker'
import {
  EMOJI_DATA_SOURCE,
  findShortcodeToken,
  rememberEmoji,
  replaceToken,
  searchEmoji,
  type EmojiSuggestion,
  type ShortcodeToken,
} from './emoji'
import type { Theme } from './preferences'

type Props = {
  disabled: boolean
  maxLength: number
  placeholder: string
  theme: Theme
  value: string
  onChange: (value: string) => void
  onSend: () => void
}

export default function EmojiComposer({
  disabled, maxLength, placeholder, theme, value, onChange, onSend,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<EmojiSuggestion[]>([])
  const [token, setToken] = useState<ShortcodeToken>()
  const [selected, setSelected] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectionRef = useRef({ start: value.length, end: value.length })
  const searchRef = useRef(0)
  const pickerVisible = pickerOpen && !disabled
  const visibleSuggestions = disabled ? [] : suggestions

  function rememberSelection() {
    const textarea = textareaRef.current
    if (textarea) selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    }
  }

  function focusAt(cursor: number) {
    requestAnimationFrame(() => {
      textareaRef.current?.focus()
      textareaRef.current?.setSelectionRange(cursor, cursor)
      selectionRef.current = { start: cursor, end: cursor }
    })
  }

  function insert(unicode: string, replacement: ShortcodeToken | null | undefined = token) {
    const selection = selectionRef.current
    const next = replacement
      ? replaceToken(value, replacement, unicode)
      : `${value.slice(0, selection.start)}${unicode}${value.slice(selection.end)}`
    if (next.length > maxLength) return
    const cursor = (replacement?.start ?? selection.start) + unicode.length
    onChange(next)
    setSuggestions([])
    setToken(undefined)
    setPickerOpen(false)
    focusAt(cursor)
  }
  const insertFromPicker = useEffectEvent((unicode: string) => insert(unicode, null))

  function chooseSuggestion(suggestion: EmojiSuggestion) {
    insert(suggestion.unicode)
    void rememberEmoji(suggestion.baseUnicode)
  }

  async function updateSuggestions(next: string, cursor: number) {
    const currentSearch = ++searchRef.current
    const nextToken = findShortcodeToken(next, cursor)
    setToken(nextToken)
    setSelected(0)
    setPickerOpen(false)
    if (!nextToken) {
      setSuggestions([])
      return
    }
    try {
      const matches = await searchEmoji(nextToken.query)
      if (searchRef.current === currentSearch) setSuggestions(matches)
    } catch {
      if (searchRef.current === currentSearch) setSuggestions([])
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (suggestions.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const direction = event.key === 'ArrowDown' ? 1 : -1
        setSelected((current) => (current + direction + suggestions.length) % suggestions.length)
        return
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        chooseSuggestion(suggestions[selected])
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setSuggestions([])
        setToken(undefined)
        return
      }
    }
    if (event.key === 'Escape' && pickerOpen) {
      event.preventDefault()
      setPickerOpen(false)
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSend()
    }
  }

  useEffect(() => {
    if (!pickerVisible) return
    let cancelled = false
    let picker: PickerElement | undefined
    void import('emoji-picker-element/picker').then(({ default: Picker }) => {
      if (cancelled || !pickerRef.current) return
      picker = new Picker({ dataSource: EMOJI_DATA_SOURCE, locale: 'en' })
      picker.className = theme
      picker.addEventListener('emoji-click', ({ detail }) => {
        if (detail.unicode) insertFromPicker(detail.unicode)
      })
      pickerRef.current.replaceChildren(picker)
    })
    return () => {
      cancelled = true
      picker?.remove()
    }
  }, [pickerVisible, theme])

  useEffect(() => {
    if (!pickerVisible && !visibleSuggestions.length) return
    const close = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setPickerOpen(false)
        setSuggestions([])
      }
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [pickerVisible, visibleSuggestions.length])

  return <div className="composer" ref={rootRef}>
    {visibleSuggestions.length > 0 && <div className="emoji-suggestions" role="listbox" aria-label="Emoji suggestions">
      {visibleSuggestions.map((suggestion, index) => <button type="button" role="option"
        aria-selected={index === selected} id={`emoji-suggestion-${index}`}
        className={index === selected ? 'selected' : ''} key={suggestion.baseUnicode}
        onClick={() => chooseSuggestion(suggestion)}>
        <span>{suggestion.unicode}</span>
        <span><strong>:{suggestion.shortcode}:</strong><small>{suggestion.annotation}</small></span>
      </button>)}
    </div>}
    {pickerVisible && <div className="emoji-picker-panel" ref={pickerRef} />}
    <button type="button" className="emoji-toggle" disabled={disabled}
      aria-label="Choose an emoji" aria-expanded={pickerVisible}
      onClick={() => {
        rememberSelection()
        setSuggestions([])
        setToken(undefined)
        setPickerOpen((open) => !open)
      }}>☺</button>
    <textarea ref={textareaRef} aria-label="Messaggio" value={value} maxLength={maxLength}
      placeholder={placeholder} disabled={disabled}
      aria-expanded={visibleSuggestions.length > 0}
      aria-activedescendant={visibleSuggestions.length ? `emoji-suggestion-${selected}` : undefined}
      onSelect={rememberSelection}
      onChange={({ target }) => {
        selectionRef.current = { start: target.selectionStart, end: target.selectionEnd }
        onChange(target.value)
        void updateSuggestions(target.value, target.selectionStart)
      }}
      onKeyDown={onKeyDown} />
    <small>{value.length}/{maxLength}</small>
    <button type="button" className="send" aria-label="Invia" disabled={disabled || !value.trim()}
      onClick={onSend}>↑</button>
  </div>
}
