import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TacitusId } from '../../domain/tacitusId';
import { contattoBloccato, contattoRimosso, relayDisconnesso } from './eventi';

export type ConsensoFoto = 'ask' | 'allow' | 'block';
export type PreferenzeAlbum = {
  abilitate: boolean;
  contatti: Record<TacitusId, ConsensoFoto>;
};
export type AnteprimaAlbumMeta = {
  fotoIds: string[];
  preparazione: boolean;
  invio: boolean;
};
type AlbumState = {
  preferenze: PreferenzeAlbum;
  anteprime: Record<TacitusId, AnteprimaAlbumMeta>;
  offerte: Record<TacitusId, { id: string; count: number }>;
  progresso: Record<TacitusId, string>;
};
const initialState: AlbumState = {
  preferenze: { abilitate: true, contatti: {} },
  anteprime: {},
  offerte: {},
  progresso: {},
};
const albumSlice = createSlice({
  name: 'album',
  initialState,
  reducers: {
    preferenzeAlbumCaricate: (
      state,
      { payload }: PayloadAction<PreferenzeAlbum>,
    ) => {
      state.preferenze = payload;
    },
    ricezioneFotoCambiata: (state, { payload }: PayloadAction<boolean>) => {
      state.preferenze.abilitate = payload;
    },
    anteprimaAlbumAggiornata: (
      state,
      {
        payload,
      }: PayloadAction<{ tacitusId: TacitusId; anteprima: AnteprimaAlbumMeta }>,
    ) => {
      state.anteprime[payload.tacitusId] = payload.anteprima;
    },
    anteprimaAlbumEliminata: (state, { payload }: PayloadAction<TacitusId>) => {
      delete state.anteprime[payload];
    },
    anteprimeAlbumSvuotate: state => {
      state.anteprime = {};
    },
    consensoFotoCambiato: (
      state,
      {
        payload,
      }: PayloadAction<{ tacitusId: TacitusId; consenso: ConsensoFoto }>,
    ) => {
      state.preferenze.contatti[payload.tacitusId] = payload.consenso;
    },
    offertaAlbumRicevuta: (
      state,
      {
        payload,
      }: PayloadAction<{ tacitusId: TacitusId; id: string; count: number }>,
    ) => {
      state.offerte[payload.tacitusId] = {
        id: payload.id,
        count: payload.count,
      };
    },
    offertaAlbumChiusa: (state, { payload }: PayloadAction<TacitusId>) => {
      delete state.offerte[payload];
    },
    progressoAlbumCambiato: (
      state,
      { payload }: PayloadAction<{ tacitusId: TacitusId; testo?: string }>,
    ) => {
      if (payload.testo) state.progresso[payload.tacitusId] = payload.testo;
      else delete state.progresso[payload.tacitusId];
    },
  },
  extraReducers: builder => {
    const remove = (
      state: AlbumState,
      { payload }: PayloadAction<TacitusId>,
    ) => {
      delete state.preferenze.contatti[payload];
      delete state.anteprime[payload];
      delete state.offerte[payload];
      delete state.progresso[payload];
    };
    builder
      .addCase(contattoRimosso, remove)
      .addCase(contattoBloccato, remove)
      .addCase(relayDisconnesso, state => {
        state.offerte = {};
        state.progresso = {};
      });
  },
});
export const {
  preferenzeAlbumCaricate,
  ricezioneFotoCambiata,
  anteprimaAlbumAggiornata,
  anteprimaAlbumEliminata,
  anteprimeAlbumSvuotate,
  consensoFotoCambiato,
  offertaAlbumRicevuta,
  offertaAlbumChiusa,
  progressoAlbumCambiato,
} = albumSlice.actions;
export const albumReducer = albumSlice.reducer;
