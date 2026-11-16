# 0001 — Metallic barbell-end logo on navy

## Context

Forja is a personal workout journal and strength-progression app. Its identity should feel calm and
precise, have a recognizable connection to lifting, and work as a standalone symbol without letters.
The owner prefers blue and liked the soft metallic treatment in app-icon references.

The owner rejected an anvil with an implied strike, an anvil with a barbell, a letter-based weight plate,
and abstract forms that either resembled the references too closely or lost the gym connection. A
three-grip plate also suggested a hazard symbol. On 2026-11-16 the owner approved a loaded barbell end
viewed from the side, chose navy, and approved the resulting silver-on-navy preview before final assets
were prepared. Earlier anvil assets were unmerged proposals in this same PR and have been replaced.

## Decision

- The mark is three thick upright plates with rounded ends, the middle plate tallest, with a short bar
  sleeve extending to the right. There are no letters, numerals, anvil, or supplementary symbols.
- Preserve the approved soft brushed/satin silver finish, restrained highlights, blue-gray side faces,
  and midnight navy background. `#101B35` and `#DDE7F5` are palette anchors, not uniform pixel colors;
  shading is part of the supplied artwork. This does not set the full application theme.
- Codex creates visual designs and artwork; Claude Code integrates them in the application. Use the
  supplied PNG artwork without redrawing it or approximating the metal using CSS. This is a raster
  identity; no vector equivalent or new wordmark is approved in this change.
- Canonical assets live in `docs/assets/logo/`. `approved-preview.png` preserves the exact approved
  rounded-tile image. `master.png` is the production packaging edit: the outer tile border and white
  corners are removed and navy extends to all edges, leaving OS corner masking to the platform.
  Both are 1254 × 1254 px. Delivered sizes are 180, 192, 512 and 1024 px, plus 16/32/48/64 px favicons
  and a multi-resolution ICO. Export sizes do not imply installable PWA behavior is part of M3.
- At very small sizes the metallic texture softens. Use the supplied favicon instead of inventing a new
  flat mark. A separate simplified vector can be proposed later only if needed and approved by the owner.
- Use the supplied image in the M3 app shell and sign-in view, with the ordinary app name rendered
  separately using existing typography if needed. Do not recreate the discarded wordmarks.
- Accessible labels belong to the embedding component, through next-intl in English and Spanish.
  Hide decorative duplicates beside visible app text. A linked logo needs a destination label and at
  least a 44 × 44 px touch area. The artwork contains no interface text.

## Consequences

| Owner / package | Required change | Acceptance criteria |
|-----------------|-----------------|---------------------|
| `frontend-dev` / `apps/web` | Copy production PNG and ICO assets from `docs/assets/logo/` into app-owned assets and wire the M3 shell, sign-in branding and metadata. | Use delivered artwork without redrawing; select suitable export sizes; preserve aspect ratio. |
| `frontend-dev` / `apps/web` | Use the 180 px export as the Apple touch icon; reserve 192/512 px exports for future home-screen use. | Use full-bleed assets where the OS applies the mask; do not use the rounded preview for OS icons. PWA installation/offline behavior stays M5. |
| `frontend-dev` / `apps/web` | Add localized accessibility labels and decorative treatment. | No duplicate announcements; linked logos have a localized destination and 44 × 44 px minimum touch area. |
| Orchestrator / `docs/PLAN.md` | Describe the supplied logo/favicon assets in the M3 app-shell scope; reference them for M5 PWA icons. | Preserve milestone order and existing checkbox states. |
| Orchestrator / role docs | Record Codex ownership of design/artwork in `docs/assets/` and Claude Code ownership of application integration in `AGENTS.md`, `docs/ORCHESTRATION.md` and mirrored role definitions. | Roles reflect the owner's explicit workflow; no application code is assigned to Codex. |
| Orchestrator / `docs` | Retain this record and architecture section 4.1 as the handoff. | Further visual changes require owner approval before asset or PR updates. |

No changes are required in `packages/core`, `packages/db`, `packages/config`, `e2e` or `CLAUDE.md` rules.
Raster masters are finite resolution and larger than flat SVGs; this preserves the finish the owner chose.
No export is enlarged beyond the source. No maskable-PWA safe-area certification is claimed; that use
needs its own masking review during M5. Real interface integration still needs visual/accessibility review.
