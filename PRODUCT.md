# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Tacitus uses one React web interface in browsers and in Tauri apps for Android
and iOS. Mobile apps provide native identity storage and notifications; the
interface shares its design language across platforms.

## Users

People who know each other and want private conversations. They exchange their
Tacitus IDs through an existing channel and arrange to be online together.
The primary audience and the current product constraints were confirmed by the
maintainer during init.

## Product Purpose

Enable two people to establish a consensual Contatto and exchange end-to-end
encrypted text and photo Albums without creating accounts or entrusting message
contents to the server. Success means both people understand consent and
availability, establish a Sessione sicura, and communicate while online.

## Positioning

Device-bound Identità, reciprocal contact consent, and an opaque relay with
volatile state replace accounts, a public directory, and server message storage.
Conversazioni persist locally in encrypted storage even though Sessioni sicure
are ephemeral. "Ephemeral" must not imply that local history disappears on
disconnect.

## Operating Context

- Create an Identità locale with an immutable nickname and a Tacitus ID.
- Share the Tacitus ID and enter the other person's ID. Both people must be
  online and express an Intento di contatto before a Relazione forms.
- Open a Conversazione to send text or prepare an Anteprima Album. Photo bytes
  are sent only after the recipient's consent permits transmission.
- After a disconnect, local history remains. A reconnect creates a new Sessione
  sicura; a lost Relazione may require Riattiva.
- Manage photo consent, removal, and blocking per Contatto. Global settings
  govern photo reception, theme, notifications, and Cancella dati.

Use the domain vocabulary in `frontend/CONTEXT.md` and `backend/CONTEXT.md`.

## Capabilities and Constraints

- No accounts, contact directory, offline delivery, backup, identity recovery,
  synchronization, or multi-device support.
- Private identity keys stay on the device and are non-exportable. Secure
  session state is volatile. The relay stores no Conversazioni or photo Albums.
- Text is limited to 4,000 characters. An Album contains 1–10 photos; supported
  input formats are JPEG, PNG, and WebP. Photos are resized and re-encoded before
  transmission. Video and animated GIFs are unsupported.
- Photo reception requires consent. The global reception setting overrides
  per-Contatto choices. Blocking is unilateral; unblocking does not recreate a
  Relazione.
- Interrupted messages have no automatic retry or offline queue. Interrupted
  Albums do not resume automatically. Relay acknowledgement does not establish
  device receipt, decryption, or reading.
- History, drafts, photo assets, contact preferences, and blocks are encrypted
  locally. Removing a Contatto deletes its Conversazione and Albums. Cancella
  dati removes the device's identity, keys, contacts, history, and preferences.
- Notifications are opt-in, generic, and local: no contact name or preview, and
  no push delivery while the tab or app is suspended or closed.
- The relay can observe interlocutors, timing, frame direction, and size buckets.
  Do not claim anonymity or complete resistance to traffic analysis.
- UI copy is currently primarily Italian. Future language coverage and any
  product-specific accessibility standard remain open decisions.

Protocol details, limits, and platform exceptions are maintained in `README.md`;
this record does not replace that specification.

## Brand Commitments

The existing product name is Tacitus. The current brand displays TACITUS, the app
version, and ethos-adamas. No additional voice or visual commitment was established
during init.

## Evidence on Hand

- `README.md`: documented behavior, security boundaries, persistence, and limits.
- `frontend/README.md`: shared client, platform behavior, and development commands.
- `CONTEXT-MAP.md` and context glossaries: established domain terminology.
- `frontend/src/ui/`: implemented identity, contact, conversation, photo, and
  settings workflows; existing Italian copy.
- `frontend/e2e/messaggistica.spec.ts`: browser scenarios against the local relay.
- `protocol/tests/protocol.rs`: protocol and interoperability test scenarios.

These are implementation evidence, not an independent security audit. No customer
testimonials, adoption figures, or external security certification were established
during init; future work must not invent them.

## Product Principles

1. Make mutual consent explicit before contact and photo transmission.
2. Keep content and private keys under device control; describe the relay's
   visibility accurately.
3. Distinguish Presenza del Contatto, Relazione, Sessione sicura, and Conversazione
   so connection changes do not misrepresent history or delivery.
4. Explain irreversible local deletion and device-bound identity before people
   commit to destructive actions.
5. Preserve the online-only model and communicate interruption honestly.
