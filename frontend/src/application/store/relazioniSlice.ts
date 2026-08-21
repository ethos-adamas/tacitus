import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  Contatto,
  IntentoDiContatto,
  Relazione,
} from '../../domain/relazioni';
import type { TacitusId } from '../../domain/tacitusId';
import {
  contattoAssociato,
  contattoRimosso,
  intentoDiContattoAnnullato,
  intentoDiContattoCreato,
  relazioneDisattivata,
  relayConnesso,
} from './eventi';

export type RelazioniState = {
  intenti: Record<TacitusId, IntentoDiContatto>;
  contatti: Record<TacitusId, Contatto>;
  relazioni: Record<TacitusId, Relazione>;
};

const initialState: RelazioniState = {
  intenti: {},
  contatti: {},
  relazioni: {},
};

const relazioniSlice = createSlice({
  name: 'relazioni',
  initialState,
  reducers: {
    relazioniCaricate: (_state, { payload }: PayloadAction<RelazioniState>) =>
      payload,
  },
  extraReducers: builder => {
    builder
      .addCase(intentoDiContattoCreato, (state, { payload }) => {
        state.intenti[payload] = { tacitusId: payload };
      })
      .addCase(intentoDiContattoAnnullato, (state, { payload }) => {
        delete state.intenti[payload];
      })
      .addCase(contattoAssociato, (state, { payload }) => {
        delete state.intenti[payload.tacitusId];
        state.contatti[payload.tacitusId] = {
          tacitusId: payload.tacitusId,
          nickname: payload.nickname,
        };
        state.relazioni[payload.tacitusId] = {
          tacitusId: payload.tacitusId,
          stato: 'attiva',
        };
      })
      .addCase(relazioneDisattivata, (state, { payload }) => {
        const relazione = state.relazioni[payload];
        if (relazione) relazione.stato = 'da-riattivare';
      })
      .addCase(relayConnesso, state => {
        Object.values(state.relazioni).forEach(relazione => {
          relazione.stato = 'da-riattivare';
        });
      })
      .addCase(contattoRimosso, (state, { payload }) => {
        delete state.intenti[payload];
        delete state.contatti[payload];
        delete state.relazioni[payload];
      });
  },
});

export const { relazioniCaricate } = relazioniSlice.actions;
export const relazioniReducer = relazioniSlice.reducer;
