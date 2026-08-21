declare const tacitusIdBrand: unique symbol;

export type TacitusId = string & { readonly [tacitusIdBrand]: true };

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const parseTacitusId = (value: string): TacitusId => {
  const raw = value
    .toUpperCase()
    .replaceAll('-', '')
    .replaceAll(' ', '')
    .replaceAll('O', '0')
    .replaceAll('I', '1')
    .replaceAll('L', '1');
  if (!CROCKFORD.test(raw) || Number.parseInt(raw[0], 32) > 7) {
    throw new Error('Inserisci un Tacitus ID valido di 26 caratteri.');
  }
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}-${raw.slice(20)}` as TacitusId;
};
