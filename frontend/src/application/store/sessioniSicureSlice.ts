import { createSlice } from '@reduxjs/toolkit';
import type { StatoSessioneSicura } from '../../domain/relazioni';
import type { TacitusId } from '../../domain/tacitusId';
import {
  contattoAssociato,
  contattoBloccato,
  contattoRimosso,
  presenzaContattoCambiata,
  relazioneDisattivata,
  relayDisconnesso,
  sessioneSicuraInNegoziazione,
  sessioneSicuraStabilita,
} from './eventi';
import { relazioniCaricate } from './relazioniSlice';

export type SessioniSicureState = Record<TacitusId, StatoSessioneSicura>;

const sessioniSicureSlice = createSlice({
  name: 'sessioniSicure',
  initialState: {} as SessioniSicureState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(contattoAssociato, (state, { payload }) => {
        if (!payload.online) state[payload.tacitusId] = 'assente';
        else if (state[payload.tacitusId] !== 'pronta')
          state[payload.tacitusId] = 'negoziazione';
      })
      .addCase(sessioneSicuraInNegoziazione, (state, { payload }) => {
        state[payload] = 'negoziazione';
      })
      .addCase(sessioneSicuraStabilita, (state, { payload }) => {
        state[payload] = 'pronta';
      })
      .addCase(presenzaContattoCambiata, (state, { payload }) => {
        if (!payload.online) state[payload.tacitusId] = 'assente';
        else if (state[payload.tacitusId] !== 'pronta')
          state[payload.tacitusId] = 'negoziazione';
      })
      .addCase(relazioneDisattivata, (state, { payload }) => {
        state[payload] = 'assente';
      })
      .addCase(contattoRimosso, (state, { payload }) => {
        delete state[payload];
      })
      .addCase(contattoBloccato, (state, { payload }) => {
        delete state[payload];
      })
      .addCase(relazioniCaricate, (_state, { payload }) =>
        Object.fromEntries(
          Object.keys(payload.contatti).map(tacitusId => [
            tacitusId,
            'assente' as const,
          ]),
        ),
      )
      .addCase(relayDisconnesso, state => {
        Object.keys(state).forEach(tacitusId => {
          state[tacitusId as TacitusId] = 'assente';
        });
      });
  },
});

export const sessioniSicureReducer = sessioniSicureSlice.reducer;
