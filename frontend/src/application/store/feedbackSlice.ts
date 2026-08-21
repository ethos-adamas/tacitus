import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type FeedbackState = {
  errore?: string;
  avviso?: string;
};

const feedbackSlice = createSlice({
  name: 'feedback',
  initialState: {} as FeedbackState,
  reducers: {
    erroreMostrato: (state, { payload }: PayloadAction<string>) => {
      state.errore = payload;
    },
    erroreNascosto: state => {
      state.errore = undefined;
    },
    avvisoMostrato: (state, { payload }: PayloadAction<string>) => {
      state.avviso = payload;
    },
    avvisoNascosto: state => {
      state.avviso = undefined;
    },
  },
});

export const {
  avvisoMostrato,
  avvisoNascosto,
  erroreMostrato,
  erroreNascosto,
} = feedbackSlice.actions;
export const feedbackReducer = feedbackSlice.reducer;
