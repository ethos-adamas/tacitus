import type { LocalIdentity } from './identityProvider';

let identita: LocalIdentity | undefined;

export const memorizzaIdentitaLocale = (value: LocalIdentity): void => {
  identita = value;
};

export const leggiIdentitaLocale = (): LocalIdentity => {
  if (!identita) throw new Error('Identità locale assente.');
  return identita;
};

export const rimuoviIdentitaLocale = (): void => {
  identita = undefined;
};
