# 0001 — Anvil logo with an implied strike

## Context

Forja needs a minimal, clean identity that feels calm and precise. The owner likes an anvil with a fist
acting as a hammer, prefers blue or modern black and white, and needs the identity to work in the app,
browser tabs and a future phone home-screen icon. Light-theme colors should feel comfortable and have
good contrast.

On 2026-11-16 the owner chose direction 2: an anvil with an implied strike. A recognizable fist above
the anvil was considered but adds detail and aggression; an anvil alone is simpler but loses the gesture
of personal effort. There was no previous visual identity decision.

## Decision

- Use a compact, solid anvil silhouette with one small geometric shape above it suggesting a descending
  fist or hammer. The anvil is the primary recognizable shape; the strike is secondary. Do not draw
  fingers, impact lines, flames, gradients, shadows or animation.
- Keep the composition balanced and mostly horizontal, with generous negative space (the empty space
  separating the strike from the anvil). The shapes must remain distinct at small sizes.
- Use a single foreground color per symbol. Produce an SVG master (vector shapes that scale without
  becoming blurry), with a square view box and enough inset to avoid clipping in icon masks.
- Pair the symbol with the exact name **Forja** in Geist Regular, the app's existing sans-serif family,
  using normal letter spacing. Do not add a font dependency for the logo. This combination is the
  wordmark arrangement; the symbol must also work independently.
- Use these identity colors: deep blue `#1E40AF` for the primary symbol, charcoal `#18181B` for the name,
  and soft off-white `#FAFAF9` for light identity surfaces. Also provide solid black and solid white
  versions. Use white on dark surfaces; do not place the deep blue symbol directly on a dark background.
  These are logo colors, not a decision about the entire app theme or semantic colors for controls.
- Calculated contrast ratios are 8.35:1 for blue on off-white, 16.96:1 for charcoal on off-white and
  8.72:1 for white on blue. Contrast is the relative difference in brightness between foreground and
  background; it does not by itself guarantee visual comfort. Avoid large saturated blue backgrounds
  in the light-theme logo arrangement.
- Supply a horizontal symbol-plus-name arrangement for sign-in and app headers, a standalone square
  symbol for browser tabs, and raster exports for future home-screen use. If the strike cannot remain
  distinct at 16 px, use an anvil-only optical variant at that size rather than squeezing in detail.
- Decorative copies beside the visible app name are hidden from assistive technology. A standalone
  meaningful logo has a localized accessible name. A linked logo uses a localized label describing its
  destination. Every label goes through next-intl in both English and Spanish. Any clickable logo has
  a touch area of at least 44 × 44 px; the graphic itself can be smaller.

The owner clarified that Codex creates the logo and visual designs; Claude Code implements those designs
in the app. Finished artwork is supplied in `docs/assets/logo/`, with usage instructions and a preview.
The SVG wordmarks contain outlined Geist Regular lettering, so they require no font at runtime. Claude
Code integrates these assets without recreating the geometry. The 16 px/favicon SVG variant omits the
strike; larger raster icons retain it. Assets remain outside `apps/` under the owner's editing limits.

## Consequences

Implementation tasks for the orchestrator:

| Owner / package | Required change | Acceptance criteria |
|-----------------|-----------------|---------------------|
| `frontend-dev` / `apps/web` | Copy the supplied masters from `docs/assets/logo/` into app-owned assets and create reusable presentations. | Use the delivered geometry unchanged; no new runtime or font dependency. |
| `frontend-dev` / `apps/web` | Replace placeholder branding in the M3 shell and sign-in view; add browser favicon assets through the app's metadata conventions. | Review at 16, 32 and 48 px, and at header size, on light and dark surfaces. The anvil remains recognizable and the strike remains separate, or the documented 16 px variant is used. |
| `frontend-dev` / `apps/web` | Integrate the supplied 180 × 180, 192 × 192 and 512 × 512 PNG icons, preserving safe inset and the opaque identity background. | Check square and rounded-mask previews for clipping. Supply assets without adding PWA installation or offline behavior; those remain M5. |
| `frontend-dev` / `apps/web` | Add English and Spanish accessibility labels through next-intl and appropriate decorative treatment. | No duplicate announcement beside visible text; linked logo has a destination label and a minimum 44 × 44 px touch area. |
| Orchestrator / `docs/PLAN.md` | Describe the logo, favicon and sign-in/header branding in the M3 app-shell scope, and reference this decision for future M5 PWA icons. | Preserve milestone order and existing checkbox states. |
| Orchestrator / `docs` | Retain this decision and the matching identity section in `docs/ARCHITECTURE.md` as implementation references. | Future changes to this direction receive a new decision record and an architecture update. |

No changes are required in `packages/core`, `packages/db`, `packages/config`, `e2e` or `CLAUDE.md` rules.
For role documentation, the orchestrator should record that Codex owns visual design and artwork in
`docs/assets/`, while Claude Code owns application implementation; align `AGENTS.md`,
`docs/ORCHESTRATION.md` and mirrored role definitions with this owner-authorized scope.
The design stays within the presentation layer and existing mobile-first and internationalisation rules.
The small-size optical variant means two related silhouettes must be maintained. The delivered preview was visually reviewed at header and icon sizes. Integration
still needs visual review because contrast calculations cannot establish recognizability or perceived calmness.
