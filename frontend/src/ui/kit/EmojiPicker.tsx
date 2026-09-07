import { useEffect, useEffectEvent, useRef } from 'react';
import type PickerElement from 'emoji-picker-element/picker';
import type { Tema } from '../../domain/preferenze';

type EmojiPickerProps = {
  theme: Tema;
  dataSource: string;
  onChoose: (unicode: string) => void;
};

const EmojiPicker = ({ dataSource, onChoose, theme }: EmojiPickerProps) => {
  const pickerRef = useRef<HTMLDivElement>(null);
  const chooseEmoji = useEffectEvent(onChoose);

  useEffect(() => {
    let cancelled = false;
    let picker: PickerElement | undefined;
    void import('emoji-picker-element/picker').then(({ default: Picker }) => {
      if (cancelled || !pickerRef.current) return;
      picker = new Picker({ dataSource, locale: 'en' });
      picker.className = theme === 'retro' ? 'dark' : theme;
      const choose = (event: Event) => {
        if (!(event instanceof CustomEvent)) return;
        const unicode = event.detail?.unicode;
        if (typeof unicode === 'string' && unicode) chooseEmoji(unicode);
      };
      picker.addEventListener('emoji-click', choose);
      pickerRef.current.replaceChildren(picker);
    });
    return () => {
      cancelled = true;
      picker?.remove();
    };
  }, [dataSource, theme]);

  return <div className="emoji-picker-panel" ref={pickerRef} />;
};

export default EmojiPicker;
