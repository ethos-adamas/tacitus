import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { PermessoNotifiche } from '../../domain/preferenze';

export type NotificheState = {
  abilitate: boolean;
  permesso: PermessoNotifiche;
};

const initialState: NotificheState = {
  abilitate: false,
  permesso: 'default',
};

const notificheSlice = createSlice({
  name: 'notifiche',
  initialState,
  reducers: {
    notificheConfigurate: (
      _state,
      { payload }: PayloadAction<NotificheState>,
    ) => payload,
    notificheDisabilitate: state => {
      state.abilitate = false;
    },
  },
});

export const { notificheConfigurate, notificheDisabilitate } =
  notificheSlice.actions;
export const notificheReducer = notificheSlice.reducer;
