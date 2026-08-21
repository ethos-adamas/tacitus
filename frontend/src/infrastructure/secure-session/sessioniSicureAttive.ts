import { leggiRelay } from '../relay/relayAttivo';
import { createSessioniSicure } from './sessioniSicure';

export const sessioniSicureAttive = createSessioniSicure((tacitusId, body) =>
  leggiRelay().inviaHandshake(tacitusId, body),
);
