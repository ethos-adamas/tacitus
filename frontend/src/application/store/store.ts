import { registerAlbumListeners } from '../album/trasferimentiAlbum';
import { albumReducer } from './albumSlice';
import { configureStore } from '@reduxjs/toolkit';
import { registerMessaggiListeners } from '../listeners/messaggiListeners';
import { registerNotificheListeners } from '../listeners/notificheListeners';
import { registerPersistenzaListeners } from '../listeners/persistenzaListeners';
import { registerSessioniSicureListeners } from '../listeners/sessioniSicureListeners';
import { sessioniSicureAttive } from '../../infrastructure/secure-session/sessioniSicureAttive';
import { connessioneRelayReducer } from './connessioneRelaySlice';
import { conversazioniReducer } from './conversazioniSlice';
import { feedbackReducer } from './feedbackSlice';
import { identitaLocaleReducer } from './identitaLocaleSlice';
import { notificheReducer } from './notificheSlice';
import { presenzeContattiReducer } from './presenzeContattiSlice';
import { relazioniReducer } from './relazioniSlice';
import { sessioniSicureReducer } from './sessioniSicureSlice';
import { temaReducer } from './temaSlice';
import { listenerMiddleware } from './listenerMiddleware';

const reducers = {
  album: albumReducer,
  connessioneRelay: connessioneRelayReducer,
  conversazioni: conversazioniReducer,
  feedback: feedbackReducer,
  identitaLocale: identitaLocaleReducer,
  notifiche: notificheReducer,
  presenzeContatti: presenzeContattiReducer,
  relazioni: relazioniReducer,
  sessioniSicure: sessioniSicureReducer,
  tema: temaReducer,
};

export const createTestStore = () =>
  configureStore({
    reducer: reducers,
  });

registerSessioniSicureListeners(
  listenerMiddleware.startListening,
  sessioniSicureAttive,
);
registerMessaggiListeners(
  listenerMiddleware.startListening,
  sessioniSicureAttive,
);
registerNotificheListeners(listenerMiddleware.startListening);
registerPersistenzaListeners(listenerMiddleware.startListening);

export const store = configureStore({
  reducer: reducers,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware().prepend(listenerMiddleware.middleware),
});

registerAlbumListeners(listenerMiddleware.startListening, store);

export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
export type RootState = ReturnType<typeof store.getState>;
