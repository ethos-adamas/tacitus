import type { RelayCommands } from './relayConnection';

let relay: RelayCommands | undefined;

export const registraRelay = (value: RelayCommands): void => {
  relay = value;
};

export const leggiRelay = (): RelayCommands => {
  if (!relay) throw new Error('Connessione Relay assente.');
  return relay;
};

export const rimuoviRelay = (value: RelayCommands): void => {
  if (relay === value) relay = undefined;
};
