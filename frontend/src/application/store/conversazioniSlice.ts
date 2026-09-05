import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import {
  creaConversazione,
  type Conversazione,
} from '../../domain/conversazioni';
import type { TacitusId } from '../../domain/tacitusId';
import {
  contattoAssociato,
  contattoBloccato,
  contattoRimosso,
  messaggioInviato,
  messaggioRicevuto,
} from './eventi';

export type ConversazioniState = {
  perContatto: Record<TacitusId, Conversazione>;
  idConversazioneAttiva?: TacitusId;
};

const initialState: ConversazioniState = { perContatto: {} };

const conversazioniSlice = createSlice({
  name: 'conversazioni',
  initialState,
  reducers: {
    conversazioniCaricate: (
      _state,
      { payload }: PayloadAction<ConversazioniState>,
    ) => ({ ...payload, idConversazioneAttiva: undefined }),
    conversazioneSelezionata: (
      state,
      { payload }: PayloadAction<TacitusId | undefined>,
    ) => {
      if (payload && !state.perContatto[payload]) return;
      state.idConversazioneAttiva = payload;
      if (payload) state.perContatto[payload].nonLetti = 0;
    },
    bozzaAggiornata: (
      state,
      { payload }: PayloadAction<{ tacitusId: TacitusId; bozza: string }>,
    ) => {
      state.perContatto[payload.tacitusId].bozza = payload.bozza;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(contattoAssociato, (state, { payload }) => {
        state.perContatto[payload.tacitusId] ??= creaConversazione(
          payload.tacitusId,
        );
      })
      .addCase(contattoRimosso, (state, { payload }) => {
        delete state.perContatto[payload];
        if (state.idConversazioneAttiva === payload) {
          state.idConversazioneAttiva = undefined;
        }
      })
      .addCase(contattoBloccato, (state, { payload }) => {
        delete state.perContatto[payload];
        if (state.idConversazioneAttiva === payload) {
          state.idConversazioneAttiva = undefined;
        }
      })
      .addCase(messaggioRicevuto, (state, { payload }) => {
        const conversazione = state.perContatto[payload.tacitusId];
        if (
          conversazione.messaggi.some(({ id }) => id === payload.messaggio.id)
        )
          return;
        conversazione.messaggi.push(payload.messaggio);
        if (state.idConversazioneAttiva !== payload.tacitusId) {
          conversazione.nonLetti += 1;
        }
      })
      .addCase(messaggioInviato, (state, { payload }) => {
        const conversazione = state.perContatto[payload.tacitusId];
        if (
          !conversazione.messaggi.some(({ id }) => id === payload.messaggio.id)
        ) {
          conversazione.messaggi.push(payload.messaggio);
        }
        if (!payload.messaggio.album) conversazione.bozza = '';
      });
  },
});

export const {
  bozzaAggiornata,
  conversazioneSelezionata,
  conversazioniCaricate,
} = conversazioniSlice.actions;
export const conversazioniReducer = conversazioniSlice.reducer;
