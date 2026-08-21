import type { Messaggio } from './messaggi';
import type { TacitusId } from './tacitusId';

export type Conversazione = {
  tacitusId: TacitusId;
  bozza: string;
  messaggi: Messaggio[];
  nonLetti: number;
};

export const creaConversazione = (tacitusId: TacitusId): Conversazione => ({
  tacitusId,
  bozza: '',
  messaggi: [],
  nonLetti: 0,
});
