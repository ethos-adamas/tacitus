import { createSlice } from '@reduxjs/toolkit';
import type { PresenzaContatto } from '../../domain/relazioni';
import type { TacitusId } from '../../domain/tacitusId';
import {
  contattoAssociato,
  contattoBloccato,
  contattoRimosso,
  presenzaContattoCambiata,
  relayDisconnesso,
} from './eventi';
import { relazioniCaricate } from './relazioniSlice';

export type PresenzeContattiState = Record<TacitusId, PresenzaContatto>;

const presenzeContattiSlice = createSlice({
  name: 'presenzeContatti',
  initialState: {} as PresenzeContattiState,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(contattoAssociato, (state, { payload }) => {
        state[payload.tacitusId] = payload.online ? 'online' : 'offline';
      })
      .addCase(presenzaContattoCambiata, (state, { payload }) => {
        state[payload.tacitusId] = payload.online ? 'online' : 'offline';
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
            'offline' as const,
          ]),
        ),
      )
      .addCase(relayDisconnesso, state => {
        Object.keys(state).forEach(tacitusId => {
          state[tacitusId as TacitusId] = 'offline';
        });
      });
  },
});

export const presenzeContattiReducer = presenzeContattiSlice.reducer;
