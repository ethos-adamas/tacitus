import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { PhotoDropzone, usePhotoDropProtection } from '../PhotoDropzone';

const DropProtection = () => {
  usePhotoDropProtection();
  return <div>pagina</div>;
};

type TestItem = {
  kind: string;
  getAsFile?: () => File | null;
  webkitGetAsEntry?: () => { isDirectory: boolean };
};

const dataTransferFor = (
  files: File[],
  items: TestItem[] = files.map(file => ({
    kind: 'file',
    getAsFile: () => file,
  })),
) => ({
  files,
  items,
  types: items.some(item => item.kind === 'file') ? ['Files'] : ['text/plain'],
});

afterEach(cleanup);

it('consegna tutti i file nel loro ordine senza filtrarli localmente', async () => {
  // Given
  const onFiles = vi.fn();
  const first = new File(['a'], 'a.png', { type: 'image/png' });
  const second = new File(['b'], 'b.txt', { type: 'text/plain' });
  render(
    <PhotoDropzone disabled={false} onFiles={onFiles} onFilesError={vi.fn()}>
      <textarea aria-label="Messaggio" />
    </PhotoDropzone>,
  );

  // When
  fireEvent.drop(screen.getByRole('presentation'), {
    dataTransfer: dataTransferFor([first, second]),
  });

  // Then
  await waitFor(() => expect(onFiles).toHaveBeenCalledWith([first, second]));
  expect(onFiles).toHaveBeenCalledTimes(1);
});

it('mostra lo stato attivo e lo rimuove al rilascio', async () => {
  // Given
  const file = new File(['a'], 'a.png', { type: 'image/png' });
  render(
    <PhotoDropzone disabled={false} onFiles={vi.fn()} onFilesError={vi.fn()}>
      <textarea aria-label="Messaggio" />
    </PhotoDropzone>,
  );
  const transfer = dataTransferFor([file]);
  const root = screen.getByRole('presentation');

  // When
  fireEvent.dragEnter(root, { dataTransfer: transfer });

  // Then
  await waitFor(() =>
    expect(
      screen.getByText("Rilascia le foto per aggiungerle all'Album"),
    ).toBeDefined(),
  );
  fireEvent.drop(root, { dataTransfer: transfer });
  await waitFor(() =>
    expect(
      screen.queryByText("Rilascia le foto per aggiungerle all'Album"),
    ).toBeNull(),
  );
});

it('non intercetta il trascinamento del solo testo', () => {
  // Given
  const onFiles = vi.fn();
  render(
    <PhotoDropzone disabled={false} onFiles={onFiles} onFilesError={vi.fn()}>
      <textarea aria-label="Messaggio" />
    </PhotoDropzone>,
  );
  const root = screen.getByRole('presentation');
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: dataTransferFor([], [{ kind: 'string' }]),
  });

  // When
  fireEvent(root, event);

  // Then
  expect(event.defaultPrevented).toBe(false);
  expect(onFiles).not.toHaveBeenCalled();
});

it('cancella il drop ma segnala che il compositore è disabilitato', () => {
  // Given
  const onFilesError = vi.fn();
  const file = new File(['a'], 'a.png', { type: 'image/png' });
  render(
    <PhotoDropzone disabled onFiles={vi.fn()} onFilesError={onFilesError}>
      <textarea aria-label="Messaggio" />
    </PhotoDropzone>,
  );
  const root = screen.getByRole('presentation');

  // When
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: dataTransferFor([file]),
  });
  fireEvent(root, event);

  // Then
  expect(event.defaultPrevented).toBe(true);
  expect(onFilesError).toHaveBeenCalledOnce();
});

it('rifiuta una cartella senza consegnare la foto accodata', async () => {
  // Given
  const onFiles = vi.fn();
  const onFilesError = vi.fn();
  const file = new File(['a'], 'a.png', { type: 'image/png' });
  const directoryItem = {
    kind: 'file',
    getAsFile: () => file,
    webkitGetAsEntry: () => ({ isDirectory: true }),
  };
  render(
    <PhotoDropzone
      disabled={false}
      onFiles={onFiles}
      onFilesError={onFilesError}>
      <textarea aria-label="Messaggio" />
    </PhotoDropzone>,
  );

  // When
  fireEvent.drop(screen.getByRole('presentation'), {
    dataTransfer: dataTransferFor([file], [directoryItem]),
  });

  // Then
  await waitFor(() => expect(onFilesError).toHaveBeenCalledOnce());
  expect(onFiles).not.toHaveBeenCalled();
});

it('protegge la pagina dai file rilasciati fuori dal compositore', () => {
  // Given
  render(<DropProtection />);
  const file = new File(['a'], 'a.png', { type: 'image/png' });
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: dataTransferFor([file]),
  });

  // When
  fireEvent(document.body, event);

  // Then
  expect(event.defaultPrevented).toBe(true);
});
