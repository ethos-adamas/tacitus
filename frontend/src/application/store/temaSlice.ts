import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Tema } from '../../domain/preferenze';

const temaSlice = createSlice({
  name: 'tema',
  initialState: 'light' as Tema,
  reducers: {
    temaSelezionato: (_state, { payload }: PayloadAction<Tema>) => payload,
  },
});

export const { temaSelezionato } = temaSlice.actions;
export const temaReducer = temaSlice.reducer;
