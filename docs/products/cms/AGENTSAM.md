# CMS — Agent Sam compass

---

## Context modes

- `cms_platform` — IAM PrimeTech site
- `cms_client_worker` — federated client runtime

---

## Quick actions (platform)

- List CMS pages for active site
- Load bootstrap KV context

---

## Quick actions (Fuel / client worker)

- List pages via bridge admin API
- Verify D1 → R2 → KV publish path

---

## Agent placeholder (UI)

"Update a page, publish changes, or ask Agent Sam to edit this CMS site…"

**Gap:** Add `route_key` to `dashboardRouteContext.ts` for quick actions.

Requires working editor loop for agent edits to be trustworthy.

---

## Proposed agent portfolio (L2 + L5)

| Agent slug | Lane | Primary | Purpose |
|---|---|---|---|
| `cms_platform_editor` | L2 | Codex | Platform pages, KV bootstrap |
| `cms_client_bridge` | L2 | Terra | Federated worker admin API |
| `publish_verifier` | L5 | Gemini 3.5 Flash | D1 → R2 → KV path checks |
| `content_strategist` | L4 | Sonnet 5 | IA, page structure |

Full roster: [`plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md`](../../plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md)

---

## Related

- [../../platform/cms-federated-hub-architecture.md](../../platform/cms-federated-hub-architecture.md)
