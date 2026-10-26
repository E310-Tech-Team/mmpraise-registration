# 04 — UI / UX Design Brief

The design source of truth is **[MMPRAISE-DESIGN-REFERENCE.md](../MMPRAISE-DESIGN-REFERENCE.md)** — brand tokens measured from the live mmpraise.org site on 2026-07-30 — plus the ready-to-use token file [`mmpraise-theme.css`](../mmpraise-theme.css). This brief records how those tokens were **actually implemented** in the application (`src/app/globals.css`, Tailwind v4 `@theme`) and where the implementation deliberately departs from the brand for accessibility.

---

## 1. Design direction

Bold, warm, editorial event branding — the opposite of the generic Bootstrap look of the legacy volunteer app. The signature moves:

- **Headings are always uppercase Afacad 700**, tight leading; card headings use negative letter-spacing (-1px) for their compressed look.
- **Body copy is Figtree 400**, never Afacad.
- **Buttons are always pills** (radius 30px / `--radius-pill`), `20px 40px` padding, uppercase Afacad 700.
- **One orange does the CTA work.** No second brand hue, and **no gradients anywhere** (asserted by the design system comment in `globals.css`).
- **Warm neutrals only**: ink `#1C0D0A` (a warm near-black, not grey) for headings, `#353535` for body — the warmth ties the type to the orange.
- **Section rhythm**: alternating white → cream wash → black bands; photography always gets a `rgba(0,0,0,.48)` scrim before white type sits on it.
- Cards: white surface, subtle sand border, ~12px radius, soft shadow.

## 2. Typography

Two Google Fonts (loaded via `next/font`, exposed as `--font-afacad` / `--font-figtree`):

| Role | Token | Font |
|---|---|---|
| Display — headings and buttons | `--font-display` | **Afacad** 400–700 |
| Body — paragraphs, labels, UI | `--font-sans` | **Figtree** 400–700 |

The measured heading scale (hero 42–44px, section H2 38px, card H3 26px with -1px tracking, eyebrow pill 22px) is documented in [MMPRAISE-DESIGN-REFERENCE.md §1](../MMPRAISE-DESIGN-REFERENCE.md).

## 3. Colour system (as implemented in `src/app/globals.css`)

### The accessibility departure — the most important rule

The brand orange `#F34402` measures only **3.72:1** against white, failing WCAG 2.1 AA for normal text. The implementation therefore splits the orange in two:

| Token | Hex | Use |
|---|---|---|
| `--color-brand` | `#F34402` | **Display and decorative only** — large type, eyebrow pills, surfaces |
| `--color-primary` | `#D63A02` (4.70:1) | **All interactive elements** — buttons, links, focus rings |
| `--color-primary-hover` | `#B32F02` (6.32:1) | Hover |
| `--color-primary-active` | `#A62C02` | Active |
| `--color-primary-subtle` / `-border` | `#FFF1EA` / `#FFD3C2` | Tints |

Ratios are **asserted in `tests/unit/contrast.test.ts`** — the palette cannot regress silently.

### Neutrals and surfaces

`--color-ink #1C0D0A` (18.90:1) · `--color-body #353535` (12.27:1) · `--color-muted #5A5A5A` (6.90:1) · `--color-line #E5D7D1` · `--color-surface #FFFFFF` · `--color-surface-sunken #FAF7F5` · `--color-cream #FEF1E4` · `--color-night #140B06` (dark sections).

### Worship gold accent

`--color-gold #C9A227` with `--color-gold-deep #8A6A12` (4.83:1, the only shade used for readable text) and `--color-gold-subtle` — used sparingly for moments set apart: the countdown, the global-reach statement, the featured testimony.

### Status colours

Each paired with an accessible shade and a subtle tint: success `#0F7A3D`, warning `#8A5A00`, danger `#B4241A`, info `#1F5F8B`.

## 4. Shape, elevation, motion

- Radii: `--radius-card 0.875rem`, `--radius-field 0.625rem`, `--radius-pill 9999px`, plus an sm→xl scale.
- Shadows: three deliberate levels (`--shadow-card`, `--shadow-raised`, `--shadow-overlay`) — "subtle, never dramatic", all tinted with the warm ink.
- A shared header-height token keeps the transparent header and the hero image aligned with no background sliver.
- Motion: GSAP via `src/lib/motion.ts` and the `Reveal` component (`src/components/ui/reveal.tsx`).

## 5. Component library

Hand-rolled primitives over Radix, styled with the tokens above — see `src/components/ui/` (`primitives.tsx` with Button/inputs, `dialog`, `sheet`, `accordion`, `combobox`, `form`, `progress`, `separator`, `reveal`) and `components.json` (shadcn-style config). Wizard-specific components live in `src/components/apply/` (`step-shell`, `progress-steps`, `question-field` — the single renderer used by the wizard, `/participate` and the admin question preview alike).

Button variants follow the reference: primary (solid primary orange, white text), ghost-on-dark (transparent, white border), ghost-on-light (transparent, ink border) — all pills, all uppercase display type.

## 6. UX principles observed in the build

1. **Short steps, never a wall**: the eight-step wizard replaces one long form; each step is one topic; progress is autosaved and shown (`ProgressSteps`).
2. **Only ask what applies**: conditional department questions, denomination-dependent church fields, guardian consent only for minors, "Other" options revealing free text.
3. **Review before commit**: the review step renders every answer through the same `formatAnswer` used everywhere, with per-section edit links.
4. **Accessible by test, not intention**: axe-core runs in E2E across desktop/mobile/tablet; layouts verified 320–1920px; reordering controls are keyboard-accessible.
5. **Mobile-first honesty**: real bugs found and fixed via mobile E2E runs (dialog centring, dialog autofocus displacement, permission-table overflow) are logged in [ADMIN-ROADMAP.md](ADMIN-ROADMAP.md).
6. **Admin tone**: dense, information-first tables with status tabs, ageing indicators (amber past 7 days), permission-gated columns, and "Technical details" disclosures for raw data.

## 7. Assets

Homepage assets live in `/public/landing`; the MMPraise mark is `/public/logo.png` (also the source for `src/app/icon.png` and `apple-icon.png`). **Nothing is hotlinked from the WordPress site.** Unverified content (artist names, phone numbers, social URLs) is deliberately omitted until confirmed — see [HOMEPAGE-AUDIT.md](HOMEPAGE-AUDIT.md), [ABOUT-AUDIT.md](ABOUT-AUDIT.md), [CONTACT-AUDIT.md](CONTACT-AUDIT.md) for the page-by-page reasoning.
