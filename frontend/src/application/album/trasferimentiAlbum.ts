import { isAnyOf } from '@reduxjs/toolkit';
import type { TacitusId } from '../../domain/tacitusId';
import {
  CHUNK_BYTES,
  parseAlbumFrame,
  validateWebP,
  type AlbumFrame,
} from '../../infrastructure/album/album';
import {
  fromBase64Url,
  toBase64Url,
} from '../../infrastructure/encoding/base64Url';
import { leggiIdentitaLocale } from '../../infrastructure/identity/identitaLocaleCorrente';
import {
  deleteContactAlbums,
  saveAlbum,
} from '../../infrastructure/persistence/localPersistence';
import { leggiRelay } from '../../infrastructure/relay/relayAttivo';
import { sessioniSicureAttive } from '../../infrastructure/secure-session/sessioniSicureAttive';
import {
  consensoFotoCambiato,
  ricezioneFotoCambiata,
  offertaAlbumChiusa,
  offertaAlbumRicevuta,
  progressoAlbumCambiato,
} from '../store/albumSlice';
import {
  contattoBloccato,
  contattoRimosso,
  messaggioInviato,
  messaggioRicevuto,
  notificaMessaggioRichiesta,
  presenzaContattoCambiata,
  relazioneDisattivata,
  relayDisconnesso,
} from '../store/eventi';
import { erroreMostrato } from '../store/feedbackSlice';
import type { StartListening } from '../store/listenerMiddleware';
import type { AppStore } from '../store/store';
let store: Pick<AppStore, 'dispatch' | 'getState'>;

type Incoming = {
  peer: TacitusId;
  id: string;
  sizes: number[];
  accepted: boolean;
  images: Uint8Array[];
  index: number;
  offset: number;
  timer?: ReturnType<typeof setTimeout>;
};
type Outgoing = {
  peer: TacitusId;
  id: string;
  next?: (frame: AlbumFrame) => void;
  reject?: (reason: Error) => void;
};
// ponytail: one transfer in each direction bounds image buffers to 100 MiB; add a queue only if needed.
const incoming = new Map<TacitusId, Incoming>();
let outgoing: Outgoing | undefined;

const send = (peer: TacitusId, frame: AlbumFrame) => {
  const body = sessioniSicureAttive.cifraContenuto(
    peer,
    JSON.stringify(frame),
    Date.now(),
  );
  leggiRelay().inviaMessaggio(peer, body);
};
const report = (reason: unknown) => {
  store.dispatch(
    erroreMostrato(
      reason instanceof DOMException && reason.name === 'QuotaExceededError'
        ? 'Spazio locale esaurito. Album non salvato.'
        : reason instanceof Error
          ? reason.message
          : 'Trasferimento Album non riuscito.',
    ),
  );
};
const progress = (tacitusId: TacitusId, testo?: string) =>
  store.dispatch(progressoAlbumCambiato({ tacitusId, testo }));
const removeIncoming = (transfer: Incoming) => {
  clearTimeout(transfer.timer);
  if (incoming.get(transfer.peer) !== transfer) return;
  incoming.delete(transfer.peer);
  store.dispatch(offertaAlbumChiusa(transfer.peer));
  progress(transfer.peer);
};
const touch = (transfer: Incoming, timeout = 30_000) => {
  clearTimeout(transfer.timer);
  transfer.timer = setTimeout(() => {
    removeIncoming(transfer);
    try {
      send(transfer.peer, { type: 'album.cancel', id: transfer.id });
    } catch {
      /* disconnected */
    }
    report(new Error('Trasferimento Album scaduto. Puoi riprovare.'));
  }, timeout);
};
const allowed = (peer: TacitusId) => {
  const state = store.getState();
  return (
    !!state.relazioni.contatti[peer] &&
    state.album.preferenze.abilitate &&
    state.album.preferenze.contatti[peer] !== 'block'
  );
};

export const rispondiAlbum = (peer: TacitusId, accepted: boolean): void => {
  const transfer = incoming.get(peer);
  if (!transfer) return;
  if (accepted && !allowed(peer)) accepted = false;
  if (
    accepted &&
    [...incoming.values()].some(item => item !== transfer && item.accepted)
  )
    accepted = false;
  if (accepted) {
    transfer.accepted = true;
    store.dispatch(
      consensoFotoCambiato({ tacitusId: peer, consenso: 'allow' }),
    );
    store.dispatch(offertaAlbumChiusa(peer));
    progress(peer, 'Ricezione album…');
    touch(transfer);
  } else removeIncoming(transfer);
  try {
    send(peer, { type: 'album.answer', id: transfer.id, accepted });
  } catch (reason) {
    removeIncoming(transfer);
    report(reason);
  }
};

export const rifiutaFoto = (peer: TacitusId): void => {
  rispondiAlbum(peer, false);
  store.dispatch(consensoFotoCambiato({ tacitusId: peer, consenso: 'block' }));
};

const waitFor = (
  transfer: Outgoing,
  frame: AlbumFrame,
  match: (reply: AlbumFrame) => boolean,
  timeout: number,
): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error('Trasferimento Album scaduto. Puoi riprovare.')),
      timeout,
    );
    const finish = (reason?: Error) => {
      clearTimeout(timer);
      transfer.next = undefined;
      transfer.reject = undefined;
      if (reason) reject(reason);
      else resolve();
    };
    transfer.reject = finish;
    transfer.next = reply => {
      if (
        reply.type === 'album.cancel' ||
        (reply.type === 'album.answer' && !reply.accepted)
      )
        finish(new Error('Album rifiutato dal Contatto.'));
      else if (match(reply)) finish();
    };
    try {
      send(transfer.peer, frame);
    } catch (reason) {
      finish(
        reason instanceof Error
          ? reason
          : new Error('Invio Album non riuscito.'),
      );
    }
  });

export const inviaAlbum = async (
  peer: TacitusId,
  images: Uint8Array[],
): Promise<boolean> => {
  if (outgoing) throw new Error('Attendi la fine dell’album in uscita.');
  if (!images.length || images.length > 10)
    throw new Error('Scegli da 1 a 10 foto.');
  images.forEach(validateWebP);
  if (!sessioniSicureAttive.pronta(peer))
    throw new Error('Sessione sicura assente.');
  const transfer: Outgoing = { peer, id: crypto.randomUUID() };
  outgoing = transfer;
  const identity = leggiIdentitaLocale();
  const creatoIl = Date.now();
  let completed = false;
  try {
    progress(peer, 'Preparazione album…');
    await saveAlbum(identity, peer, transfer.id, images);
    if (outgoing !== transfer)
      throw new Error('Trasferimento Album interrotto.');
    progress(peer, 'In attesa del consenso…');
    await waitFor(
      transfer,
      {
        type: 'album.offer',
        id: transfer.id,
        sizes: images.map(image => image.length),
      },
      reply => reply.type === 'album.answer' && reply.accepted,
      120_000,
    );
    for (let index = 0; index < images.length; index++) {
      const image = images[index];
      for (let offset = 0; offset < image.length; offset += CHUNK_BYTES) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (outgoing !== transfer)
          throw new Error('Trasferimento Album interrotto.');
        const chunk = image.subarray(offset, offset + CHUNK_BYTES);
        progress(
          peer,
          `Invio foto ${index + 1}/${images.length} · ${Math.round((100 * (offset + chunk.length)) / image.length)}%`,
        );
        await waitFor(
          transfer,
          {
            type: 'album.chunk',
            id: transfer.id,
            index,
            offset,
            data: toBase64Url(chunk),
          },
          reply =>
            reply.type === 'album.ack' &&
            reply.index === index &&
            reply.offset === offset + chunk.length,
          30_000,
        );
      }
    }
    if (outgoing !== transfer || !store.getState().relazioni.contatti[peer])
      throw new Error('Trasferimento Album interrotto.');
    store.dispatch(
      messaggioInviato({
        tacitusId: peer,
        messaggio: {
          id: transfer.id,
          direzione: 'inviato',
          testo: '',
          creatoIl,
          album: { id: transfer.id, count: images.length },
        },
      }),
    );
    completed = true;
  } catch (reason) {
    try {
      send(peer, { type: 'album.cancel', id: transfer.id });
    } catch {
      /* disconnected */
    }
    report(reason);
  } finally {
    if (outgoing === transfer) {
      outgoing = undefined;
      progress(peer);
    }
    if (!completed) await deleteContactAlbums(peer, transfer.id).catch(report);
  }
  return completed;
};

export const riceviAlbum = async (
  peer: TacitusId,
  content: string,
): Promise<void> => {
  const frame = parseAlbumFrame(content);
  if (frame.type === 'album.offer') {
    if (
      !allowed(peer) ||
      incoming.has(peer) ||
      incoming.size >= 5 ||
      [...incoming.values()].some(item => item.accepted)
    ) {
      send(peer, { type: 'album.answer', id: frame.id, accepted: false });
      return;
    }
    const transfer: Incoming = {
      peer,
      id: frame.id,
      sizes: frame.sizes,
      accepted: false,
      images: [],
      index: 0,
      offset: 0,
    };
    incoming.set(peer, transfer);
    touch(transfer, 120_000);
    if (store.getState().album.preferenze.contatti[peer] === 'allow')
      rispondiAlbum(peer, true);
    else {
      store.dispatch(
        offertaAlbumRicevuta({
          tacitusId: peer,
          id: frame.id,
          count: frame.sizes.length,
        }),
      );
      store.dispatch(notificaMessaggioRichiesta(peer));
    }
    return;
  }
  if (outgoing?.peer === peer && outgoing.id === frame.id)
    outgoing.next?.(frame);
  const transfer = incoming.get(peer);
  if (!transfer || transfer.id !== frame.id) return;
  if (frame.type === 'album.cancel') {
    removeIncoming(transfer);
    return;
  }
  if (frame.type !== 'album.chunk') return;
  try {
    if (
      !allowed(peer) ||
      !transfer.accepted ||
      frame.index !== transfer.index ||
      frame.offset !== transfer.offset
    )
      throw new Error('Album ricevuto non valido.');
    const chunk = fromBase64Url(frame.data);
    const size = transfer.sizes[transfer.index];
    if (chunk.length !== Math.min(CHUNK_BYTES, size - transfer.offset))
      throw new Error('Album ricevuto non valido.');
    const bytes = (transfer.images[transfer.index] ??= new Uint8Array(size));
    bytes.set(chunk, transfer.offset);
    transfer.offset += chunk.length;
    if (transfer.offset === size) {
      validateWebP(bytes);
      try {
        const bitmap = await createImageBitmap(
          new Blob([new Uint8Array(bytes)], { type: 'image/webp' }),
        );
        bitmap.close();
      } catch {
        throw new Error('Album ricevuto non valido.');
      }
      if (incoming.get(peer) !== transfer || !allowed(peer)) return;
      transfer.index++;
      transfer.offset = 0;
    }
    progress(
      peer,
      `Ricezione foto ${Math.min(transfer.index + 1, transfer.sizes.length)}/${transfer.sizes.length}`,
    );
    if (transfer.index === transfer.sizes.length) {
      await saveAlbum(
        leggiIdentitaLocale(),
        peer,
        transfer.id,
        transfer.images,
      );
      if (incoming.get(peer) !== transfer || !allowed(peer)) {
        await deleteContactAlbums(peer, transfer.id);
        return;
      }
      store.dispatch(
        messaggioRicevuto({
          tacitusId: peer,
          messaggio: {
            id: transfer.id,
            direzione: 'ricevuto',
            testo: '',
            creatoIl: Date.now(),
            album: { id: transfer.id, count: transfer.images.length },
          },
        }),
      );
      store.dispatch(notificaMessaggioRichiesta(peer));
      removeIncoming(transfer);
    } else touch(transfer);
    send(peer, {
      type: 'album.ack',
      id: transfer.id,
      index: frame.index,
      offset: frame.offset + chunk.length,
    });
  } catch (reason) {
    removeIncoming(transfer);
    try {
      send(peer, { type: 'album.cancel', id: transfer.id });
    } catch {
      /* disconnected */
    }
    report(reason);
  }
};

export const annullaAlbum = (peer?: TacitusId): void => {
  incoming.forEach(transfer => {
    if (!peer || transfer.peer === peer) {
      removeIncoming(transfer);
      try {
        send(transfer.peer, { type: 'album.cancel', id: transfer.id });
      } catch {
        /* disconnected */
      }
    }
  });
  if (outgoing && (!peer || outgoing.peer === peer)) {
    const transfer = outgoing;
    outgoing = undefined;
    transfer.reject?.(new Error('Trasferimento Album interrotto.'));
    progress(transfer.peer);
  }
};

export const registerAlbumListeners = (
  startListening: StartListening,
  appStore: Pick<AppStore, 'dispatch' | 'getState'>,
): void => {
  store = appStore;
  startListening({
    matcher: isAnyOf(contattoRimosso, contattoBloccato),
    effect: action => {
      if (contattoRimosso.match(action) || contattoBloccato.match(action)) {
        annullaAlbum(action.payload);
        void deleteContactAlbums(action.payload).catch(report);
      }
    },
  });
  startListening({
    actionCreator: relayDisconnesso,
    effect: () => annullaAlbum(),
  });
  startListening({
    actionCreator: relazioneDisattivata,
    effect: ({ payload }) => annullaAlbum(payload),
  });
  startListening({
    actionCreator: presenzaContattoCambiata,
    effect: ({ payload }) => {
      if (!payload.online) annullaAlbum(payload.tacitusId);
    },
  });
  startListening({
    actionCreator: consensoFotoCambiato,
    effect: ({ payload }) => {
      if (payload.consenso !== 'allow') {
        const transfer = incoming.get(payload.tacitusId);
        if (transfer && (transfer.accepted || payload.consenso === 'block')) {
          removeIncoming(transfer);
          try {
            send(transfer.peer, { type: 'album.cancel', id: transfer.id });
          } catch {
            /* disconnected */
          }
        }
      }
    },
  });
  startListening({
    actionCreator: ricezioneFotoCambiata,
    effect: ({ payload }) => {
      if (!payload)
        incoming.forEach(transfer => {
          removeIncoming(transfer);
          try {
            send(transfer.peer, { type: 'album.cancel', id: transfer.id });
          } catch {
            /* disconnected */
          }
        });
    },
  });
};
