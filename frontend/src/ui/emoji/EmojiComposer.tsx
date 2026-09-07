import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  EMOJI_DATA_SOURCE,
  findShortcodeToken,
  rememberEmoji,
  replaceToken,
  searchEmoji,
  type EmojiSuggestion,
  type ShortcodeToken,
} from './emoji';
import type { Tema } from '../../domain/preferenze';
import { Button } from '../kit/Button';
import { TextArea } from '../kit/Fields';
import EmojiPicker from '../kit/EmojiPicker';

type Props = {
  disabled: boolean;
  maxLength: number;
  placeholder: string;
  theme: Tema;
  value: string;
  attachment: ReactNode;
  onFiles: (files: File[]) => void;
  onFilesError: (reason: unknown) => void;
  onChange: (value: string) => void;
  onSend: () => void;
};

type SuggestionButtonProps = {
  index: number;
  selected: boolean;
  suggestion: EmojiSuggestion;
  onChoose: (suggestion: EmojiSuggestion) => void;
};

const SuggestionButton = ({
  index,
  onChoose,
  selected,
  suggestion,
}: SuggestionButtonProps) => {
  const choose = () => onChoose(suggestion);
  return (
    <Button
      type="button"
      variant="ghost"
      role="option"
      aria-selected={selected}
      id={`emoji-suggestion-${index}`}
      className={`!grid ${selected ? 'selected' : ''}`}
      onClick={choose}>
      <span>{suggestion.unicode}</span>
      <span>
        <strong>:{suggestion.shortcode}:</strong>
        <small>{suggestion.annotation}</small>
      </span>
    </Button>
  );
};

const EmojiComposer = ({
  disabled,
  maxLength,
  placeholder,
  theme,
  value,
  attachment,
  onFiles,
  onFilesError,
  onChange,
  onSend,
}: Props) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<EmojiSuggestion[]>([]);
  const [token, setToken] = useState<ShortcodeToken>();
  const [selected, setSelected] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectionRef = useRef({ start: value.length, end: value.length });
  const searchRef = useRef(0);
  const pickerVisible = pickerOpen && !disabled;
  const visibleSuggestions = disabled ? [] : suggestions;

  const rememberSelection = () => {
    const textarea = textareaRef.current;
    if (textarea)
      selectionRef.current = {
        start: textarea.selectionStart,
        end: textarea.selectionEnd,
      };
  };

  const focusAt = (cursor: number) => {
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
      selectionRef.current = { start: cursor, end: cursor };
    });
  };

  const insert = (
    unicode: string,
    replacement: ShortcodeToken | null | undefined = token,
  ) => {
    const selection = selectionRef.current;
    const next = replacement
      ? replaceToken(value, replacement, unicode)
      : `${value.slice(0, selection.start)}${unicode}${value.slice(selection.end)}`;
    if (next.length > maxLength) return;
    const cursor = (replacement?.start ?? selection.start) + unicode.length;
    onChange(next);
    setSuggestions([]);
    setToken(undefined);
    setPickerOpen(false);
    focusAt(cursor);
  };
  const insertFromPicker = (unicode: string) => insert(unicode, null);

  const chooseSuggestion = (suggestion: EmojiSuggestion) => {
    insert(suggestion.unicode);
    void rememberEmoji(suggestion.baseUnicode);
  };

  const updateSuggestions = async (next: string, cursor: number) => {
    const currentSearch = ++searchRef.current;
    const nextToken = findShortcodeToken(next, cursor);
    setToken(nextToken);
    setSelected(0);
    setPickerOpen(false);
    if (!nextToken) {
      setSuggestions([]);
      return;
    }
    try {
      const matches = await searchEmoji(nextToken.query);
      if (searchRef.current === currentSearch) setSuggestions(matches);
    } catch {
      if (searchRef.current === currentSearch) setSuggestions([]);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setSelected(
          current =>
            (current + direction + suggestions.length) % suggestions.length,
        );
        return;
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        chooseSuggestion(suggestions[selected]);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setSuggestions([]);
        setToken(undefined);
        return;
      }
    }
    if (event.key === 'Escape' && pickerOpen) {
      event.preventDefault();
      setPickerOpen(false);
    } else if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  };

  const togglePicker = () => {
    rememberSelection();
    setSuggestions([]);
    setToken(undefined);
    setPickerOpen(open => !open);
  };

  const changeMessage = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = event.target;
    selectionRef.current = {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    };
    onChange(textarea.value);
    void updateSuggestions(textarea.value, textarea.selectionStart);
  };

  const pasteFiles = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const clipboard = event.clipboardData;
    const files = Array.from(clipboard.files);
    if (files.length) {
      event.preventDefault();
      onFiles(files);
      return;
    }
    const fileItems = Array.from(clipboard.items).filter(
      item => item.kind === 'file',
    );
    if (!fileItems.length) return;
    const itemFiles = fileItems.map(item => item.getAsFile());
    event.preventDefault();
    if (itemFiles.some(file => file === null)) {
      onFilesError(new Error('Immagine clipboard non leggibile.'));
      return;
    }
    onFiles(itemFiles.filter((file): file is File => file !== null));
  };

  useEffect(() => {
    if (!pickerVisible && !visibleSuggestions.length) return;
    const close = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !rootRef.current?.contains(event.target)
      ) {
        setPickerOpen(false);
        setSuggestions([]);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pickerVisible, visibleSuggestions.length]);

  return (
    <div className="composer" ref={rootRef}>
      {visibleSuggestions.length > 0 && (
        <div
          className="emoji-suggestions"
          role="listbox"
          aria-label="Emoji suggestions">
          {visibleSuggestions.map((suggestion, index) => (
            <SuggestionButton
              key={suggestion.baseUnicode}
              index={index}
              selected={index === selected}
              suggestion={suggestion}
              onChoose={chooseSuggestion}
            />
          ))}
        </div>
      )}
      {pickerVisible && (
        <EmojiPicker
          theme={theme}
          dataSource={EMOJI_DATA_SOURCE}
          onChoose={insertFromPicker}
        />
      )}
      <div className="composer-attachment">{attachment}</div>
      <div className="message-input">
        <TextArea
          ref={textareaRef}
          aria-label="Messaggio"
          rows={1}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          aria-expanded={visibleSuggestions.length > 0}
          aria-activedescendant={
            visibleSuggestions.length
              ? `emoji-suggestion-${selected}`
              : undefined
          }
          onSelect={rememberSelection}
          onChange={changeMessage}
          onKeyDown={onKeyDown}
          onPaste={pasteFiles}
        />
        <small>
          {value.length}/{maxLength}
        </small>
        <Button
          type="button"
          variant="ghost"
          className="emoji-toggle"
          disabled={disabled}
          aria-label="Choose an emoji"
          aria-expanded={pickerVisible}
          onClick={togglePicker}>
          ☺
        </Button>
      </div>
      <Button
        type="button"
        variant="primary"
        className="send"
        aria-label="Invia"
        disabled={disabled || !value.trim()}
        onClick={onSend}>
        ↑
      </Button>
    </div>
  );
};

export default EmojiComposer;
