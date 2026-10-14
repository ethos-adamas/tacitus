---
name: "Tacitus"
description: "Lettera: a quiet, rounded Olivetti office object where every Contatto owns a flat colour field."
colors:
  "page-light": "#e9e7e1"
  "rail-light": "#dfe5e2"
  "surface-light": "#faf9f6"
  "selected-light": "#ffffff"
  "input-light": "#ffffff"
  "text-light": "#1c1c1a"
  "muted-light": "#64635c"
  "line-light": "#d3d0c7"
  "action-light": "#d2322d"
  "on-action-light": "#ffffff"
  "outgoing-light": "#dce5ee"
  "incoming-light": "#eeece6"
  "secure-light": "#2f8a83"
  "danger-light": "#a13d3b"
  "focus-light": "#2f5aa8"
  "field-cobalt-light": "#2f5aa8"
  "field-ochre-light": "#d99a1e"
  "field-teal-light": "#2f8a83"
  "field-violet-light": "#6d4c9a"
  "field-olive-light": "#6e8b3d"
  "field-brick-light": "#c25b3a"
  "page-dark": "#111110"
  "rail-dark": "#1a1e1d"
  "surface-dark": "#1c1c1a"
  "selected-dark": "#2a2f2d"
  "input-dark": "#252523"
  "text-dark": "#efede7"
  "muted-dark": "#a29f97"
  "line-dark": "#343330"
  "action-dark": "#e8463b"
  "outgoing-dark": "#22344a"
  "incoming-dark": "#2a2a27"
  "secure-dark": "#4fb0a7"
  "danger-dark": "#f0a39a"
  "focus-dark": "#8fb0f0"
  "field-cobalt-dark": "#4f79c4"
  "field-ochre-dark": "#d9a13a"
  "field-teal-dark": "#3e9c94"
  "field-violet-dark": "#8a6bbe"
  "field-olive-dark": "#85a050"
  "field-brick-dark": "#d0704f"
  "page-retro": "#050806"
  "rail-retro": "#0b130d"
  "surface-retro": "#08100a"
  "selected-retro": "#13261a"
  "input-retro": "#0e1a11"
  "text-retro": "#b6f2ae"
  "muted-retro": "#7fb279"
  "line-retro": "#1f3523"
  "action-retro": "#ffb000"
  "on-action-retro": "#140e00"
  "outgoing-retro": "#133a1f"
  "incoming-retro": "#0f1c13"
  "secure-retro": "#55ff55"
  "danger-retro": "#ff8a7a"
  "field-cyan-retro": "#55ffff"
  "field-yellow-retro": "#ffff55"
  "field-green-retro": "#55ff55"
  "field-magenta-retro": "#ff55ff"
  "field-lilac-retro": "#aaaaff"
  "field-orange-retro": "#ff8855"
typography:
  brand:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    letterSpacing: ".3em"
  title:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.25
  name:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.25
  section-label:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: ".08em"
  body:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "22px"
  body-mobile:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: "20px"
  status:
    fontFamily: "'Archivo Variable', ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
  typewriter:
    fontFamily: "'Courier Prime', ui-monospace, monospace"
    fontSize: "11px"
    lineHeight: 1.3
  retro-voice:
    fontFamily: "'VT323', ui-monospace, monospace"
    fontSize: "calc(15px * 1.3)"
    fontWeight: 400
  retro-reading:
    fontFamily: "'JetBrains Mono Variable', ui-monospace, monospace"
    fontSize: "16px"
    lineHeight: "22px"
rounded:
  "panel": "20px"
  "bubble": "16px"
  "row": "14px"
  "control": "12px"
  "pill": "999px"
  "circle": "50%"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
components:
  button-primary:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.on-action-light}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  button-danger:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.danger-light}"
    rounded: "{rounded.pill}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.input-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  contact-row:
    backgroundColor: "{colors.rail-light}"
    textColor: "{colors.text-light}"
    typography: "{typography.name}"
    rounded: "{rounded.row}"
    padding: "10px 12px"
  contact-selected:
    backgroundColor: "{colors.selected-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.row}"
    padding: "10px 12px"
  avatar:
    backgroundColor: "{colors.field-cobalt-light}"
    textColor: "{colors.on-action-light}"
    rounded: "{rounded.circle}"
    size: "40px"
  conversation-band:
    backgroundColor: "{colors.field-cobalt-light}"
    textColor: "{colors.on-action-light}"
    typography: "{typography.title}"
    padding: "10px 12px 10px 24px"
  message-incoming:
    backgroundColor: "{colors.incoming-light}"
    textColor: "{colors.text-light}"
    typography: "{typography.body}"
    rounded: "{rounded.bubble}"
    padding: "8px 12px"
  message-outgoing:
    backgroundColor: "{colors.outgoing-light}"
    textColor: "{colors.text-light}"
    typography: "{typography.body}"
    rounded: "{rounded.bubble}"
    padding: "8px 12px"
  composer:
    backgroundColor: "{colors.input-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.pill}"
    height: "52px"
  send:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.on-action-light}"
    rounded: "{rounded.circle}"
    size: "52px"
  unread:
    backgroundColor: "{colors.action-light}"
    textColor: "{colors.on-action-light}"
    rounded: "{rounded.pill}"
    height: "22px"
---
# Design System: Tacitus

## Overview

**Creative North Star: "Lettera"**

Tacitus is a quiet Olivetti office object, rounded and precise. The Olivetti graphic programme (Giovanni Pintori's flat colour fields, the Lettera 22, the M24 personal computer) lends four things only: type, palette, density and one signature move. The two-pane layout is the user's fixed constraint; the world never reorganises it.

The signature move: every Contatto owns a flat colour field. It fills their avatar in the list and floods the band of their open Conversazione, so you always know who you are writing to. Red is Olivetti's voice for action and is spent only on sending and on unread counts.

Light ("Lettera 22") is warm grey paper with an azure-green rail. Dark ("Notte") keeps the same roles at night. Rétro ("M24") is a green phosphor screen with a CGA field palette and an amber action colour; it keeps the same shapes and spacing.

**Key Characteristics:**

- One topology, spacing rhythm and set of radii in all three themes.
- Flat colour fields identify people; no gradients, glass or cast shadows on resting surfaces.
- Desktop is relaxed: 16px reading text, 40px avatars, a 52px composer.
- One Conversazione at a time on phones, its band running under the status bar.

## Colors

Restrained neutrals tinted from each theme's world, six contact fields, and one action colour. Frontmatter values are the literal `:root` variables in `frontend/src/index.css`; the suffix names the theme.

### Primary

- **Olivetti Red** (`action-*`; amber in rétro): send, primary buttons, unread badges and the caret. Nothing else is red.

### Secondary

- **Contact Fields** (`field-*`, six per theme): avatar fills and the open Conversazione's band. `contactField()` hashes the Tacitus ID, so a Contatto keeps its colour. Each field has a paired ink (`--field-ink-N`) with sufficient contrast; ochre and olive take dark ink.

### Neutral

- **Paper / Night / Phosphor** (`page-*`): the outer canvas.
- **Rail** (`rail-*`): the navigation column, whose tint carries the shell's colour.
- **Reading Plane** (`surface-*`): the opaque Conversazione and every dialog.
- **Selection** (`selected-*`): the selected contact row and emoji suggestion.
- **Ink and Muted** (`text-*`, `muted-*`): primary and secondary text; muted carries status, timestamps and section labels.
- **Bubbles** (`outgoing-*`, `incoming-*`): direction is shown by tone and alignment.
- **Secure** (`secure-*`): the filled status dot of a Sessione sicura and an online relay. Other states use a hollow ring.

**The Red Acts Rule.** Red (amber in rétro) marks only what acts or demands attention now: send, primary action, unread. Never decoration, never a state label.

**The Field Belongs to a Person Rule.** Contact fields identify a Contatto and nothing else; never use them for UI chrome, states or categories.

## Typography

**Interface and reading:** Archivo (self-hosted variable). **Typewriter:** Courier Prime for timestamps, Tacitus IDs and the relay status. **Rétro:** VT323 is the interface voice (brand, names, labels, buttons), scaled by `--ui: 1.3` because it draws small; JetBrains Mono carries messages, statuses and the composer, and also the typewriter role.

### Hierarchy

- **Brand:** TACITUS 16px semibold, .3em tracking (rétro .12em).
- **Title:** Conversazione band name 17px semibold; 16px on phones.
- **Name:** contact names 15px semibold (16px on phones), single line with ellipsis.
- **Section label:** 12px semibold uppercase, .08em tracking, muted.
- **Body:** messages 16/22 desktop, 15/20 phone; composer 16px.
- **Status:** 13px muted with a 7px dot; 12px in the phone band.
- **Typewriter:** 11px timestamps, 12px relay status.

**The Two Voices Rule.** Rétro changes the interface voice, never the readability of messages: messages and composer stay in a clean monospace.

## Layout

The desktop shell sits 16px from the viewport edges: a 340px rail, a 12px gap and a flexible Conversazione. The rail stacks a 60px brand row, the contact list, and the local identity row. The Conversazione stacks the coloured band (≥64px), the history and the composer. The message lane's side padding is `clamp(24px, 9vw, 160px)`; bubbles cap at `min(70%, 560px)`. Above 720px the rail collapses to a 76px avatar column that keeps accessible names, states and unread counts.

At 720px and below the shell is edge-to-edge on the rail colour. The list view shows the brand row (with the safe-area inset), contacts and the identity row. An open Conversazione replaces all of it, header included: its band starts under the status bar and holds back, avatar, name, state and options. Settings are reached from the list.

The document never scrolls: `html` and `body` hide overflow and overscroll, and only the history and contact list scroll, with contained overscroll. The shell tracks `visualViewport` height and offset for the mobile keyboard. Bottom controls use safe-area insets.

## Elevation & Depth

Resting surfaces are flat and separated by tone only: no shadow and no blur. Overlays (settings, dialogs, emoji panel, toasts) share the soft `--overlay-shadow`. The photo viewer is a near-black full-screen lightbox in every theme.

**The Flat Field Rule.** Depth on resting surfaces comes from tone, never from shadows, glass or gradients.

## Shapes

All three themes share the same geometry: 20px panels and dialogs, 16px bubbles, 14px rows and photo tiles, 12px fields, pill buttons, toasts and composer, circular avatars, icon buttons and send. Checkboxes use 6px corners. Lucide outline icons use a 1.75 stroke; the send mark is the filled custom arrow.

## Components

### Buttons

Shared buttons are pills with a minimum 44px height and medium-weight labels. Secondary is the default. Primary uses the action colour; danger uses danger text and border; ghost has no fill. Hover uses the selection tone; disabled buttons drop to 50% opacity, except send. Icon buttons are 44px circles (40px inside the composer, 38px on phones).

### Inputs / Fields

Fields use the input surface, a 1px line border, 12px corners and the reading font. Checkboxes are 20px with a 44px label target; checked fills with the ink colour.

### Navigation

Contact rows are 60px desktop and 64px phone, with 40/44px field-coloured avatars, a single-line name and status, and an unread pill on the right. Selection fills the row with the selection tone. Offline and reactivation-required rows dim their avatar to 45%. Intents and blocked identities use a dashed empty avatar.

### Conversation band

The signature component: the open Conversazione's header is filled with the Contatto's field and set in its ink. The avatar inverts (ink fill, field letter). Riattiva becomes an outlined pill in the band's ink.

### Composer

A pill holding photo, emoji and the auto-growing textarea (44–144px), with the 52px circular send beside it (44px on phones). Focus anywhere outlines the whole group. The placeholder never wraps.

### Photos

Album tiles are a two-column grid of 4:3 tiles with 14px corners; a single photo keeps its own aspect up to 320px. The viewer is a full-screen lightbox showing only a counter, download and close. Ctrl+wheel or pinch zooms; the plain wheel, arrows and swipe browse every photo in the Conversazione.

## Do's and Don'ts

### Do:

- **Do** give each Contatto its field through `data-field={contactField(id)}`, never a hard-coded colour.
- **Do** keep red/amber for send, primary actions and unread only.
- **Do** keep 44px targets, visible focus, safe areas and the visual-viewport behaviour.
- **Do** keep consent, offline states, errors and destructive actions explicit in text; a dot never replaces its label.
- **Do** scale every interface-voice size by `var(--ui)` so rétro stays legible.

### Don't:

- **Don't** add shadows, glass, gradients or side stripes to resting surfaces.
- **Don't** use contact fields for anything but people.
- **Don't** set messages or the composer in VT323.
- **Don't** let the document scroll; scroll the history and list only.
- **Don't** infer secure-session readiness, delivery or last activity from decorative indicators.
