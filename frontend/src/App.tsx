import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { PeerSession } from './generated/tacitus_protocol'
import { isTauri } from '@tauri-apps/api/core'
import {
  MAX_MESSAGE_LENGTH,
  addMessage,
  createContact,
  matchContact,
  normalizeTacitusId,
  resetContactConnection,
  type Contact,
} from './domain'
import { authenticationSignature, base64Url, createIdentity, identityDocument, sign } from './identity'
import {
  listenForNotificationClicks,
  notificationPermission,
  requestNotificationPermission,
  showMessageNotification,
  type NotificationPermissionState,
} from './notifications'
import {
  copyTacitusId,
  nextTheme,
  NOTIFICATIONS_KEY,
  resolveTheme,
  shouldNotify,
  THEME_KEY,
  type Theme,
} from './preferences'
import { clearLocalData, loadContacts, loadIdentity, saveContacts, type LocalIdentity } from './storage'

type Connection = 'connecting' | 'online' | 'offline'
type WireEvent = Record<string, unknown>
type Decrypted = { message_id: string; created_at: number; text: string }

const socketUrl = () => import.meta.env.VITE_RELAY_URL
  ?? (isTauri()
    ? 'wss://tacitus.ethos-adamas.it/ws'
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
const errorLabels: Record<string, string> = {
  authentication_failed: 'Autenticazione fallita.',
  contact_unavailable: 'Il contatto non è disponibile.',
  identity_collision: 'Collisione del Tacitus ID: crea una nuova Identità.',
  invalid_request: 'Richiesta non valida.',
  payload_too_large: 'Payload troppo grande.',
  too_many_contacts: 'Troppi Intenti di contatto aperti.',
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const [identity, setIdentity] = useState<LocalIdentity>()
  const identityRef = useRef<LocalIdentity | undefined>(undefined)
  const [nickname, setNickname] = useState('')
  const [connection, setConnection] = useState<Connection>('offline')
  const [contacts, setContacts] = useState<Contact[]>([])
  const contactsRef = useRef<Contact[]>([])
  const [activeId, setActiveId] = useState<string>()
  const activeIdRef = useRef<string | undefined>(undefined)
  const [contactCode, setContactCode] = useState('')
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const notificationsEnabledRef = useRef(false)
  const [notificationState, setNotificationState] = useState<NotificationPermissionState>('default')
  const dialogRef = useRef<HTMLDialogElement>(null)
  const socketRef = useRef<WebSocket | undefined>(undefined)
  const sessionsRef = useRef(new Map<string, PeerSession>())
  const receiveQueue = useRef(Promise.resolve())
  const reconnectTimer = useRef<number | undefined>(undefined)
  const messagesEnd = useRef<HTMLDivElement>(null)

  function clearSessions() {
    for (const session of sessionsRef.current.values()) session.free()
    sessionsRef.current.clear()
  }

  function replaceContacts(next: Contact[]) {
    contactsRef.current = next
    setContacts(next)
    const current = identityRef.current
    if (current) void saveContacts(current, next).catch(() => setError('Salvataggio locale non riuscito.'))
  }

  function updateContact(tacitusId: string, update: (contact: Contact) => Contact) {
    replaceContacts(contactsRef.current.map((contact) =>
      contact.tacitusId === tacitusId ? update(contact) : contact,
    ))
  }

  function send(type: string, fields: Record<string, unknown>) {
    if (socketRef.current?.readyState !== WebSocket.OPEN) throw new Error('Connessione non disponibile.')
    socketRef.current.send(JSON.stringify({ v: 2, type, request_id: crypto.randomUUID(), ...fields }))
  }

  function connect(current: LocalIdentity) {
    clearTimeout(reconnectTimer.current)
    socketRef.current?.close()
    clearSessions()
    replaceContacts(contactsRef.current.map(resetContactConnection))
    setConnection('connecting')
    const socket = new WebSocket(socketUrl())
    socketRef.current = socket
    socket.onmessage = ({ data }) => {
      receiveQueue.current = receiveQueue.current
        .then(() => handleEvent(JSON.parse(String(data)) as WireEvent, current))
        .catch(() => setError('Frame ricevuto non valido.'))
    }
    socket.onerror = () => setError('Connessione al server non riuscita.')
    socket.onclose = () => {
      if (socketRef.current !== socket) return
      setConnection('offline')
      clearSessions()
      replaceContacts(contactsRef.current.map(resetContactConnection))
      if (identityRef.current === current) {
        reconnectTimer.current = window.setTimeout(() => connect(current), 2_000)
      }
    }
  }

  async function handleEvent(event: WireEvent, current: LocalIdentity) {
    const type = String(event.type ?? '')
    if (type === 'auth.challenge' && typeof event.nonce === 'string') {
      const signature = await authenticationSignature(current, event.nonce)
      if (identityRef.current !== current) return
      socketRef.current?.send(JSON.stringify({
        v: 2,
        type: 'auth.respond',
        nickname: current.nickname,
        public_key: base64Url(current.publicKey),
        signature: base64Url(signature),
      }))
      return
    }
    if (type === 'auth.ready') {
      setConnection('online')
      return
    }
    if (type === 'error') {
      setError(errorLabels[String(event.code)] ?? 'Il server ha rifiutato la richiesta.')
      return
    }

    const tacitusId = typeof event.tacitus_id === 'string'
      ? normalizeTacitusId(event.tacitus_id)
      : typeof event.from_id === 'string'
        ? normalizeTacitusId(event.from_id)
        : undefined
    if (!tacitusId) return

    if (type === 'contact.pending') {
      updateContact(tacitusId, (contact) => ({ ...contact, pending: true, reactivationRequired: false }))
    } else if (type === 'contact.matched' && typeof event.nickname === 'string') {
      const online = event.online === true
      const known = contactsRef.current.find((contact) => contact.tacitusId === tacitusId)
      if (!known) return
      updateContact(tacitusId, (contact) => matchContact(contact, event.nickname as string, online))
      if (online) await maybeStartHandshake(current, tacitusId)
    } else if (type === 'presence.changed' && typeof event.online === 'boolean') {
      updateContact(tacitusId, (contact) => ({ ...contact, online: event.online as boolean, secure: false }))
      if (event.online) await maybeStartHandshake(current, tacitusId)
      else dropSession(tacitusId)
    } else if (type === 'contact.state' && event.active === false) {
      dropSession(tacitusId)
      updateContact(tacitusId, (contact) => ({
        ...contact, pending: false, reactivationRequired: true, online: false, secure: false,
      }))
    } else if (type === 'contact.removed') {
      replaceContacts(contactsRef.current.filter((contact) => contact.tacitusId !== tacitusId))
      if (activeIdRef.current === tacitusId) selectContact(undefined)
    } else if (type === 'handshake.received' && typeof event.body === 'string') {
      await receiveHandshake(current, tacitusId, event.body)
    } else if (type === 'message.received' && typeof event.body === 'string') {
      receiveMessage(tacitusId, event.body)
    }
  }

  function dropSession(tacitusId: string) {
    sessionsRef.current.get(tacitusId)?.free()
    sessionsRef.current.delete(tacitusId)
  }

  async function maybeStartHandshake(current: LocalIdentity, peerId: string) {
    if (current.tacitusId >= peerId || sessionsRef.current.has(peerId)) return
    const session = PeerSession.start(identityDocument(current), peerId)
    sessionsRef.current.set(peerId, session)
    const outbound = session.takeOutbound()
    if (outbound) send('handshake.send', { to_id: peerId, body: outbound })
  }

  async function receiveHandshake(current: LocalIdentity, peerId: string, body: string) {
    try {
      let session = sessionsRef.current.get(peerId)
      if (!session) {
        if (JSON.parse(body).type !== 'offer') throw new Error('Offerta di handshake mancante.')
        session = PeerSession.answer(identityDocument(current), peerId, body)
        sessionsRef.current.set(peerId, session)
      } else {
        session.receiveHandshake(body)
      }
      const payload = session.signaturePayload()
      if (payload) session.completeSignature(await sign(current, payload))
      const outbound = session.takeOutbound()
      if (outbound) send('handshake.send', { to_id: peerId, body: outbound })
      if (session.ready) {
        updateContact(peerId, (contact) => ({
          ...contact,
          nickname: session?.peerNickname ?? contact.nickname,
          secure: true,
          online: true,
        }))
      }
    } catch (reason) {
      dropSession(peerId)
      throw reason
    }
  }

  function receiveMessage(peerId: string, body: string) {
    const session = sessionsRef.current.get(peerId)
    if (!session?.ready) throw new Error('Sessione sicura assente.')
    const message = JSON.parse(session.decrypt(body)) as Decrypted
    updateContact(peerId, (contact) => ({
      ...addMessage(contact, {
        id: message.message_id,
        direction: 'incoming',
        text: message.text,
        createdAt: message.created_at,
      }),
      unread: activeIdRef.current === peerId ? 0 : contact.unread + 1,
    }))
    if (shouldNotify(notificationsEnabledRef.current, document.visibilityState, document.hasFocus())) {
      void showMessageNotification(peerId, () => selectContact(peerId))
        .catch(() => setError('Notifica non riuscita.'))
    }
  }

  async function submitIdentity(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const created = await createIdentity(nickname)
      identityRef.current = created
      setIdentity(created)
      setContacts([])
      contactsRef.current = []
      connect(created)
    } catch {
      setError('Usa 3–24 caratteri: lettere minuscole, numeri o underscore.')
    }
  }

  function submitContact(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const tacitusId = normalizeTacitusId(contactCode)
      if (tacitusId === identity?.tacitusId) throw new Error('Non puoi aggiungere la tua Identità.')
      const existing = contactsRef.current.find((contact) => contact.tacitusId === tacitusId)
      if (existing) updateContact(tacitusId, (contact) => ({
        ...contact, pending: true, reactivationRequired: false,
      }))
      else replaceContacts([...contactsRef.current, createContact(tacitusId)])
      send('contact.add', { tacitus_id: tacitusId })
      closeDialog()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tacitus ID non valido.')
    }
  }

  function removeContact(contact: Contact) {
    if (!confirm(`Rimuovere ${contact.nickname ?? contact.tacitusId} e la Conversazione locale?`)) return
    dropSession(contact.tacitusId)
    send(contact.pending ? 'contact.cancel' : 'contact.remove', { tacitus_id: contact.tacitusId })
    replaceContacts(contactsRef.current.filter(({ tacitusId }) => tacitusId !== contact.tacitusId))
    if (activeId === contact.tacitusId) selectContact(undefined)
  }

  function reactivateContact(contact: Contact) {
    send('contact.add', { tacitus_id: contact.tacitusId })
    updateContact(contact.tacitusId, (current) => ({
      ...current, pending: true, reactivationRequired: false, secure: false,
    }))
  }

  function selectContact(tacitusId: string | undefined) {
    activeIdRef.current = tacitusId
    setActiveId(tacitusId)
    if (tacitusId) updateContact(tacitusId, (contact) => ({ ...contact, unread: 0 }))
  }

  function updateDraft(contact: Contact, draft: string) {
    updateContact(contact.tacitusId, (current) => ({ ...current, draft }))
  }

  function sendMessage(contact: Contact) {
    const text = contact.draft.trim()
    const session = sessionsRef.current.get(contact.tacitusId)
    if (!text || text.length > MAX_MESSAGE_LENGTH || !session?.ready || !contact.online) return
    const createdAt = new Date().valueOf()
    const body = session.encrypt(text, BigInt(createdAt))
    send('message.send', { to_id: contact.tacitusId, body })
    updateContact(contact.tacitusId, (current) => ({
      ...addMessage(current, {
        id: crypto.randomUUID(), direction: 'outgoing', text, createdAt,
      }),
      draft: '',
    }))
  }

  function composerKey(event: KeyboardEvent<HTMLTextAreaElement>, contact: Contact) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage(contact)
    }
  }

  async function shareIdentity() {
    if (!identity) return
    try {
      await copyTacitusId(identity.tacitusId)
      setNotice('Tacitus ID copiato.')
    } catch {
      setError('Copia del Tacitus ID non riuscita.')
    }
  }

  function toggleTheme() {
    const selected = nextTheme(theme)
    localStorage.setItem(THEME_KEY, selected)
    document.documentElement.dataset.theme = selected
    setTheme(selected)
  }

  async function toggleNotifications() {
    try {
      if (notificationsEnabled) {
        notificationsEnabledRef.current = false
        setNotificationsEnabled(false)
        localStorage.setItem(NOTIFICATIONS_KEY, 'false')
        return
      }
      const permission = notificationState === 'granted'
        ? 'granted'
        : await requestNotificationPermission()
      setNotificationState(permission)
      if (permission !== 'granted') {
        setError(permission === 'denied'
          ? 'Notifiche bloccate: abilitale dalle impostazioni del dispositivo.'
          : 'Le notifiche non sono supportate.')
        return
      }
      notificationsEnabledRef.current = true
      setNotificationsEnabled(true)
      localStorage.setItem(NOTIFICATIONS_KEY, 'true')
    } catch {
      setError('Configurazione delle notifiche non riuscita.')
    }
  }

  async function deleteIdentity() {
    if (!confirm('Cancellare definitivamente Identità, Contatti e Conversazioni?')) return
    identityRef.current = undefined
    clearTimeout(reconnectTimer.current)
    socketRef.current?.close()
    clearSessions()
    await clearLocalData()
    location.reload()
  }

  function closeDialog() {
    dialogRef.current?.close()
    setDialogOpen(false)
    setContactCode('')
  }

  useEffect(() => {
    void (async () => {
      try {
        const stored = await loadIdentity()
        if (!stored) return
        const savedContacts = await loadContacts(stored)
        identityRef.current = stored
        contactsRef.current = savedContacts
        setIdentity(stored)
        setContacts(savedContacts)
        connect(stored)
      } catch {
        setError('I dati locali non possono essere decifrati. Cancella i dati per ripartire.')
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      clearTimeout(reconnectTimer.current)
      socketRef.current?.close()
      clearSessions()
    }
  }, [])

  useEffect(() => {
    const systemTheme = matchMedia('(prefers-color-scheme: dark)')
    const followSystem = () => {
      if (localStorage.getItem(THEME_KEY)) return
      const selected = resolveTheme(null, systemTheme.matches)
      document.documentElement.dataset.theme = selected
      setTheme(selected)
    }
    systemTheme.addEventListener('change', followSystem)
    return () => systemTheme.removeEventListener('change', followSystem)
  }, [])

  useEffect(() => {
    let cancelled = false
    void notificationPermission()
      .then((permission) => {
        if (cancelled) return
        setNotificationState(permission)
        const enabled = permission === 'granted' && localStorage.getItem(NOTIFICATIONS_KEY) === 'true'
        notificationsEnabledRef.current = enabled
        setNotificationsEnabled(enabled)
      })
      .catch(() => { if (!cancelled) setNotificationState('unsupported') })
    let stopListening: (() => void) | undefined
    void listenForNotificationClicks(selectContact)
      .then((stop) => {
        if (cancelled) stop()
        else stopListening = stop
      })
      .catch(() => { if (!cancelled) setError('Ascolto delle notifiche non riuscito.') })
    return () => {
      cancelled = true
      stopListening?.()
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 2_000)
    return () => clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (dialogOpen && !dialogRef.current?.open) dialogRef.current?.showModal()
  }, [dialogOpen])

  useEffect(() => { messagesEnd.current?.scrollIntoView() }, [contacts, activeId])

  if (loading) return <main className="landing"><p>Caricamento…</p></main>
  if (!identity) return (
    <main className="landing">
      <button className="icon-action landing-theme" onClick={toggleTheme}
        aria-label={`Passa al tema ${theme === 'dark' ? 'chiaro' : 'scuro'}`}
        title={`Tema ${theme === 'dark' ? 'chiaro' : 'scuro'}`}>
        {theme === 'dark' ? '☀' : '☾'}
      </button>
      <section className="identity-card">
        <p className="brand">TACITUS</p>
        <h1>Messaggistica privata senza account.</h1>
        <p>Le chiavi private non lasciano mai questo dispositivo.</p>
        <form onSubmit={submitIdentity}>
          <label>Nickname immutabile
            <input value={nickname} onChange={({ target }) => setNickname(target.value)}
              minLength={3} maxLength={24} pattern="[a-z0-9_]+" required autoFocus />
          </label>
          <button className="primary">Crea Identità</button>
        </form>
        {error && <p className="error" role="alert">{error}</p>}
      </section>
    </main>
  )

  const active = contacts.find((contact) => contact.tacitusId === activeId)
  return (
    <main className="app-shell">
      <header>
        <p className="brand">TACITUS</p>
        <div className="identity">
          <strong>{identity.nickname}</strong>
          <code>{identity.tacitusId}</code>
          <span className={`connection ${connection}`}>{connection === 'online' ? 'online' : connection}</span>
        </div>
        <div className="header-actions">
          <button className="icon-action" onClick={() => void toggleNotifications()}
            disabled={notificationState === 'denied' || notificationState === 'unsupported'}
            aria-pressed={notificationsEnabled}
            aria-label={notificationsEnabled ? 'Disattiva notifiche' : 'Abilita notifiche'}
            title={notificationState === 'denied'
              ? 'Notifiche bloccate nelle impostazioni del dispositivo'
              : notificationsEnabled ? 'Disattiva notifiche' : 'Abilita notifiche'}>
            {notificationsEnabled ? '🔔' : '🔕'}
          </button>
          <button className="icon-action" onClick={toggleTheme}
            aria-label={`Passa al tema ${theme === 'dark' ? 'chiaro' : 'scuro'}`}
            title={`Tema ${theme === 'dark' ? 'chiaro' : 'scuro'}`}>
            {theme === 'dark' ? '☀' : '☾'}
          </button>
          <button className="copy-identity" onClick={() => void shareIdentity()}>Copia Tacitus ID</button>
          <button className="danger" onClick={() => void deleteIdentity()}>Cancella dati</button>
        </div>
      </header>
      {error && <p className="toast" role="alert">{error}<button onClick={() => setError('')}>×</button></p>}
      {notice && <p className="toast success" role="status">{notice}</p>}
      <section className={`layout ${active ? 'conversation-open' : ''}`}>
        <aside>
          <div className="panel-title"><h1>Conversazioni</h1><button className="add" onClick={() => setDialogOpen(true)}>+</button></div>
          {contacts.length === 0 ? <p className="empty">Aggiungi il Tacitus ID di una persona online.</p> : contacts.map((contact) => (
            <button className={`contact ${activeId === contact.tacitusId ? 'selected' : ''}`}
              key={contact.tacitusId} onClick={() => selectContact(contact.tacitusId)}>
              <span className="avatar">{(contact.nickname ?? '?')[0].toUpperCase()}</span>
              <span><strong>{contact.nickname ?? 'Contatto'}</strong><small>{contact.pending ? 'In attesa del Contatto' : contact.secure ? 'Sessione sicura' : contact.online ? 'Negoziazione…' : contact.reactivationRequired ? 'Riattivazione necessaria' : 'Offline'}</small></span>
              {contact.unread > 0 && <b className="unread">{contact.unread}</b>}
            </button>
          ))}
        </aside>
        <section className="conversation">
          {!active ? <p className="empty">Scegli una Conversazione.</p> : <>
            <div className="conversation-title">
              <button className="back" onClick={() => selectContact(undefined)}>←</button>
              <span className="avatar">{(active.nickname ?? '?')[0].toUpperCase()}</span>
              <div><h2>{active.nickname ?? 'Contatto'}</h2><code>{active.tacitusId}</code></div>
              {active.reactivationRequired && !active.pending && !active.online &&
                <button disabled={connection !== 'online'} onClick={() => reactivateContact(active)}>Riattiva</button>}
              <button className="danger remove" onClick={() => removeContact(active)}>Rimuovi</button>
            </div>
            <div className="messages">
              {active.messages.length === 0 && <p className="empty">La Conversazione è vuota.</p>}
              {active.messages.map((message) => <article key={message.id} className={`message ${message.direction}`}>
                <p>{message.text}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
              </article>)}
              <div ref={messagesEnd} />
            </div>
            <div className="composer">
              <textarea aria-label="Messaggio" value={active.draft} maxLength={MAX_MESSAGE_LENGTH}
                placeholder={active.secure ? 'Scrivi un messaggio' : 'Il Contatto deve essere online'}
                disabled={!active.secure} onChange={({ target }) => updateDraft(active, target.value)}
                onKeyDown={(event) => composerKey(event, active)} />
              <small>{active.draft.length}/{MAX_MESSAGE_LENGTH}</small>
              <button className="send" aria-label="Invia" disabled={!active.secure || !active.draft.trim()}
                onClick={() => sendMessage(active)}>↑</button>
            </div>
          </>}
        </section>
      </section>
      <dialog ref={dialogRef} onClose={() => setDialogOpen(false)}>
        <form onSubmit={submitContact}>
          <div className="dialog-title"><h2>Aggiungi Contatto</h2><button type="button" onClick={closeDialog}>×</button></div>
          <p>Entrambe le Identità devono essere online e inserire reciprocamente il codice.</p>
          <label>Tacitus ID<input value={contactCode} onChange={({ target }) => setContactCode(target.value)}
            placeholder="00000-00000-00000-00000-000000" required autoFocus /></label>
          <div className="dialog-actions"><button type="button" onClick={closeDialog}>Annulla</button><button className="primary">Aggiungi</button></div>
        </form>
      </dialog>
    </main>
  )
}
