import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  IdentityDocument,
  authenticationPayload,
} from '../generated/tacitus_protocol';
import { fromBase64Url, toBase64Url } from './base64Url';

export type LocalIdentity = {
  nickname: string;
  tacitusId: string;
  publicKey: Uint8Array;
  native: boolean;
  privateKey?: CryptoKey;
  storageKey?: CryptoKey;
};

type IdentityProvider = {
  create: (nickname: string) => Promise<LocalIdentity>;
  sign: (identity: LocalIdentity, payload: Uint8Array) => Promise<Uint8Array>;
};

const bytes = (value: Uint8Array): Uint8Array<ArrayBuffer> =>
  new Uint8Array(value);

const createIdentityDocument = (nickname: string, publicKey: Uint8Array) => {
  const document = new IdentityDocument(nickname, publicKey);
  const identity = {
    nickname: document.nickname,
    tacitusId: document.id,
  };
  document.free();
  return identity;
};

const browserIdentityProvider: IdentityProvider = {
  create: async nickname => {
    const pair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign', 'verify'],
    );
    const publicKey = new Uint8Array(
      await crypto.subtle.exportKey('raw', pair.publicKey),
    );
    return {
      ...createIdentityDocument(nickname, publicKey),
      publicKey,
      native: false,
      privateKey: pair.privateKey,
      storageKey: await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      ),
    };
  },
  sign: async (identity, payload) => {
    if (!identity.privateKey) throw new Error('Chiave privata assente.');
    return new Uint8Array(
      await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        identity.privateKey,
        bytes(payload),
      ),
    );
  },
};

const nativeIdentityProvider: IdentityProvider = {
  create: async nickname => {
    const response = await invoke<{ publicKey: string }>(
      'plugin:identity|get_or_create',
      {
        payload: { nickname: nickname.trim().toLowerCase() },
      },
    );
    const publicKey = fromBase64Url(response.publicKey);
    return {
      ...createIdentityDocument(nickname, publicKey),
      publicKey,
      native: true,
    };
  },
  sign: async (_identity, payload) => {
    const response = await invoke<{ value: string }>('plugin:identity|sign', {
      payload: { value: toBase64Url(payload) },
    });
    return fromBase64Url(response.value);
  },
};

const identityProvider = () =>
  isTauri() ? nativeIdentityProvider : browserIdentityProvider;

export const identityDocument = (identity: LocalIdentity) =>
  new IdentityDocument(identity.nickname, identity.publicKey);

export const createIdentity = (nickname: string) =>
  identityProvider().create(nickname);

export const sign = (identity: LocalIdentity, payload: Uint8Array) =>
  identityProvider().sign(identity, payload);

export const authenticationSignature = (
  identity: LocalIdentity,
  nonce: string,
) =>
  sign(
    identity,
    authenticationPayload(identity.nickname, identity.publicKey, nonce),
  );
