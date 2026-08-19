import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import {
  abbreviateFingerprint,
  acceptIncomingMessage,
  activateRelation,
  changeContactKey,
  createContact,
  createMessageContent,
  MAX_MESSAGE_LENGTH,
  normalizeNickname,
  validateNickname,
  type Contact,
  type ContactKey,
  type MessageContent,
} from './domain'
import {
  clearLocalData,
  decryptMessage,
  encryptMessage,
  importContactKey,
  importIdentityKeys,
  loadContacts,
  loadStoredIdentity,
  saveLocalData,
  signAuthentication,
  type IdentityKeys,
} from './secure-chat'

type Session = IdentityKeys & { nickname: string; publicArmoredKey: string }
type ConnectionStatus = 'connecting' | 'online' | 'disconnected'
type KeyDialog = { mode: 'add' } | { mode: 'update'; contactId: string }
type PendingSend = {
  requestId: string
  contactId: string
  content: MessageContent
  ciphertext: string
  text: string
}

const errorLabels: Record<string, string> = {
  invalid_request: 'Richiesta non valida.',
  authentication_failed: 'Autenticazione fallita.',
  nickname_unavailable: 'Nickname già associato a un’altra chiave.',
  rate_limited: 'Troppe richieste. Riprova tra poco.',
  contact_unavailable: 'Il contatto non è disponibile.',
  message_too_large: 'Il messaggio è troppo grande.',
  server_overloaded: 'Server temporaneamente sovraccarico.',
}

const socketUrl = () =>
  `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

function App() {
  const [storedIdentity, setStoredIdentity] = useState(loadStoredIdentity)
  const [nickname, setNickname] = useState(storedIdentity?.nickname ?? '')
  const [publicKey, setPublicKey] = useState(storedIdentity?.publicKey ?? '')
  const [privateKey, setPrivateKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [identityPreview, setIdentityPreview] = useState<IdentityKeys>()
  const [identityConfirmed, setIdentityConfirmed] = useState(false)
  const [session, setSession] = useState<Session>()
  const sessionRef = useRef<Session | undefined>(undefined)
  const [connection, setConnection] = useState<ConnectionStatus>('disconnected')
  const [contacts, setContacts] = useState<Contact[]>([])
  const contactsRef = useRef<Contact[]>([])
  const [activeContactId, setActiveContactId] = useState<string>()
  const activeContactIdRef = useRef<string | undefined>(undefined)
  const [plaintexts, setPlaintexts] = useState<Record<string, string>>({})
  const [composer, setComposer] = useState('')
  const [keyDialog, setKeyDialog] = useState<KeyDialog>()
  const [contactKey, setContactKey] = useState('')
  const [contactPreview, setContactPreview] = useState<ContactKey>()
  const [contactConfirmed, setContactConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [storageError, setStorageError] = useState('')
  const socketRef = useRef<WebSocket | undefined>(undefined)
  const pendingSendRef = useRef<PendingSend | undefined>(undefined)
  const receiveQueueRef = useRef(Promise.resolve())

  function replaceContacts(next: Contact[]) {
    contactsRef.current = next
    setContacts(next)
    const currentSession = sessionRef.current
    if (!currentSession) return
    try {
      saveLocalData({
        nickname: currentSession.nickname,
        publicKey: currentSession.publicArmoredKey,
        fingerprint: currentSession.fingerprint,
      }, next)
    } catch {
      setStorageError('Spazio locale esaurito. Nuovi invii bloccati per proteggere la cronologia.')
      socketRef.current?.close()
      throw new Error('Impossibile salvare la cronologia locale.')
    }
  }

  function updateContact(contactId: string, change: (contact: Contact) => Contact) {
    replaceContacts(contactsRef.current.map((contact) =>
      contact.id === contactId ? change(contact) : contact,
    ))
  }

  function send(type: string, fields: Record<string, unknown> = {}) {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      throw new Error('Connessione non disponibile.')
    }
    const requestId = crypto.randomUUID()
    socketRef.current.send(JSON.stringify({ v: 1, type, request_id: requestId, ...fields }))
    return requestId
  }

  async function restorePlaintexts(currentSession: Session, savedContacts: Contact[]) {
    const restored: Record<string, string> = {}
    for (const contact of savedContacts) {
      for (const entry of contact.conversation) {
        if (entry.kind !== 'message') continue
        try {
          const verificationKeys = entry.direction === 'outgoing'
            ? [currentSession.publicArmoredKey]
            : contact.keys.map((key) => key.publicKey)
          const content = await decryptMessage(entry.ciphertext, currentSession.privateKey, verificationKeys)
          const contactFingerprint = entry.direction === 'outgoing'
            ? content.to_fingerprint
            : content.from_fingerprint
          const ownFingerprint = entry.direction === 'outgoing'
            ? content.from_fingerprint
            : content.to_fingerprint
          if (
            content.message_id === entry.messageId &&
            ownFingerprint === currentSession.fingerprint &&
            contact.keys.some(({ fingerprint }) => fingerprint === contactFingerprint)
          ) restored[entry.messageId] = content.text
        } catch {
          // Invalid stored entries stay encrypted and are never rendered.
        }
      }
    }
    if (sessionRef.current === currentSession) setPlaintexts(restored)
  }

  function handleWireEvent(event: Record<string, unknown>, currentSession: Session) {
    const type = String(event.type ?? '')
    if (type === 'auth.challenge' && typeof event.nonce === 'string') {
      void signAuthentication(currentSession.nickname, event.nonce, currentSession.privateKey)
        .then((signature) => {
          if (sessionRef.current !== currentSession) return
          socketRef.current?.send(JSON.stringify({
            v: 1,
            type: 'auth.respond',
            nickname: currentSession.nickname,
            public_key: currentSession.publicArmoredKey,
            signature,
          }))
        })
        .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Firma fallita.'))
      return
    }
    if (type === 'auth.ready') {
      setConnection('online')
      return
    }

    const fingerprint = typeof event.fingerprint === 'string'
      ? event.fingerprint
      : typeof event.target_fingerprint === 'string'
        ? event.target_fingerprint
        : typeof event.from_fingerprint === 'string'
          ? event.from_fingerprint
          : ''
    const contact = contactsRef.current.find((item) => item.currentFingerprint === fingerprint)

    if (type === 'contact.pending' && contact) {
      updateContact(contact.id, (item) => ({ ...item, status: 'pending' }))
    } else if (
      type === 'contact.matched' && contact &&
      typeof event.nickname === 'string' && typeof event.relationship_epoch === 'string'
    ) {
      updateContact(contact.id, (item) =>
        activateRelation(item, event.nickname as string, event.relationship_epoch as string),
      )
    } else if (type === 'presence.changed' && contact && typeof event.online === 'boolean') {
      updateContact(contact.id, (item) => ({ ...item, online: event.online as boolean }))
    } else if (type === 'contact.state' && contact && event.active === false) {
      updateContact(contact.id, (item) => ({
        ...item,
        online: false,
        status: item.blocked ? 'blocked' : 'inactive',
        relationshipEpoch: undefined,
      }))
    } else if (
      type === 'contact.state' && contact && event.active === true &&
      typeof event.nickname === 'string' && typeof event.relationship_epoch === 'string'
    ) {
      updateContact(contact.id, (item) =>
        activateRelation(item, event.nickname as string, event.relationship_epoch as string),
      )
    } else if (
      type === 'message.sent' && pendingSendRef.current &&
      event.request_id === pendingSendRef.current.requestId
    ) {
      const pending = pendingSendRef.current
      pendingSendRef.current = undefined
      updateContact(pending.contactId, (item) => ({
        ...item,
        nextSequence: item.nextSequence + 1,
        conversation: [...item.conversation, {
          kind: 'message', direction: 'outgoing',
          messageId: pending.content.message_id,
          ciphertext: pending.ciphertext,
          createdAt: pending.content.created_at,
        }],
      }))
      setPlaintexts((current) => ({ ...current, [pending.content.message_id]: pending.text }))
      setComposer((current) => current === pending.text ? '' : current)
    } else if (
      type === 'message.received' && contact &&
      typeof event.ciphertext === 'string' && typeof event.message_id === 'string'
    ) {
      // ponytail: one queue preserves replay ordering; use per-contact queues if throughput matters.
      receiveQueueRef.current = receiveQueueRef.current.then(() =>
        receiveMessage(contact.id, event.ciphertext as string, event.message_id as string, currentSession),
      )
    } else if (type === 'error') {
      const code = String(event.code ?? '')
      setError(errorLabels[code] ?? 'Il server ha rifiutato la richiesta.')
      if (event.request_id === pendingSendRef.current?.requestId) pendingSendRef.current = undefined
    }
  }

  async function receiveMessage(
    contactId: string,
    ciphertext: string,
    externalMessageId: string,
    currentSession: Session,
  ) {
    try {
      const knownContact = contactsRef.current.find(({ id }) => id === contactId)
      if (!knownContact) return
      const content = await decryptMessage(
        ciphertext,
        currentSession.privateKey,
        knownContact.keys.map((key) => key.publicKey),
      )
      if (sessionRef.current !== currentSession) return
      const contact = contactsRef.current.find(({ id }) => id === contactId)
      if (!contact) return
      if (content.message_id !== externalMessageId) throw new Error('ID del messaggio non coerente.')
      const accepted = acceptIncomingMessage(contact, currentSession.fingerprint, content)
      const next = {
        ...accepted,
        unread: activeContactIdRef.current === contact.id ? 0 : accepted.unread + 1,
        conversation: [...accepted.conversation, {
          kind: 'message' as const, direction: 'incoming' as const,
          messageId: content.message_id, ciphertext, createdAt: content.created_at,
        }],
      }
      updateContact(contact.id, () => next)
      setPlaintexts((current) => ({ ...current, [content.message_id]: content.text }))
    } catch {
      setError('Messaggio ricevuto scartato: verifica non riuscita.')
    }
  }

  function connect(currentSession: Session) {
    socketRef.current?.close()
    setConnection('connecting')
    setError('')
    const socket = new WebSocket(socketUrl())
    socketRef.current = socket
    socket.onmessage = ({ data }) => {
      try {
        handleWireEvent(JSON.parse(String(data)) as Record<string, unknown>, currentSession)
      } catch {
        setError('Risposta del server non valida.')
      }
    }
    socket.onerror = () => setError('Connessione al server non riuscita.')
    socket.onclose = () => {
      if (socketRef.current !== socket) return
      setConnection('disconnected')
      replaceContacts(contactsRef.current.map((contact) => ({
        ...contact,
        online: false,
        status: contact.status === 'pending' ? 'inactive' : contact.status,
      })))
    }
  }

  async function submitIdentity(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      validateNickname(nickname)
      if (!identityPreview) {
        setIdentityPreview(await importIdentityKeys(publicKey, privateKey, passphrase))
        return
      }
      if (!identityConfirmed) throw new Error('Conferma i dati esposti prima di connetterti.')
      if (storedIdentity && (
        identityPreview.fingerprint !== storedIdentity.fingerprint ||
        normalizeNickname(nickname) !== storedIdentity.nickname
      )) throw new Error('Per cambiare identità usa prima “Cancella dati salvati”.')
      const currentSession: Session = {
        ...identityPreview,
        nickname: normalizeNickname(nickname),
        publicArmoredKey: publicKey.trim(),
      }
      const savedContacts = loadContacts(currentSession.fingerprint)
      sessionRef.current = currentSession
      contactsRef.current = savedContacts
      setSession(currentSession)
      setContacts(savedContacts)
      replaceContacts(savedContacts)
      setStoredIdentity({
        nickname: currentSession.nickname,
        publicKey: currentSession.publicArmoredKey,
        fingerprint: currentSession.fingerprint,
      })
      void restorePlaintexts(currentSession, savedContacts)
      connect(currentSession)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossibile importare l’identità.')
    }
  }

  function resetIdentityPreview() {
    setIdentityPreview(undefined)
    setIdentityConfirmed(false)
  }

  function openKeyDialog(dialog: KeyDialog) {
    setKeyDialog(dialog)
    setContactKey('')
    setContactPreview(undefined)
    setContactConfirmed(false)
    setError('')
  }

  function addIntent(contact: Contact) {
    if (connection !== 'online') throw new Error('Riconnettiti prima di attivare il contatto.')
    send('contact.add', { target_fingerprint: contact.currentFingerprint })
    updateContact(contact.id, (item) => ({ ...item, status: 'pending' }))
  }

  async function submitContact(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      if (!contactPreview) {
        setContactPreview(await importContactKey(contactKey))
        return
      }
      if (!contactConfirmed) throw new Error('Conferma i dati della chiave prima di salvarla.')
      if (contactPreview.fingerprint === session?.fingerprint) {
        throw new Error('Non puoi aggiungere la tua identità come contatto.')
      }

      let changed: Contact
      if (keyDialog?.mode === 'update') {
        const existing = contactsRef.current.find(({ id }) => id === keyDialog.contactId)
        if (!existing) throw new Error('Contatto non trovato.')
        if (connection !== 'online') throw new Error('Riconnettiti prima di aggiornare la chiave.')
        if (!existing.blocked) {
          send(existing.status === 'pending' ? 'contact.cancel' : 'contact.block', {
            target_fingerprint: existing.currentFingerprint,
          })
        }
        changed = changeContactKey(existing, contactPreview)
        replaceContacts(contactsRef.current.map((item) => item.id === existing.id ? changed : item))
      } else {
        const existing = contactsRef.current.find(({ currentFingerprint }) =>
          currentFingerprint === contactPreview.fingerprint,
        )
        changed = existing ?? createContact(contactPreview)
        if (!existing) replaceContacts([...contactsRef.current, changed])
      }
      setKeyDialog(undefined)
      if (!changed.blocked) addIntent(changed)
      selectContact(changed.id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossibile importare la chiave.')
    }
  }

  function selectContact(contactId: string) {
    activeContactIdRef.current = contactId
    setActiveContactId(contactId)
    updateContact(contactId, (contact) => ({ ...contact, unread: 0 }))
  }

  async function sendMessage() {
    const currentSession = sessionRef.current
    const contact = contactsRef.current.find(({ id }) => id === activeContactIdRef.current)
    if (!currentSession || !contact || pendingSendRef.current || storageError) return
    setError('')
    try {
      const content = createMessageContent(composer, currentSession.fingerprint, contact)
      const currentKey = contact.keys.find(({ fingerprint }) =>
        fingerprint === contact.currentFingerprint,
      )
      if (!currentKey) throw new Error('Chiave corrente del contatto non trovata.')
      const ciphertext = await encryptMessage(
        content, currentSession.publicKey, currentSession.privateKey, currentKey.publicKey,
      )
      const requestId = send('message.send', {
        to_fingerprint: contact.currentFingerprint,
        message_id: content.message_id,
        ciphertext,
      })
      pendingSendRef.current = {
        requestId, contactId: contact.id, content, ciphertext, text: composer,
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Invio non riuscito.')
    }
  }

  function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void sendMessage()
    }
  }

  function blockContact(contact: Contact) {
    try {
      send(contact.blocked ? 'contact.unblock' : 'contact.block', {
        target_fingerprint: contact.currentFingerprint,
      })
      updateContact(contact.id, (item) => ({
        ...item,
        blocked: !item.blocked,
        status: item.blocked ? 'inactive' : 'blocked',
        online: item.blocked ? item.online : false,
        relationshipEpoch: item.blocked ? item.relationshipEpoch : undefined,
      }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Azione non riuscita.')
    }
  }

  function cancelIntent(contact: Contact) {
    try {
      send('contact.cancel', { target_fingerprint: contact.currentFingerprint })
      updateContact(contact.id, (item) => ({ ...item, status: 'inactive' }))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Azione non riuscita.')
    }
  }

  function disconnect() {
    const socket = socketRef.current
    if (socket) {
      socket.onmessage = null
      socket.onerror = null
      socket.onclose = null
      socket.close()
    }
    socketRef.current = undefined
    pendingSendRef.current = undefined
    sessionRef.current = undefined
    setSession(undefined)
    setPrivateKey('')
    setPassphrase('')
    setIdentityPreview(undefined)
    setIdentityConfirmed(false)
    setPlaintexts({})
    setComposer('')
    setConnection('disconnected')
    setActiveContactId(undefined)
    activeContactIdRef.current = undefined
  }

  function deleteLocalData() {
    if (!confirm("Eliminare identità pubblica, contatti e tutte le cronologie locali? L'operazione non è reversibile.")) return
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      for (const contact of contactsRef.current.filter(({ status }) => status === 'active')) {
        send('contact.block', { target_fingerprint: contact.currentFingerprint })
      }
    }
    clearLocalData(sessionRef.current?.fingerprint ?? storedIdentity?.fingerprint)
    setStoredIdentity(undefined)
    setNickname('')
    setPublicKey('')
    contactsRef.current = []
    setContacts([])
    disconnect()
  }

  if (!session) {
    return (
      <main className="access-shell">
        <header className="brand"><span aria-hidden="true">◇</span> Secret Chat</header>
        <section className="access-card" aria-labelledby="access-title">
          <p className="eyebrow">Messaggistica privata</p>
          <h1 id="access-title">La conversazione resta vostra.</h1>
          <p className="lede">Importa la tua identità OpenPGP. La chiave privata e la passphrase restano in memoria in questo browser.</p>
          <form onSubmit={submitIdentity}>
            <label>Nickname
              <input value={nickname} onChange={(event) => { setNickname(event.target.value); resetIdentityPreview() }} required pattern="[a-z0-9_]{3,24}" autoComplete="username" placeholder="mario_rossi" />
              <small>3–24 caratteri minuscoli, numeri o underscore</small>
            </label>
            <label>Chiave pubblica OpenPGP
              <textarea value={publicKey} onChange={(event) => { setPublicKey(event.target.value); resetIdentityPreview() }} required rows={4} spellCheck={false} placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----" />
            </label>
            <label>Chiave privata OpenPGP
              <textarea value={privateKey} onChange={(event) => { setPrivateKey(event.target.value); resetIdentityPreview() }} required rows={4} spellCheck={false} autoComplete="off" placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----" />
            </label>
            <label>Passphrase <span className="muted">(opzionale)</span>
              <input type="password" value={passphrase} onChange={(event) => { setPassphrase(event.target.value); resetIdentityPreview() }} autoComplete="current-password" />
            </label>
            {identityPreview && <section className="key-preview" aria-live="polite">
              <strong>Dati visibili al server e ai contatti</strong>
              <ul>{identityPreview.userIds.map((userId) => <li key={userId}>{userId}</li>)}</ul>
              <code>{abbreviateFingerprint(identityPreview.fingerprint)}</code>
              <label className="check"><input type="checkbox" checked={identityConfirmed} onChange={(event) => setIdentityConfirmed(event.target.checked)} /> Confermo di voler esporre questi User ID.</label>
            </section>}
            {error && <p className="error" role="alert">{error}</p>}
            <button className="primary" type="submit">{identityPreview ? 'Connetti' : 'Verifica identità'}</button>
            {storedIdentity && <button className="text-button danger" type="button" onClick={deleteLocalData}>Cancella dati salvati</button>}
          </form>
        </section>
        <p className="privacy-note"><span aria-hidden="true">●</span> Nessun account, database o messaggio offline.</p>
      </main>
    )
  }

  const activeContact = contacts.find(({ id }) => id === activeContactId)
  const visibleEntries = activeContact?.conversation.filter((entry) =>
    entry.kind !== 'message' || plaintexts[entry.messageId] !== undefined,
  ) ?? []

  return (
    <main className={`chat-shell ${activeContact ? 'conversation-open' : ''}`}>
      <header className="app-header">
        <div className="brand"><span aria-hidden="true">◇</span> Secret Chat</div>
        <div className="identity-summary"><strong>@{session.nickname}</strong><code>{abbreviateFingerprint(session.fingerprint)}</code><span className={`connection ${connection}`}>{connection === 'online' ? 'Connesso' : connection === 'connecting' ? 'Connessione…' : 'Disconnesso'}</span></div>
        <div className="header-actions">{connection === 'disconnected' && <button type="button" onClick={() => connect(session)}>Riconnetti</button>}<button type="button" onClick={disconnect}>Disconnetti</button><button className="danger" type="button" onClick={deleteLocalData}>Cancella dati</button></div>
      </header>
      {storageError && <p className="storage-error" role="alert">{storageError}</p>}
      {error && <p className="toast" role="alert">{error}<button type="button" aria-label="Chiudi errore" onClick={() => setError('')}>×</button></p>}

      <section className="chat-layout">
        <aside className="chat-list" aria-label="Conversazioni">
          <div className="panel-title"><h1>Conversazioni</h1><button className="add" type="button" aria-label="Aggiungi contatto" onClick={() => openKeyDialog({ mode: 'add' })}>+</button></div>
          {contacts.length === 0 ? <div className="empty-list"><span aria-hidden="true">◇</span><strong>Nessun contatto</strong><p>Importa una chiave pubblica scambiata privatamente.</p></div> : contacts.map((contact) =>
            <button className={`contact-row ${contact.id === activeContactId ? 'selected' : ''}`} type="button" key={contact.id} onClick={() => selectContact(contact.id)}>
              <span className="avatar" aria-hidden="true">{(contact.nickname ?? abbreviateFingerprint(contact.currentFingerprint)).slice(0, 1).toUpperCase()}</span>
              <span><strong>{contact.nickname ? `@${contact.nickname}` : abbreviateFingerprint(contact.currentFingerprint)}</strong><small className={`contact-status ${contact.status}`}>{contact.status === 'active' ? contact.online ? 'Online' : 'Offline' : contact.status === 'pending' ? 'In attesa' : contact.status === 'blocked' ? 'Bloccato' : 'Da riattivare'}</small></span>
              {contact.unread > 0 && <b className="unread" aria-label={`${contact.unread} non letti`}>{contact.unread}</b>}
            </button>,
          )}
        </aside>

        <section className="conversation" aria-label="Conversazione attiva">
          {!activeContact ? <div className="conversation-empty"><span aria-hidden="true">◇</span><h2>Scegli una conversazione</h2><p>I messaggi decifrati esistono solo in questa sessione.</p></div> : <>
            <header className="conversation-header">
              <button className="back" type="button" onClick={() => { setActiveContactId(undefined); activeContactIdRef.current = undefined }}>← <span>Indietro</span></button>
              <span className="avatar" aria-hidden="true">{(activeContact.nickname ?? activeContact.currentFingerprint).slice(0, 1).toUpperCase()}</span>
              <div><h2>{activeContact.nickname ? `@${activeContact.nickname}` : 'Contatto in attesa'}</h2><code>{abbreviateFingerprint(activeContact.currentFingerprint)}</code></div>
              <details className="contact-actions"><summary aria-label="Azioni contatto">•••</summary><div>
                {activeContact.status === 'pending' && <button type="button" onClick={() => cancelIntent(activeContact)}>Annulla intento</button>}
                {(activeContact.status === 'inactive' || (activeContact.status === 'active' && !activeContact.online)) && <button type="button" onClick={() => { try { addIntent(activeContact) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Azione non riuscita.') } }}>Riattiva contatto</button>}
                <button type="button" onClick={() => blockContact(activeContact)}>{activeContact.blocked ? 'Sblocca' : 'Blocca'}</button>
                <button type="button" onClick={() => openKeyDialog({ mode: 'update', contactId: activeContact.id })}>Aggiorna chiave</button>
                <button type="button" onClick={() => { if (confirm('Cancellare la cronologia locale di questo contatto?')) updateContact(activeContact.id, (item) => ({ ...item, conversation: [] })) }}>Cancella cronologia</button>
              </div></details>
            </header>
            <div className="messages" aria-live="polite">
              {visibleEntries.length === 0 && <p className="empty-conversation">Nessun messaggio in questa conversazione.</p>}
              {visibleEntries.map((entry) => entry.kind === 'fingerprint-changed'
                ? <p className="local-event" key={`${entry.createdAt}-${entry.to}`}>Avvenuto cambio di fingerprint: {abbreviateFingerprint(entry.from)} → {abbreviateFingerprint(entry.to)}</p>
                : <article className={`message ${entry.direction}`} key={entry.messageId}><p>{plaintexts[entry.messageId]}</p><footer><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>{entry.direction === 'outgoing' && ' · inviato'}</footer></article>,
              )}
            </div>
            <div className="composer">
              <label htmlFor="message">Messaggio</label>
              <textarea id="message" value={composer} maxLength={MAX_MESSAGE_LENGTH} onChange={(event) => setComposer(event.target.value)} onKeyDown={composerKeyDown} disabled={activeContact.status !== 'active' || !activeContact.online || connection !== 'online' || Boolean(storageError)} placeholder={activeContact.online && activeContact.status === 'active' ? 'Scrivi un messaggio…' : 'Contatto non disponibile'} rows={2} />
              <small>{composer.length}/{MAX_MESSAGE_LENGTH}</small>
              <button className="send" type="button" aria-label="Invia messaggio" disabled={!composer.trim() || activeContact.status !== 'active' || !activeContact.online || connection !== 'online' || Boolean(storageError)} onClick={() => void sendMessage()}>↑</button>
            </div>
          </>}
        </section>
      </section>

      {keyDialog && <dialog open aria-labelledby="key-dialog-title">
        <form onSubmit={submitContact}>
          <div className="dialog-title"><div><p className="eyebrow">Chiave scambiata fuori dall’app</p><h2 id="key-dialog-title">{keyDialog.mode === 'add' ? 'Aggiungi contatto' : 'Aggiorna chiave'}</h2></div><button type="button" aria-label="Chiudi" onClick={() => setKeyDialog(undefined)}>×</button></div>
          <p>Il server riceverà soltanto il fingerprint, mai questa chiave.</p>
          <label>Chiave pubblica OpenPGP<textarea value={contactKey} onChange={(event) => { setContactKey(event.target.value); setContactPreview(undefined); setContactConfirmed(false) }} required rows={8} spellCheck={false} placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----" /></label>
          {contactPreview && <section className="key-preview"><strong>User ID esposti dal contatto</strong><ul>{contactPreview.userIds.map((userId) => <li key={userId}>{userId}</li>)}</ul><code>{abbreviateFingerprint(contactPreview.fingerprint)}</code><label className="check"><input type="checkbox" checked={contactConfirmed} onChange={(event) => setContactConfirmed(event.target.checked)} /> Confermo la provenienza di questa chiave.</label></section>}
          {error && <p className="error" role="alert">{error}</p>}
          <div className="dialog-buttons"><button type="button" onClick={() => setKeyDialog(undefined)}>Annulla</button><button className="primary" type="submit">{contactPreview ? keyDialog.mode === 'add' ? 'Aggiungi contatto' : 'Aggiorna chiave' : 'Verifica chiave'}</button></div>
        </form>
      </dialog>}
    </main>
  )
}

export default App
