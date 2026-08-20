import { IdentityDocument, authenticationPayload } from './generated/tacitus_protocol'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { saveIdentity, type LocalIdentity } from './storage'

function bytes(value: Uint8Array): Uint8Array<ArrayBuffer> { return new Uint8Array(value) }

export function identityDocument(identity: LocalIdentity) {
  return new IdentityDocument(identity.nickname, identity.publicKey)
}

export async function createIdentity(nickname: string): Promise<LocalIdentity> {
  if (isTauri()) {
    const response = await invoke<{ publicKey: string }>('plugin:identity|get_or_create', {
      payload: { nickname: nickname.trim().toLowerCase() },
    })
    const publicKey = fromBase64Url(response.publicKey)
    const document = new IdentityDocument(nickname, publicKey)
    const identity: LocalIdentity = {
      nickname: document.nickname,
      tacitusId: document.id,
      publicKey,
      native: true,
    }
    document.free()
    await saveIdentity(identity)
    return identity
  }
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign', 'verify'],
  )
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  const document = new IdentityDocument(nickname, publicKey)
  const identity: LocalIdentity = {
    nickname: document.nickname,
    tacitusId: document.id,
    publicKey,
    native: false,
    privateKey: pair.privateKey,
    storageKey: await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    ),
  }
  document.free()
  await saveIdentity(identity)
  return identity
}

export async function sign(identity: LocalIdentity, payload: Uint8Array) {
  if (identity.native) {
    const response = await invoke<{ value: string }>('plugin:identity|sign', {
      payload: { value: base64Url(payload) },
    })
    return fromBase64Url(response.value)
  }
  if (!identity.privateKey) throw new Error('Chiave privata assente.')
  return new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    identity.privateKey,
    bytes(payload),
  ))
}

function fromBase64Url(value: string) {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

export async function authenticationSignature(identity: LocalIdentity, nonce: string) {
  return sign(identity, authenticationPayload(identity.nickname, identity.publicKey, nonce))
}

export function base64Url(value: Uint8Array) {
  let binary = ''
  for (const byte of value) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
