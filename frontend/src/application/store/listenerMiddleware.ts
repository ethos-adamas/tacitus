import { createListenerMiddleware } from '@reduxjs/toolkit';

export const listenerMiddleware = createListenerMiddleware();
export type StartListening = typeof listenerMiddleware.startListening;
