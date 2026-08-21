import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  IdentityDocument,
  authenticationPayload,
} from '../../generated/tacitus_protocol';
import { parseTacitusId } from '../../domain/tacitusId';
import { fromBase64Url, toBase64Url } from '../encoding/base64Url';

type BrowserIdentity = {
  provider: 'browser';
  nickname: string;
  tacitusId: ReturnType<typeof parseTacitusId>;
  publicKey: Uint8Array;
  privateKey: CryptoKey;
  storageKey: CryptoKey;
};

type NativeIdentity = {
  provider: 'native';
  nickname: string;
  tacitusId: ReturnType<typeof parseTacitusId>;
  publicKey: Uint8Array;
};

export type LocalIdentity = BrowserIdentity | NativeIdentity;

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
    tacitusId: parseTacitusId(document.id),
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
      provider: 'browser',
      publicKey,
      privateKey: pair.privateKey,
      storageKey: await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
      ),
    };
  },
  sign: async (identity, payload) => {
    if (identity.provider !== 'browser') {
      throw new Error('Provider di Identità non valido.');
    }
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
      { payload: { nickname: nickname.trim().toLowerCase() } },
    );
    const publicKey = fromBase64Url(response.publicKey);
    return {
      ...createIdentityDocument(nickname, publicKey),
      provider: 'native',
      publicKey,
    };
  },
  sign: async (_identity, payload) => {
    const response = await invoke<{ value: string }>('plugin:identity|sign', {
      payload: { value: toBase64Url(payload) },
    });
    return fromBase64Url(response.value);
  },
};

const provider = (): IdentityProvider =>
  isTauri() ? nativeIdentityProvider : browserIdentityProvider;

export const createIdentity = (nickname: string) => provider().create(nickname);

export const sign = (identity: LocalIdentity, payload: Uint8Array) =>
  provider().sign(identity, payload);

export const identityDocument = (identity: LocalIdentity) =>
  new IdentityDocument(identity.nickname, identity.publicKey);

export const authenticationSignature = (
  identity: LocalIdentity,
  nonce: string,
) =>
  sign(
    identity,
    authenticationPayload(identity.nickname, identity.publicKey, nonce),
  );
