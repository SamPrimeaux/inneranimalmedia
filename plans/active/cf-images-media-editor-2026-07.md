# CF Images Media Editor + Multi-Source DAM — Unified Plan

**Status:** Active — merging Cursor's initial audit/draft with Sam's follow-up requirements (2026-07-23 late session). Cursor's original file could not be located on `main` or the GCP checkout at merge time — this version supersedes it as canonical until reconciled.

---

## 1. What the docs actually give us (Cursor's audit — confirmed, kept as-is)

Three surfaces:
- **Hosted delivery** — `imagedelivery.net/<hash>/<id>/<variant-or-options>` (current usage, named variants)
- **Zone transforms** — `/cdn-cgi/image/<opts>/<source>` (good for R2/public zone assets)
- **Workers IMAGES binding** — chained `.transform()` / `.draw()` / `.output()` (right engine for an in-app editor)

Editor-relevant params cluster into geometry (fit, gravity, crop/rotate/trim), tone, encode (format/quality), and smart assists (face, `segment=foreground`, `upscale=generate`). Borders/overlays/custom op order are Workers-only.

**Where we are:** DAM uploads to CF Images, serves named variants (public|small|thumbnail|avatar|hero). No crop/adjust UI exists. Main worker has no IMAGES binding (studio-cms-editor does). "Edit" today means OpenAI generative edit — kept separate from CF transforms. Local `sharp` stays Mac-script-only, never the Worker.

---

## 2. Multi-tenant asset ownership model (new — resolves Sam's R2-vs-CF-Images question)

**The rule:** CF Images transform/edit features are billed per-account. A tenant only gets transform/edit capability if *they* connect their own CF account/token — there is no free-riding on the platform owner's CF Images plan.

**R2 is different and already works correctly today:** R2 storage permissions are already granted via the existing CF OAuth connection flow. A connected tenant (e.g. Connor) can already view/manage their own R2-stored images with zero additional setup, because that's scoped to *their* R2 buckets under *their* OAuth grant — not a shared platform resource.

**So, concretely:**
| Asset location | Requires tenant's own CF token? | Notes |
|---|---|---|
| Tenant's own R2 bucket | No — already works via existing OAuth | View/manage today |
| Tenant's own CF Images | Yes | Transform/edit/variant features gated behind their own CF Images plan |
| Local upload / Google Drive | No | Not CF-gated at all, separate auth path (see 5) |
| Platform's shared CF Images | N/A | Should not be exposed as a free tenant feature |

This needs to be an explicit, visible state in the UI — if a tenant has no CF Images token connected, the transform/edit UI should show a clear "Connect your Cloudflare Images account to enable editing" prompt rather than a broken/disabled button with no explanation.

---

## 3. D1 vs CF Images metadata — is tracking tags/variants in D1 redundant?

**No — not redundant, this is standard system-of-record vs. query-index separation.**

CF Images stores per-image metadata (tags, custom fields) but only queryable by individual image ID via their API — there's no cross-image relational querying, no JOIN against other business tables (companionscpas campaigns, client_revenue, CMS content usage), and no way to satisfy the platform's proof-query standard (Law 1/Law 6) against CF's own store.

**Division of responsibility:**
- **CF Images = source of record** for pixel data, transform configs, named variants. Never duplicate transform math in D1.
- **D1 = queryable business index** — thin reference layer: `image_id` (matches CF Images ID exactly), `tenant_id`/`workspace_id` ownership, fast-searchable tags for SQL WHERE/JOIN, and links to what uses this image.

This lets you answer questions CF's own API can't — "show every image tagged hero across all of Companions' campaigns" — without hitting CF Images' API in a loop.

---

## 4. Share button (spec, confirmed with Claude UI reference)

Three states, matching the reference pattern:

1. **Keep private (default)** — no share record created on open.
2. **Share with team** — send via **Resend** (mcp-resend-email.js, already wired as the dedicated transactional sender) rather than Gmail MCP. Needs a recipient picker (workspace teammates) or manual email field as fallback.
3. **Create public link** — surface the image's existing CF Images delivery URL (no new infra needed for v1); optionally a signed/short-lived URL later.

**Difference from Claude's version, intentionally simpler:** no "new messages since last shared -> Update" staleness tracking — an image doesn't mutate after upload the way a chat keeps growing.

**Future, explicitly out of scope for v1 but flagged for real:** "Share to Facebook" button on customer-facing builds. Named use case: Companions of CPAS — direct FB share of an animal/campaign photo from their own dashboard. Track as its own follow-up ticket once the core Share button ships.

---

## 5. Known bug, separate ticket: Google Drive OAuth doesn't persist

Sam reports: connecting Google Drive in Settings -> Integrations, completing the consent click-through 3 times, being redirected back to dashboard — connection does not persist. Blocking the Drive tab in Media Library ("Drive not connected" shown even post-auth, per screenshot).

Likely areas to check first: token storage write path post-callback, whether the OAuth callback handler is actually writing to the credentials table it reads from, and whether a redirect-URI mismatch is silently dropping the token exchange. Filing as its own ticket — real bug, not part of the Images plan's scope, but blocks the Drive source tab.

---

## 6. Cursor's four locked decisions — recommendations

1. **Default save: derivative vs. replace original?** -> **Derivative.** Never overwrite the original. Replace should be explicit opt-in, not default.
2. **R2-only assets: force import to CF first, or always proxy via binding?** -> **Always proxy via binding.** Forcing import duplicates storage and creates a sync problem.
3. **Are flexible variants enabled on the account?** -> **Needs verification before Phase 2 starts** — real blocker-or-not question. Check CF dashboard Images -> Variants settings directly.
4. **Editor as full page vs. DAM modal first?** -> **Full page** (/dashboard/images/:id/edit), consistent with the Images page rebuild routing pattern decided earlier tonight.

---

## 7. Phases (Cursor's structure, kept)

1. **Foundations** — wrangler IMAGES binding on main worker, allowlisted transform URL module, verify flexible variants setting
2. **Delivery optimization** — swap named-variant-only delivery for flexible options where useful
3. **Editor MVP** — geometry + encode controls, save-as-derivative + D1 index row
4. **Smart assists** — face/segment/upscale
5. **Unify pickers** — one picker across CF Images / R2 / Drive / local upload, respecting the ownership model in section 2

---

## 8. Immediate next steps

- [ ] Verify flexible variants enabled on CF Images account (blocks Phase 2 approach choice)
- [ ] File Google Drive OAuth persistence bug as its own ticket
- [ ] Confirm D1 index table schema (image_id, tenant_id, workspace_id, tags, used_in refs) before Phase 3
- [ ] T1: wrangler IMAGES binding + allowlisted transform URL module (Cursor's suggested starting point — agreed)
