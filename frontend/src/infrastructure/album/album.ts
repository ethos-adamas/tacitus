import { encodeWebP } from '../../generated/tacitus_protocol';
import { fromBase64Url } from '../encoding/base64Url';

export const MAX_IMAGES = 10;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const CHUNK_BYTES = 18_000;
export type AlbumFrame =
  | { type: 'album.offer'; id: string; sizes: number[] }
  | { type: 'album.answer'; id: string; accepted: boolean }
  | {
      type: 'album.chunk';
      id: string;
      index: number;
      offset: number;
      data: string;
    }
  | { type: 'album.ack'; id: string; index: number; offset: number }
  | { type: 'album.cancel'; id: string };
export const validAlbumId = (id: unknown): id is string =>
  typeof id === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
const invalid = (): never => {
  throw new Error('Album ricevuto non valido.');
};
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

export const parseAlbumFrame = (content: string): AlbumFrame => {
  if (content.length > 32_000) return invalid();
  const item: unknown = JSON.parse(content);
  if (
    !item ||
    typeof item !== 'object' ||
    !('id' in item) ||
    !validAlbumId(item.id) ||
    !('type' in item)
  )
    return invalid();
  const { id, type } = item;
  if (
    type === 'album.offer' &&
    'sizes' in item &&
    Array.isArray(item.sizes) &&
    item.sizes.length >= 1 &&
    item.sizes.length <= MAX_IMAGES &&
    item.sizes.every(size => integer(size, 12, MAX_IMAGE_BYTES))
  )
    return { type, id, sizes: item.sizes };
  if (
    type === 'album.answer' &&
    'accepted' in item &&
    typeof item.accepted === 'boolean'
  )
    return { type, id, accepted: item.accepted };
  if (type === 'album.cancel') return { type, id };
  if (
    (type === 'album.chunk' || type === 'album.ack') &&
    'index' in item &&
    integer(item.index, 0, MAX_IMAGES - 1) &&
    'offset' in item &&
    integer(item.offset, 0, MAX_IMAGE_BYTES)
  ) {
    const base = { id, index: item.index, offset: item.offset };
    if (type === 'album.ack') return { type, ...base };
    if (
      'data' in item &&
      typeof item.data === 'string' &&
      /^[A-Za-z0-9_-]{2,24000}$/.test(item.data) &&
      fromBase64Url(item.data).length <= CHUNK_BYTES
    )
      return { type, ...base, data: item.data };
  }
  return invalid();
};

// Only bounded, static WebP bitstreams; metadata and animation chunks are rejected.
export const validateWebP = (bytes: Uint8Array): void => {
  const text = (offset: number, length: number) =>
    new TextDecoder().decode(bytes.subarray(offset, offset + length));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 20 ||
    bytes.length > MAX_IMAGE_BYTES ||
    text(0, 4) !== 'RIFF' ||
    text(8, 4) !== 'WEBP' ||
    view.getUint32(4, true) + 8 !== bytes.length
  )
    return invalid();
  let image = false;
  for (let p = 12; p < bytes.length;) {
    if (p + 8 > bytes.length) return invalid();
    const kind = text(p, 4),
      size = view.getUint32(p + 4, true),
      start = p + 8;
    if (size < 1 || start + size > bytes.length) return invalid();
    let width = 0,
      height = 0;
    if (
      kind === 'VP8 ' &&
      size >= 10 &&
      bytes[start + 3] === 0x9d &&
      bytes[start + 4] === 1 &&
      bytes[start + 5] === 0x2a
    ) {
      width = view.getUint16(start + 6, true) & 0x3fff;
      height = view.getUint16(start + 8, true) & 0x3fff;
    } else if (kind === 'VP8L' && size >= 5 && bytes[start] === 0x2f) {
      const bits = view.getUint32(start + 1, true);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    } else if (kind === 'VP8X' && size === 10 && (bytes[start] & ~0x30) === 0) {
      width =
        1 +
        bytes[start + 4] +
        (bytes[start + 5] << 8) +
        (bytes[start + 6] << 16);
      height =
        1 +
        bytes[start + 7] +
        (bytes[start + 8] << 8) +
        (bytes[start + 9] << 16);
    } else if (kind !== 'ALPH' && !(kind === 'ICCP' && size <= 4096))
      return invalid();
    if (
      kind !== 'ALPH' &&
      kind !== 'ICCP' &&
      (width < 1 || height < 1 || width > 2048 || height > 2048)
    )
      return invalid();
    if (kind === 'VP8 ' || kind === 'VP8L') {
      if (image) return invalid();
      image = true;
    }
    p = start + size + (size % 2);
    if (p > bytes.length) return invalid();
  }
  if (!image) return invalid();
};

export const prepareImages = async (files: File[]): Promise<Uint8Array[]> => {
  if (!files.length || files.length > MAX_IMAGES)
    throw new Error('Scegli da 1 a 10 foto.');
  const images: Uint8Array[] = [];
  for (const file of files) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
      throw new Error('Formato non supportato. Scegli JPEG, PNG o WebP.');
    if (file.size > 20 * 1024 * 1024)
      throw new Error('Foto troppo grande: massimo 20 MiB per file originale.');
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error('Impossibile leggere la foto.');
    }
    try {
      if (bitmap.width * bitmap.height > 24_000_000)
        throw new Error('Foto troppo grande: massimo 24 megapixel.');
      const scale = Math.min(1, 2048 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Conversione foto non disponibile.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve =>
        canvas.toBlob(resolve, 'image/webp', 0.85),
      );
      const image =
        blob?.type === 'image/webp'
          ? new Uint8Array(await blob.arrayBuffer())
          : encodeWebP(
              new Uint8Array(
                context.getImageData(0, 0, canvas.width, canvas.height).data,
              ),
              canvas.width,
              canvas.height,
            );
      if (image.length > MAX_IMAGE_BYTES)
        throw new Error(
          'Foto troppo grande: massimo 5 MiB dopo la conversione.',
        );
      validateWebP(image);
      images.push(image);
    } finally {
      bitmap.close();
    }
  }
  return images;
};
