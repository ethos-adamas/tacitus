import type { TacitusId } from './tacitusId';

export type IntentoDiContatto = { tacitusId: TacitusId };

export type Contatto = {
  tacitusId: TacitusId;
  nickname: string;
};

export type Relazione = {
  tacitusId: TacitusId;
  stato: 'attiva' | 'da-riattivare';
};

export type PresenzaContatto = 'online' | 'offline';

export type StatoSessioneSicura = 'assente' | 'negoziazione' | 'pronta';

export type StatoContatto =
  | 'in-attesa'
  | 'offline'
  | 'negoziazione'
  | 'riattivazione-necessaria'
  | 'sessione-sicura';
