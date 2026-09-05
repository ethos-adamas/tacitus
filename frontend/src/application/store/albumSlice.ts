import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { TacitusId } from '../../domain/tacitusId';
import { contattoBloccato, contattoRimosso, relayDisconnesso } from './eventi';

export type ConsensoFoto = 'ask' | 'allow' | 'block';
export type PreferenzeAlbum = {
  abilitate: boolean;
  contatti: Record<TacitusId, ConsensoFoto>;
};
type AlbumState = {
  preferenze: PreferenzeAlbum;
  offerte: Record<TacitusId, { id: string; count: number }>;
  progresso: Record<TacitusId, string>;
};
const initialState: AlbumState = {
  preferenze: { abilitate: true, contatti: {} },
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
  consensoFotoCambiato,
  offertaAlbumRicevuta,
  offertaAlbumChiusa,
  progressoAlbumCambiato,
} = albumSlice.actions;
export const albumReducer = albumSlice.reducer;
