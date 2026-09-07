import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import EmojiComposer from '../EmojiComposer';

const renderComposer = (
  props: Partial<React.ComponentProps<typeof EmojiComposer>> = {},
) =>
  render(
    <EmojiComposer
      value="abc"
      maxLength={100}
      placeholder="Scrivi"
      disabled={false}
      theme="light"
      attachment={<span>allegato</span>}
      onFiles={vi.fn()}
      onFilesError={vi.fn()}
      onChange={vi.fn()}
      onSend={vi.fn()}
      {...props}
    />,
  );

afterEach(cleanup);

it('consegna le immagini incollate senza modificare testo e selezione', () => {
  // Given
  const onFiles = vi.fn();
  const onChange = vi.fn();
  renderComposer({ onFiles, onChange });
  const textarea = screen.getByLabelText('Messaggio') as HTMLTextAreaElement;
  textarea.setSelectionRange(1, 2);
  const file = new File(['png'], 'foto.png', { type: 'image/png' });

  // When
  const event = createEvent.paste(textarea, {
    clipboardData: { files: [file], items: [] },
  });
  fireEvent(textarea, event);

  // Then
  expect(event.defaultPrevented).toBe(true);
  expect(onFiles).toHaveBeenCalledWith([file]);
  expect(onChange).not.toHaveBeenCalled();
  expect(textarea.selectionStart).toBe(1);
  expect(textarea.selectionEnd).toBe(2);
});

it('usa gli item come fallback e consegna una sola volta il file', () => {
  // Given
  const onFiles = vi.fn();
  renderComposer({ onFiles });
  const textarea = screen.getByLabelText('Messaggio') as HTMLTextAreaElement;
  const file = new File(['png'], 'foto.png', { type: 'image/png' });
  const item = { kind: 'file', getAsFile: () => file };

  // When
  fireEvent.paste(textarea, {
    clipboardData: { files: [], items: [item] },
  });

  // Then
  expect(onFiles).toHaveBeenCalledTimes(1);
  expect(onFiles).toHaveBeenCalledWith([file]);
});

it('lascia il testo al paste nativo quando la clipboard contiene solo testo', () => {
  // Given
  const onFiles = vi.fn();
  const onChange = vi.fn();
  renderComposer({ onFiles, onChange });
  const textarea = screen.getByLabelText('Messaggio') as HTMLTextAreaElement;
  const event = createEvent.paste(textarea, {
    clipboardData: {
      files: [],
      items: [{ kind: 'string' }],
    },
  });

  // When
  fireEvent(textarea, event);

  // Then
  expect(event.defaultPrevented).toBe(false);
  expect(onFiles).not.toHaveBeenCalled();
  expect(onChange).not.toHaveBeenCalled();
});

it('rifiuta il gruppo se un item non è leggibile', () => {
  // Given
  const onFiles = vi.fn();
  const onFilesError = vi.fn();
  renderComposer({ onFiles, onFilesError });
  const textarea = screen.getByLabelText('Messaggio') as HTMLTextAreaElement;
  const file = new File(['png'], 'foto.png', { type: 'image/png' });

  // When
  const event = createEvent.paste(textarea, {
    clipboardData: {
      files: [],
      items: [
        { kind: 'file', getAsFile: () => file },
        { kind: 'file', getAsFile: () => null },
      ],
    },
  });
  fireEvent(textarea, event);

  // Then
  expect(event.defaultPrevented).toBe(true);
  expect(onFiles).not.toHaveBeenCalled();
  expect(onFilesError).toHaveBeenCalledOnce();
});

it('non intercetta il paste quando il campo è disabilitato', () => {
  // Given
  const onFiles = vi.fn();
  renderComposer({ disabled: true, onFiles });
  const textarea = screen.getByLabelText('Messaggio') as HTMLTextAreaElement;
  const file = new File(['png'], 'foto.png', { type: 'image/png' });

  // When
  const event = createEvent.paste(textarea, {
    clipboardData: { files: [file], items: [] },
  });
  fireEvent(textarea, event);

  // Then
  expect(event.defaultPrevented).toBe(false);
  expect(onFiles).not.toHaveBeenCalled();
});
