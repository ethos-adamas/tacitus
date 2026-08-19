export const NICKNAME_PATTERN = /^[a-z0-9_]{3,24}$/
export const MAX_MESSAGE_LENGTH = 4_000

export type ContactStatus = 'inactive' | 'pending' | 'active' | 'blocked'

export type ContactKey = {
  fingerprint: string
  publicKey: string
  userIds: string[]
}

export type MessageContent = {
  v: 1
  message_id: string
  relationship_epoch: string
  sequence: number
  from_fingerprint: string
  to_fingerprint: string
  created_at: string
  text: string
}

export type ConversationEntry =
  | {
      kind: 'message'
      direction: 'incoming' | 'outgoing'
      messageId: string
      ciphertext: string
      createdAt: string
    }
  | {
      kind: 'fingerprint-changed'
      from: string
      to: string
      createdAt: string
    }

export type Contact = {
  id: string
  nickname?: string
  currentFingerprint: string
  keys: ContactKey[]
  status: ContactStatus
  online: boolean
  blocked: boolean
  unread: number
  relationshipEpoch?: string
  nextSequence: number
  highestReceivedSequence: number
  receivedMessageIds: string[]
  conversation: ConversationEntry[]
}

export const normalizeNickname = (nickname: string) =>
  nickname.trim().toLowerCase()

export const abbreviateFingerprint = (fingerprint: string) =>
  fingerprint.slice(0, 12).toUpperCase()

export function validateNickname(nickname: string) {
  if (!NICKNAME_PATTERN.test(normalizeNickname(nickname))) {
    throw new Error('Usa 3–24 caratteri: lettere minuscole, numeri o underscore.')
  }
}

export function createContact(key: ContactKey): Contact {
  return {
    id: crypto.randomUUID(),
    currentFingerprint: key.fingerprint,
    keys: [key],
    status: 'inactive',
    online: false,
    blocked: false,
    unread: 0,
    nextSequence: 1,
    highestReceivedSequence: 0,
    receivedMessageIds: [],
    conversation: [],
  }
}

export function activateRelation(
  contact: Contact,
  nickname: string,
  relationshipEpoch: string,
): Contact {
  const isNewEpoch = contact.relationshipEpoch !== relationshipEpoch
  return {
    ...contact,
    nickname,
    status: contact.blocked ? 'blocked' : 'active',
    relationshipEpoch,
    nextSequence: isNewEpoch ? 1 : contact.nextSequence,
    highestReceivedSequence: isNewEpoch ? 0 : contact.highestReceivedSequence,
    receivedMessageIds: isNewEpoch ? [] : contact.receivedMessageIds,
  }
}

export function changeContactKey(
  contact: Contact,
  key: ContactKey,
  createdAt = new Date().toISOString(),
): Contact {
  if (key.fingerprint === contact.currentFingerprint) {
    throw new Error('Questa è già la chiave corrente del contatto.')
  }

  return {
    ...contact,
    currentFingerprint: key.fingerprint,
    keys: [key, ...contact.keys.filter(({ fingerprint }) => fingerprint !== key.fingerprint)],
    status: contact.blocked ? 'blocked' : 'inactive',
    online: false,
    relationshipEpoch: undefined,
    nextSequence: 1,
    highestReceivedSequence: 0,
    receivedMessageIds: [],
    conversation: [
      ...contact.conversation,
      {
        kind: 'fingerprint-changed',
        from: contact.currentFingerprint,
        to: key.fingerprint,
        createdAt,
      },
    ],
  }
}

export function createMessageContent(
  text: string,
  fromFingerprint: string,
  contact: Contact,
): MessageContent {
  if (!contact.relationshipEpoch || contact.status !== 'active' || !contact.online) {
    throw new Error('Il contatto non è disponibile.')
  }
  if (!text.trim() || text.length > MAX_MESSAGE_LENGTH) {
    throw new Error(`Il messaggio deve contenere da 1 a ${MAX_MESSAGE_LENGTH} caratteri.`)
  }

  return {
    v: 1,
    message_id: crypto.randomUUID(),
    relationship_epoch: contact.relationshipEpoch,
    sequence: contact.nextSequence,
    from_fingerprint: fromFingerprint,
    to_fingerprint: contact.currentFingerprint,
    created_at: new Date().toISOString(),
    text,
  }
}

export function acceptIncomingMessage(
  contact: Contact,
  ownFingerprint: string,
  content: MessageContent,
): Contact {
  if (
    content.v !== 1 ||
    content.from_fingerprint !== contact.currentFingerprint ||
    content.to_fingerprint !== ownFingerprint ||
    content.relationship_epoch !== contact.relationshipEpoch ||
    !Number.isSafeInteger(content.sequence) ||
    content.sequence <= contact.highestReceivedSequence ||
    contact.receivedMessageIds.includes(content.message_id) ||
    !content.message_id ||
    !content.created_at ||
    typeof content.text !== 'string' ||
    content.text.length > MAX_MESSAGE_LENGTH
  ) {
    throw new Error('Messaggio rifiutato: firma o sequenza non valida.')
  }

  return {
    ...contact,
    highestReceivedSequence: content.sequence,
    receivedMessageIds: [...contact.receivedMessageIds, content.message_id],
  }
}
