import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestStore } from '../../store/store';
import { contattoAssociato, sessioneSicuraStabilita } from '../../store/eventi';
import { identitaLocaleDisponibile } from '../../store/identitaLocaleSlice';
import { type StartListening } from '../../store/listenerMiddleware';
import {
  aggiungiFoto,
  annullaAnteprima,
  inviaAnteprima,
  leggiFotoAnteprima,
  registerAnteprimeAlbum,
  svuotaAnteprime,
} from '../anteprimeAlbum';
import { parseTacitusId } from '../../../domain/tacitusId';

const { prepareImages, inviaAlbum } = vi.hoisted(() => ({
  prepareImages: vi.fn(),
  inviaAlbum: vi.fn(),
}));
vi.mock('../../../infrastructure/album/album', () => ({
  MAX_IMAGES: 10,
  prepareImages,
}));
vi.mock('../trasferimentiAlbum', () => ({
  inviaAlbum,
  registerAlbumListeners: vi.fn(),
}));

const startListening = (() => undefined) as unknown as StartListening;
const alice = parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');
const bob = parseTacitusId('3G3DX-6P175-0PJ6E-Q37T0-Q94YJC');

const file = (name: string) => new File(['foto'], name, { type: 'image/png' });

const setup = () => {
  const store = createTestStore();
  registerAnteprimeAlbum(startListening, store);
  store.dispatch(
    identitaLocaleDisponibile({
      nickname: 'local',
      tacitusId: parseTacitusId('4G4DX-6P175-0PJ6E-Q37T0-Q94YJC'),
    }),
  );
  for (const [tacitusId, nickname] of [
    [alice, 'alice'],
    [bob, 'bob'],
  ] as const) {
    store.dispatch(contattoAssociato({ tacitusId, nickname, online: true }));
    store.dispatch(sessioneSicuraStabilita(tacitusId));
  }
  return store;
};

beforeEach(() => {
  prepareImages.mockResolvedValue([new Uint8Array([1, 2, 3])]);
  inviaAlbum.mockResolvedValue(true);
});

afterEach(() => {
  svuotaAnteprime();
  vi.clearAllMocks();
});

describe('anteprime Album per Contatto', () => {
  it('accumula i gruppi nell’ordine e prepara solo i nuovi File', async () => {
    // Given
    setup();
    prepareImages
      .mockResolvedValueOnce([new Uint8Array([1])])
      .mockResolvedValueOnce([new Uint8Array([2])]);

    // When
    await aggiungiFoto(alice, [file('uno.png')]);
    await aggiungiFoto(alice, [file('due.png')]);

    // Then
    expect(prepareImages).toHaveBeenNthCalledWith(1, [expect.any(File)]);
    expect(prepareImages).toHaveBeenNthCalledWith(2, [expect.any(File)]);
    expect(leggiFotoAnteprima(alice)).toHaveLength(2);
    expect(leggiFotoAnteprima(bob)).toEqual([]);
  });

  it('rifiuta un gruppo oltre il limite senza convertirlo', async () => {
    // Given
    const store = setup();
    prepareImages.mockResolvedValue(new Array(9).fill(new Uint8Array([1])));
    await aggiungiFoto(alice, [file('uno.png')]);
    prepareImages.mockClear();

    // When
    await aggiungiFoto(alice, [file('a.png'), file('b.png'), file('c.png')]);

    // Then
    expect(leggiFotoAnteprima(alice)).toHaveLength(9);
    expect(prepareImages).not.toHaveBeenCalled();
    expect(store.getState().feedback.errore).toContain(
      'Puoi aggiungere ancora 1 foto.',
    );
  });

  it('annulla una preparazione pendente e ignora il risultato tardivo', async () => {
    // Given
    setup();
    let resolve: ((value: Uint8Array[]) => void) | undefined;
    prepareImages.mockReturnValue(new Promise(done => (resolve = done)));
    const pending = aggiungiFoto(alice, [file('vecchia.png')]);

    // When
    annullaAnteprima(alice);
    resolve?.([new Uint8Array([9])]);
    await pending;

    // Then
    expect(leggiFotoAnteprima(alice)).toEqual([]);
  });

  it('svuota solo il destinatario inviato dopo un esito positivo', async () => {
    // Given
    setup();
    prepareImages
      .mockResolvedValueOnce([new Uint8Array([1])])
      .mockResolvedValueOnce([new Uint8Array([2])]);
    await aggiungiFoto(alice, [file('alice.png')]);
    await aggiungiFoto(bob, [file('bob.png')]);

    // When
    await inviaAnteprima(alice);

    // Then
    expect(inviaAlbum).toHaveBeenCalledTimes(1);
    expect(leggiFotoAnteprima(alice)).toEqual([]);
    expect(leggiFotoAnteprima(bob)).toHaveLength(1);
  });

  it('conserva le foto quando il trasferimento gestito fallisce', async () => {
    // Given
    setup();
    await aggiungiFoto(alice, [file('alice.png')]);
    inviaAlbum.mockResolvedValue(false);

    // When
    await inviaAnteprima(alice);

    // Then
    expect(leggiFotoAnteprima(alice)).toHaveLength(1);
  });
});
