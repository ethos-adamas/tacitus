import { createSlice } from '@reduxjs/toolkit';
import { relayConnesso, relayDisconnesso, relayInConnessione } from './eventi';

export type ConnessioneRelay = 'connecting' | 'online' | 'offline';

const connessioneRelaySlice = createSlice({
  name: 'connessioneRelay',
  initialState: 'offline' as ConnessioneRelay,
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(relayInConnessione, () => 'connecting')
      .addCase(relayConnesso, () => 'online')
      .addCase(relayDisconnesso, () => 'offline');
  },
});

export const connessioneRelayReducer = connessioneRelaySlice.reducer;
