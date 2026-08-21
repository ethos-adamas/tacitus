export const toBase64Url = (value: Uint8Array): string => {
  const binary = Array.from(value, byte => String.fromCharCode(byte)).join('');
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
};

export const fromBase64Url = (value: string): Uint8Array => {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};
