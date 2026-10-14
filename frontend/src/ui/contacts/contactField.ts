import type { TacitusId } from '../../domain/tacitusId';

// Each theme defines this many --field-N colours; a Contatto keeps the same one on every device.
export const CONTACT_FIELDS = 6;

export const contactField = (tacitusId: TacitusId): number =>
  [...tacitusId].reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0,
    7,
  ) % CONTACT_FIELDS;
