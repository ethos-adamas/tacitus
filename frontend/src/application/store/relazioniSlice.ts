import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type {
  Blocco,
  Contatto,
  IntentoDiContatto,
  Relazione,
} from '../../domain/relazioni';
import type { TacitusId } from '../../domain/tacitusId';
import {
  contattoAssociato,
  contattoBloccato,
  contattoRimosso,
  contattoSbloccato,
  intentoDiContattoAnnullato,
  intentoDiContattoCreato,
  relazioneDisattivata,
  relayConnesso,
} from './eventi';

export type RelazioniState = {
  blocchi: Record<TacitusId, Blocco>;
  intenti: Record<TacitusId, IntentoDiContatto>;
  contatti: Record<TacitusId, Contatto>;
  relazioni: Record<TacitusId, Relazione>;
};

const initialState: RelazioniState = {
  blocchi: {},
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
      })
      .addCase(contattoBloccato, (state, { payload }) => {
        state.blocchi[payload] = { tacitusId: payload };
        delete state.intenti[payload];
        delete state.contatti[payload];
        delete state.relazioni[payload];
      })
      .addCase(contattoSbloccato, (state, { payload }) => {
        delete state.blocchi[payload];
      });
  },
});

export const { relazioniCaricate } = relazioniSlice.actions;
export const relazioniReducer = relazioniSlice.reducer;
