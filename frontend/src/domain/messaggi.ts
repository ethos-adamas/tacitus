export const MAX_MESSAGE_LENGTH = 4_000;

export type Messaggio = {
  id: string;
  direzione: 'ricevuto' | 'inviato';
  testo: string;
  creatoIl: number;
  album?: { id: string; count: number };
};
