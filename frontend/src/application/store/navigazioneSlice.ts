import { createSlice } from '@reduxjs/toolkit';

const navigazioneSlice = createSlice({
  name: 'navigazione',
  initialState: { contattiRidotti: false },
  reducers: {
    pannelloContattiAlternato: state => {
      state.contattiRidotti = !state.contattiRidotti;
    },
  },
});

export const { pannelloContattiAlternato } = navigazioneSlice.actions;
export const navigazioneReducer = navigazioneSlice.reducer;
