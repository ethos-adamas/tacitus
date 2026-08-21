import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { IdentitaLocale } from '../../domain/identitaLocale';

export type IdentitaLocaleState =
  | { stato: 'caricamento' }
  | { stato: 'assente' }
  | { stato: 'pronta'; identita: IdentitaLocale };

const identitaLocaleSlice = createSlice({
  name: 'identitaLocale',
  initialState: { stato: 'caricamento' } as IdentitaLocaleState,
  reducers: {
    identitaLocaleAssente: () => ({ stato: 'assente' }) as const,
    identitaLocaleDisponibile: (
      _state,
      { payload }: PayloadAction<IdentitaLocale>,
    ) => ({ stato: 'pronta', identita: payload }) as const,
  },
});

export const { identitaLocaleAssente, identitaLocaleDisponibile } =
  identitaLocaleSlice.actions;
export const identitaLocaleReducer = identitaLocaleSlice.reducer;
