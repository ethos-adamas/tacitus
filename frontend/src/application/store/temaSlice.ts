import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SceltaTema, Tema } from '../../domain/preferenze';

export type TemaState = { scelta: SceltaTema; effettivo: Tema };

const temaSlice = createSlice({
  name: 'tema',
  initialState: { scelta: 'system', effettivo: 'light' } as TemaState,
  reducers: {
    sceltaTemaCambiata: (_state, { payload }: PayloadAction<TemaState>) =>
      payload,
    temaDiSistemaCambiato: (
      state,
      { payload }: PayloadAction<Exclude<Tema, 'retro'>>,
    ) => {
      if (state.scelta === 'system') state.effettivo = payload;
    },
  },
});

export const { sceltaTemaCambiata, temaDiSistemaCambiato } = temaSlice.actions;
export const temaReducer = temaSlice.reducer;
