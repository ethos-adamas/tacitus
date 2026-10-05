---
name: "Tacitus"
description: "A quiet messaging desk with readable conversations and subtly translucent controls."
colors:
  "page-light": "#eaeced"
  "surface-light": "#f4f5f6"
  "surface-soft-light": "#e4e8e5"
  "input-light": "#fafbfa"
  "text-light": "#222927"
  "muted-light": "#626c67"
  "green-light": "#466453"
  "on-green-light": "#fff"
  "pale-light": "#dfe9e3"
  "incoming-light": "#e9eceb"
  "line-light": "#d5dcd7"
  "danger-light": "#a13d3b"
  "focus-light": "#466453"
  "avatar-light": "#466453"
  "avatar-text-light": "#fff"
  "error-light": "#853e3b"
  "success-light": "#466453"
  "backdrop-light": "#19231f66"
  "page-dark": "#161c19"
  "surface-dark": "#202723"
  "surface-soft-dark": "#28322c"
  "input-dark": "#303b34"
  "text-dark": "#edf2ee"
  "muted-dark": "#abb9af"
  "green-dark": "#a5c3ae"
  "on-green-dark": "#17241b"
  "pale-dark": "#364b3e"
  "incoming-dark": "#2c3530"
  "line-dark": "#435047"
  "danger-dark": "#f0aba5"
  "focus-dark": "#a5c3ae"
  "avatar-dark": "#4c6655"
  "avatar-text-dark": "#f2f6f3"
  "error-dark": "#853e3b"
  "success-dark": "#42614e"
  "backdrop-dark": "#08110ccc"
  "page-retro": "#0b120c"
  "surface-retro": "#111a13"
  "surface-soft-retro": "#18251b"
  "input-retro": "#1b2b1f"
  "text-retro": "#d9efd9"
  "muted-retro": "#a2bba3"
  "green-retro": "#a3d58b"
  "on-green-retro": "#101b11"
  "pale-retro": "#2a402b"
  "incoming-retro": "#1c2b20"
  "line-retro": "#3d5941"
  "danger-retro": "#efb0a1"
  "focus-retro": "#a3d58b"
  "avatar-retro": "#344f33"
  "avatar-text-retro": "#dbf4cb"
  "error-retro": "#783c32"
  "success-retro": "#385438"
  "backdrop-retro": "#020b04cc"
typography:
  headline:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-.02em"
  title:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 500
    lineHeight: 1.25
  body:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 400
    lineHeight: 1.4
  body-mobile:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
  composer:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: "24px"
  label:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: ".875rem"
    fontWeight: 500
  support:
    fontFamily: "Roboto, ui-sans-serif, system-ui, sans-serif"
    fontSize: ".8rem"
    lineHeight: 1.6
  retro-label:
    fontFamily: "'Press Start 2P', ui-monospace, monospace"
    fontSize: ".7rem"
    lineHeight: 1.8
  retro-headline:
    fontFamily: "'Press Start 2P', ui-monospace, monospace"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.7
    letterSpacing: "0"
rounded:
  "surface": "16px"
  "compact": "8px"
  "retro": "0px"
  "circle": "50%"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.green-light}"
    textColor: "{colors.on-green-light}"
    typography: "{typography.label}"
    rounded: "{rounded.surface}"
    padding: "8px 12px"
  button-secondary:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.text-light}"
    typography: "{typography.label}"
    rounded: "{rounded.surface}"
    padding: "8px 12px"
  button-danger:
    backgroundColor: "{colors.surface-light}"
    textColor: "{colors.danger-light}"
    typography: "{typography.label}"
    rounded: "{rounded.surface}"
    padding: "8px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-light}"
    typography: "{typography.label}"
    rounded: "{rounded.surface}"
    padding: "8px 12px"
  input:
    backgroundColor: "{colors.input-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.surface}"
    padding: "8px 12px"
  contact-selected:
    backgroundColor: "{colors.pale-light}"
    textColor: "{colors.text-light}"
    rounded: "{rounded.surface}"
    padding: "14px 16px"
  unread:
    backgroundColor: "{colors.green-light}"
    textColor: "{colors.on-green-light}"
    rounded: "{rounded.circle}"
    padding: "0 6px"
    height: "24px"
  identity-card:
    rounded: "{rounded.surface}"
    padding: "40px"
    width: "min(460px, 100%)"
  message-incoming:
    backgroundColor: "{colors.incoming-light}"
    textColor: "{colors.text-light}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    padding: "12px 18px"
  message-outgoing:
    backgroundColor: "{colors.pale-light}"
    textColor: "{colors.text-light}"
    typography: "{typography.body}"
    rounded: "{rounded.surface}"
    padding: "12px 18px"
  send:
    backgroundColor: "{colors.green-light}"
    textColor: "{colors.on-green-light}"
    rounded: "{rounded.circle}"
    width: "54px"
    height: "54px"
    padding: "0"
---
# Design System: Tacitus

## Overview

**Creative North Star: "The Translucent Reading Desk"**

The translucent reading desk gives private conversation a calm, consistent home. Light uses cool paper and charcoal, dark uses quiet forest neutrals, and rétro keeps a pixel voice without reducing the legibility of messages.

Navigation and controls carry subtle transparency; the conversation reading plane stays opaque. Sparse accents and restrained depth keep attention on names, message content, and the next action. Identity creation, settings, consent, photos, empty states, and feedback use the same visual grammar.

**Key Characteristics:**

- Conversation-centered hierarchy.
- Subtle transparency around an opaque reading plane.
- One spatial rhythm across light, dark, and rétro.
- Plain, readable message text in every theme.
- Explicit states and accessible controls.

## Colors

A restrained green accent sits among theme-specific neutral surfaces. The frontmatter records the literal values in `frontend/src/index.css`; the suffix names its theme. Root variables are the runtime authority, including when Sistema resolves to light or dark. Frontmatter component references describe the light baseline; other themes use the corresponding suffixed color values and rétro corners. Sidecar snippets remain live-bound to those runtime variables.

### Primary

- **Quiet Green** (`green-light`, `green-dark`, `green-retro`): primary action, selection details, focus, and secure-session indicators. The paired `on-green` value provides action text contrast.
- **Pale Green** (`pale-*`): selected contacts, outgoing message bubbles, and shared control hover states.

### Neutral

- **Cool Paper / Forest Slate / Terminal Paper** (`page-*`, `surface-*`): outer canvas and opaque conversation plane. Light's conversation paper is distinct from its cooler outer canvas.
- **Frosted Navigation** (`surface-soft-*`): navigation base; glass mixes this with transparency.
- **Field Paper** (`input-*`): fields and the translucent control base.
- **Charcoal / Soft White / Phosphor White** (`text-*`): primary text. `muted-*` carries descriptions, timestamps, and secondary status labels.
- **Incoming Paper** (`incoming-*`): incoming message bubbles, separated from outgoing bubbles by tone and alignment.
- **Quiet Divider** (`line-*`): control borders, panel separators, and grouping within settings.
- **Avatar Ink and Paper** (`avatar-*`, `avatar-text-*`): initials and consistent identity marks.
- **Overlay Veil** (`backdrop-*`): modal backdrop, separate from the lighter glass material.

### Semantic feedback

`danger-*` marks inline errors and destructive controls. `error-*` and `success-*` supply toast backgrounds with white text; they are not interchangeable with the primary accent or inline danger text.

**The Reading Plane Rule.** Keep the conversation reading surface opaque; translucency belongs to navigation and controls.

## Typography

**Body and reading font:** self-hosted Roboto, followed by the sans-serif stack in the frontmatter.

**Interface font:** Roboto in light and dark; the existing locally bundled Press Start 2P in rétro, followed by a monospace fallback. Reading text retains Roboto in rétro.

**Character:** neutral and readable, with medium weight for names and important controls. Rétro's pixel lettering remains a deliberate interface variation rather than a font change for conversation content.

### Hierarchy

- **Headline:** identity setup uses `headline`; its mobile size is (1.75rem). Rétro uses `retro-headline` at (1.25rem) on both desktop and mobile; its theme selector takes precedence over the mobile size rule.
- **Title:** conversation heading uses `title`, reducing to (20px) on mobile. Panel headings use (20px) desktop and (18px) mobile; rétro uses (.75rem) with (1.8) line height.
- **Body:** messages use `body` desktop and `body-mobile` mobile. Message width is capped at (65ch) and (80%) desktop, (88%) mobile.
- **Composer:** `composer` desktop, (16px) mobile, always in the reading font.
- **Label:** shared buttons and form labels use `label`; rétro applies `retro-label` to interface buttons and labels. Contact names remain Roboto (20px, 500).
- **Support:** `support` for technical help; descriptions use (.875rem/1.6), timestamp text (14px) desktop and (12px) mobile. IDs use the native monospace stack (.8rem/1.6).
- **Brand:** TACITUS uses medium-weight interface text (26px, .24em tracking) desktop, (20px) mobile. Rétro removes tracking and stays at (16px) on desktop and mobile; its theme selector takes precedence over the mobile size rule.

**The Two Voices Rule.** Rétro changes interface lettering, not the reading font used for messages, nicknames, descriptions, and the composer.

## Layout

The desktop shell sits (24px) from the viewport edges. A two-column grid gives navigation a minimum (280px), normally (25%) of the width, beside a flexible conversation. The panel gap is (8px). Navigation's brand, list, and local identity occupy rows of (98px), flexible height, and (104px); the conversation spans all three.

At (720px) and below, the shell becomes edge-to-edge. The list and the open conversation alternate in one column, with a visible back control. The brand row is (64px), the open conversation heading (76px), and the closed-list identity row (88px). Active conversation content replaces the list and local identity footer.

Use the recorded spacing scale: compact internal gaps, larger group spacing, and generous message-lane padding. Desktop messages use (32px) top and (56px) bottom padding; lateral padding adapts with `min(6.5vw, 100px)`. Mobile messages use (24px 16px). Identity setup centers a card of at most (460px), with (40px) desktop padding and (32px 24px) mobile padding.

The authenticated shell tracks `visualViewport.height` and `offsetTop` through `--viewport-height` and `--viewport-top`, falling back to window geometry. Preserve that behavior for the mobile keyboard. Bottom controls and feedback use safe-area insets. Dialogs scroll within the viewport; settings use collision-aware placement. Standard dialogs cap width at (500px), with (16px) padding and (24px) from the existing (640px) utility breakpoint.

## Elevation & Depth

Resting panels use tonal layering, quiet dividers, and no cast shadow. Navigation glass mixes the soft surface at (72%) with transparency; controls mix the field surface at (86%). Both inherit their active theme. The shared blur is (20px), reduced to (12px) in rétro. The reading plane stays opaque.

### Shadow Vocabulary

- **Overlay:** `var(--overlay-shadow)` gives settings, dialogs, emoji panels, and toasts the same soft lifted treatment. Light, dark, and rétro each supply their recorded theme value; the sidecar preserves the literal shadow definitions.

Reduced transparency replaces glass with solid soft-surface and field colors and removes their shared blur. Color and border transitions use (160ms ease-out) under `prefers-reduced-motion: no-preference`; there is no entrance choreography. Keep overlay state feedback restrained and preserve visible keyboard focus.

**The Quiet Depth Rule.** Use tonal separation for resting panels; reserve the shared soft shadow for overlays and feedback.

## Shapes

The shared surface radius is (16px) in light and dark, and square (0px) in rétro. The compact radius step is (8px); small checkbox corners derive from the shared radius divided by three. Standard buttons, fields, panels, bubbles, and overlays share this geometry rather than inventing separate silhouettes.

Avatars and the send action are circles in light and dark, square in rétro. Unread counters remain round badges. Thin (1px) lines group content and frame fields; they do not outline every message or resting panel. Lucide outline icons use consistent strokes (1.7), typically (18–24px); the send mark is the shipped custom filled SVG.

## Components

### Buttons

Quiet, consistent actions share medium-weight labels, a minimum (44px) height, (8px 12px) padding, and theme-derived corners. Secondary is the default: surface fill and divider border. Primary uses green and its paired text color; danger uses surface fill, danger text, and a danger border; ghost removes the visible border and fill. Secondary, danger, and ghost hover on pale green; primary hover uses (.9) opacity. Disabled shared buttons use (.5) opacity and block pointer events. The send action intentionally retains its full opacity when disabled.

Visible focus uses theme focus ink, with a global (2px) outline and (3px) offset; shared buttons apply a (3px) outline and (2px) offset. Icon controls preserve (44px) targets even when their marks are smaller.

### Inputs / Fields

Fields use the theme field surface, divider border, shared radius, and (8px 12px) padding. Inputs and native selects have minimum (44px) height. Labels sit above fields with (8px) gaps. Muted placeholders remain fully opaque; caret and focus use the theme accent. Checkbox labels provide the full (44px) target around a (20px) control.

### Navigation

Contact rows are broad, quiet buttons: minimum (84px), (14px 16px) padding, a (56px) avatar, and (16px) spacing. Selected rows use pale green. Names, explicit session state, unread badges, and pending-photo labels share a predictable hierarchy. A status dot supplements text; it never replaces it. Mobile displays one conversation at a time.

### Badges

Unread counts use a round (24px) badge with primary fill and paired contrast text. Status indicators are (8px) dots beside state labels. Keep their meanings tied to real runtime state.

### Cards / Containers

Identity creation uses a translucent control surface without a cast shadow. Settings use the same material with (24px) padding and a shared overlay shadow, at most (360px) wide. Dialogs use the opaque surface, matching corners, explicit titles and descriptions, and grouped actions. Theme, ID, version, and ethos-adamas belong in settings, including before identity creation. The persistent local identity footer shows nickname, relay state, and copy action.

### Conversation and composer

Incoming messages align left and outgoing messages right. Bubble tones distinguish direction without adding ornament; timestamp placement follows the same alignment. Content wraps and preserves message line breaks. The composer groups photos, emoji, text, and send into one outlined glass control. Desktop has an (80px) minimum height and a small separator after the emoji area; mobile lowers it to (68px) and hides the separator. The filled send mark sits in a (54px) circle desktop and a (44px) target mobile; rétro changes that shape to square.

### Photos, emoji, and feedback

Photo previews reuse shared controls and corners: (96px) square thumbnails, compact gaps, explicit consent and transfer status, and a two-column conversation gallery. The large photo dialog fits the viewport and uses the shared toolbar treatment. Emoji panels use an opaque surface and the overlay shadow; selection uses pale green. Error and success feedback uses compact, centered toasts with explicit text and a shared overlay shadow. Error dismissal retains an accessible icon target.

## Do's and Don'ts

### Do:

- **Do** reuse the shared button, field, dialog, and settings patterns across identity, contacts, conversations, and photos.
- **Do** use semantic theme variables so light, dark, and rétro preserve their distinct palettes.
- **Do** keep message content and the reading plane legible above transparency effects.
- **Do** preserve 44px minimum control targets and the visible focus treatment.
- **Do** respect reduced motion, reduced transparency, safe areas, and the visual viewport when the mobile keyboard opens.
- **Do** keep consent, offline states, errors, and destructive actions explicit in text.

### Don't:

- **Don't** add decorative motifs or extra visual hierarchy that competes with message reading.
- **Don't** turn the whole interface into black and green; light, dark, and rétro have separate palette roles.
- **Don't** apply the pixel font to messages or composer text.
- **Don't** use a permanent technical identity strip above the conversation; keep IDs and technical details in settings.
- **Don't** infer secure-session readiness, delivery, or last activity from decorative indicators.
