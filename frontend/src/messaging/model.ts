export const MAX_MESSAGE_LENGTH = 4_000;

export type Message = {
  id: string;
  direction: 'incoming' | 'outgoing';
  text: string;
  createdAt: number;
};

export type Contact = {
  tacitusId: string;
  nickname?: string;
  pending: boolean;
  reactivationRequired: boolean;
  online: boolean;
  secure: boolean;
  unread: number;
  draft: string;
  messages: Message[];
};

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const normalizeTacitusId = (value: string) => {
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
  return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}-${raw.slice(20)}`;
};

export const createContact = (tacitusId: string): Contact => ({
  tacitusId: normalizeTacitusId(tacitusId),
  pending: true,
  reactivationRequired: false,
  online: false,
  secure: false,
  unread: 0,
  draft: '',
  messages: [],
});
