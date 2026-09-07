import { isAnyOf } from '@reduxjs/toolkit';
import type { StartListening } from '../store/listenerMiddleware';
import {
  anteprimaAlbumAggiornata,
  anteprimaAlbumEliminata,
  anteprimeAlbumSvuotate,
  type AnteprimaAlbumMeta,
} from '../store/albumSlice';
import { contattoBloccato, contattoRimosso } from '../store/eventi';
import { identitaLocaleAssente } from '../store/identitaLocaleSlice';
import { erroreMostrato } from '../store/feedbackSlice';
import type { AppStore, RootState } from '../store/store';
import type { TacitusId } from '../../domain/tacitusId';
import { MAX_IMAGES, prepareImages } from '../../infrastructure/album/album';
import { toBase64Url } from '../../infrastructure/encoding/base64Url';
import { inviaAlbum } from './trasferimentiAlbum';

type FotoAnteprima = { id: string; bytes: Uint8Array; src: string };
type RecordAnteprima = {
  foto: FotoAnteprima[];
  preparazione?: symbol;
  invio?: symbol;
};

const anteprime = new Map<TacitusId, RecordAnteprima>();
const fotoVuote: readonly { id: string; src: string }[] = [];
let appStore: Pick<AppStore, 'dispatch' | 'getState'> | undefined;

// ponytail: memoria proporzionale alle anteprime per Contatto, senza espulsione automatica; un budget globale richiede una decisione di prodotto.

const report = (reason: unknown) => {
  appStore?.dispatch(
    erroreMostrato(
      reason instanceof Error
        ? reason.message
        : 'Operazione foto non riuscita.',
    ),
  );
};

const metadata = (record: RecordAnteprima): AnteprimaAlbumMeta => ({
  fotoIds: record.foto.map(foto => foto.id),
  preparazione: record.preparazione !== undefined,
  invio: record.invio !== undefined,
});

const publish = (tacitusId: TacitusId, record: RecordAnteprima) => {
  if (!record.foto.length && !record.preparazione && !record.invio) {
    anteprime.delete(tacitusId);
    appStore?.dispatch(anteprimaAlbumEliminata(tacitusId));
    return;
  }
  appStore?.dispatch(
    anteprimaAlbumAggiornata({ tacitusId, anteprima: metadata(record) }),
  );
};

const requireStore = (): Pick<AppStore, 'dispatch' | 'getState'> => {
  if (!appStore) throw new Error('Anteprima Album non registrata.');
  return appStore;
};

const currentRecord = (tacitusId: TacitusId) => anteprime.get(tacitusId);

const preflight = (
  state: RootState,
  tacitusId: TacitusId,
  files: File[],
): RecordAnteprima => {
  if (state.identitaLocale.stato !== 'pronta')
    throw new Error('Identità locale assente.');
  if (!state.relazioni.contatti[tacitusId])
    throw new Error('Contatto non disponibile.');
  if (state.sessioniSicure[tacitusId] !== 'pronta')
    throw new Error('Sessione sicura assente.');
  if (state.album.progresso[tacitusId])
    throw new Error('Album in trasferimento.');
  const record = currentRecord(tacitusId);
  if (record?.preparazione)
    throw new Error('Attendi la preparazione delle foto.');
  if (record?.invio) throw new Error('Attendi la fine dell’Album in uscita.');
  if (record && record.foto.length + files.length > MAX_IMAGES) {
    const remaining = MAX_IMAGES - record.foto.length;
    if (remaining > 0)
      throw new Error(`Puoi aggiungere ancora ${remaining} foto.`);
    throw new Error(`L'Album può contenere al massimo ${MAX_IMAGES} foto.`);
  }
  return record ?? { foto: [] };
};

const addPhotoRecord = (bytes: Uint8Array): FotoAnteprima => {
  const encoded = toBase64Url(bytes).replace(/-/g, '+').replace(/_/g, '/');
  return {
    id: crypto.randomUUID(),
    bytes,
    src: `data:image/webp;base64,${encoded}`,
  };
};

export const aggiungiFoto = async (
  tacitusId: TacitusId,
  files: File[],
): Promise<void> => {
  if (!files.length) return;
  let record: RecordAnteprima;
  try {
    const store = requireStore();
    record = preflight(store.getState(), tacitusId, files);
  } catch (reason) {
    report(reason);
    return;
  }
  const token = Symbol('preparazione');
  const nextRecord =
    record === currentRecord(tacitusId) ? record : { ...record };
  nextRecord.preparazione = token;
  anteprime.set(tacitusId, nextRecord);
  publish(tacitusId, nextRecord);
  try {
    const prepared = await prepareImages(files);
    if (
      anteprime.get(tacitusId) !== nextRecord ||
      nextRecord.preparazione !== token
    )
      return;
    nextRecord.foto = [...nextRecord.foto, ...prepared.map(addPhotoRecord)];
  } catch (reason) {
    if (
      anteprime.get(tacitusId) === nextRecord &&
      nextRecord.preparazione === token
    )
      report(reason);
  } finally {
    if (
      anteprime.get(tacitusId) === nextRecord &&
      nextRecord.preparazione === token
    ) {
      delete nextRecord.preparazione;
      publish(tacitusId, nextRecord);
    }
  }
};

export const rimuoviFoto = (tacitusId: TacitusId, fotoId: string): void => {
  const record = currentRecord(tacitusId);
  if (!record || record.preparazione || record.invio) return;
  const foto = record.foto.filter(item => item.id !== fotoId);
  if (foto.length === record.foto.length) return;
  record.foto = foto;
  publish(tacitusId, record);
};

export const annullaAnteprima = (tacitusId: TacitusId): void => {
  const record = currentRecord(tacitusId);
  if (!record || record.invio) return;
  anteprime.delete(tacitusId);
  requireStore().dispatch(anteprimaAlbumEliminata(tacitusId));
};

export const inviaAnteprima = async (tacitusId: TacitusId): Promise<void> => {
  const store = requireStore();
  const record = currentRecord(tacitusId);
  try {
    if (!record?.foto.length) throw new Error('Scegli da 1 a 10 foto.');
    if (record.preparazione)
      throw new Error('Attendi la preparazione delle foto.');
    if (record.invio) throw new Error('Attendi la fine dell’Album in uscita.');
    if (store.getState().sessioniSicure[tacitusId] !== 'pronta')
      throw new Error('Sessione sicura assente.');
    if (store.getState().album.progresso[tacitusId])
      throw new Error('Album in trasferimento.');
    if ([...anteprime.values()].some(item => item.invio !== undefined))
      throw new Error('Attendi la fine dell’Album in uscita.');
    const token = Symbol('invio');
    record.invio = token;
    publish(tacitusId, record);
    const completed = await inviaAlbum(
      tacitusId,
      record.foto.map(foto => foto.bytes),
    );
    if (
      anteprime.get(tacitusId) === record &&
      record.invio === token &&
      completed
    ) {
      anteprime.delete(tacitusId);
      store.dispatch(anteprimaAlbumEliminata(tacitusId));
      return;
    }
  } catch (reason) {
    if (anteprime.get(tacitusId) === record) report(reason);
  } finally {
    if (record && anteprime.get(tacitusId) === record && record.invio) {
      delete record.invio;
      publish(tacitusId, record);
    }
  }
};

export const svuotaAnteprime = (): void => {
  anteprime.clear();
  appStore?.dispatch(anteprimeAlbumSvuotate());
};

export const leggiFotoAnteprima = (
  tacitusId: TacitusId,
): readonly { id: string; src: string }[] => {
  const record = currentRecord(tacitusId);
  if (!record) return fotoVuote;
  const meta = appStore?.getState().album.anteprime[tacitusId];
  if (
    !meta ||
    meta.fotoIds.length !== record.foto.length ||
    meta.fotoIds.some((id, index) => id !== record.foto[index]?.id)
  )
    throw new Error('Metadati Anteprima Album incoerenti.');
  return record.foto.map(({ id, src }) => ({ id, src }));
};

const cleanupContact = (tacitusId: TacitusId) => {
  if (!anteprime.delete(tacitusId)) return;
  appStore?.dispatch(anteprimaAlbumEliminata(tacitusId));
};

export const registerAnteprimeAlbum = (
  startListening: StartListening,
  store: Pick<AppStore, 'dispatch' | 'getState'>,
): void => {
  appStore = store;
  startListening({
    matcher: isAnyOf(contattoRimosso, contattoBloccato),
    effect: action => {
      if (contattoRimosso.match(action) || contattoBloccato.match(action))
        cleanupContact(action.payload);
    },
  });
  startListening({
    actionCreator: identitaLocaleAssente,
    effect: () => svuotaAnteprime(),
  });
};
