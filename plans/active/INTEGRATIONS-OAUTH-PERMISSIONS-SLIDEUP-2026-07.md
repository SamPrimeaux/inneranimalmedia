# Integrations OAuth permissions 1:1 + slide-up UX (2026-07)

**Status:** `active` — UI remaster **after** media functionality freeze / STREAM-QA-001. Document + evidence first.  
**Priority:** P2 (accuracy is trust-critical; do not ship half-true chips)  
**Operator:** Sam · `ws_inneranimalmedia`  
**Baseline live SHA (media BYOK):** `e2b7e3115aa01842cbfa3b04ed1ec8516b3f523c`

## Problem

Integrations Cloudflare drawer shows **~5 capability chips** (“Developer Platform (OAuth)”, R2, Images, Vectorize, Browser Rendering). That **understates** the real OAuth grant and reads as the opposite of client capability.

Live consent (2026-07-24) for **Inner Animal Media Platform** shows **25 total permissions** matching Worker `CLOUDFLARE_OAUTH_SCOPES` (excluding `offline_access` from the consent count):

| Group | Count | Notes |
|-------|------:|-------|
| Account & Billing | 1 | Account Settings Read |
| DNS & Zones | 1 | Zone Read |
| Developer Platform | 19 | D1/Hyperdrive/MCP/Pages/Vectorize/R2/Routes/Scripts/CF Agents |
| Media | 4 | Images Read/Write + **Stream Read/Write** |

Drawer also shows stale grey tags (`account-setting:read`, `d1:read`, …) that are **not** 1:1 with the authorize list.

Past chats cluttering the integrations side drawer is a **later polish** item (same ticket family, after permissions truth).

## Scope truth table (LOCKED)

| Layer | Count | SSOT |
|-------|------:|------|
| OAuth **client catalog** (dash max) | **60** (+ includes AI, KV, CI, Zero Trust, etc.) | `docs/auth/CLOUDFLARE_OAUTH_CLIENT_SCOPES.md` |
| Worker **authorize request** | **26** strings / **25** consent “permissions” | `src/api/oauth.js` → `CLOUDFLARE_OAUTH_SCOPES` |
| Integrations UI chips today | **~5** | `IntegrationsSection.tsx` `foldedCapabilities` via satellite catalog fold — **not** scopes |
| Consent Media | **4** | includes Stream — aligns with Stream BYOK reconnect |

**UI must show the Worker-requested grant (25), grouped like consent**, with an optional “Client can offer more (60) — not requested” disclosure. Never imply only 5 products.

## Desired UX (do not implement until media QA green)

1. Replace side drawer with a **clean bottom slide-up** for integration detail.
2. Permissions section: accordion groups matching CF consent (Account, DNS, Developer Platform, Media) with **every** requested scope label + scope id.
3. Connection health / Test / Re-authorize / Disconnect stay primary actions.
4. “Cloudflare Stack” configure CTA stays secondary.
5. Clear past-chat clutter from this surface (separate subtask; R2 evidence for before/after).

## Evidence (R2 — before snapshots)

Bucket `inneranimalmedia`, prefix `ticket-evidence/2026-07-24-media-qa/`:

| Key | What |
|-----|------|
| `01-integrations-drawer-5-chips.png` | Drawer under-representing capabilities |
| `02-oauth-consent-25-permissions.png` | Consent 25 / Media 4 (Stream included) |

Local mirrors: `~/.cursor/projects/Users-samprimeaux-inneranimalmedia/assets/Screenshot_2026-07-24_at_9.48*` / `9.51*`.

## Acceptance

- [ ] UI lists **exactly** the scopes from `resolveCloudflareOAuthScopes` / stored connection scopes (no hardcoded 5-chip fold as the truth).
- [ ] Stream Read/Write visible when present on token.
- [ ] Slide-up replaces drawer on Integrations detail.
- [ ] Before/after screenshots under same R2 prefix.
- [ ] Dual-pass E2E (Tier 1 + 2) before `shipped`.

## Out of scope for this ticket

- Expanding Worker request from 25 → full 60 (product decision; separate ticket).
- Media Videos / Stream BYOK functionality (already shipped; see STREAM-BYOK plan).
