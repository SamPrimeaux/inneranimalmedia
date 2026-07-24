# Companions CMS production + IAM hub parity

**Ticket:** `tkt_companions_cms_prod_iam_hub_20260723`  
**Status:** active (validated dual-pass)  
**Surfaces:**  
- Client SSOT editor: `https://companionsofcaddo.org/dashboard/cms`  
- IAM hub (target): [`/dashboard/cms?site=companionscpas`](https://inneranimalmedia.com/dashboard/cms?site=companionscpas) · [`/dashboard/cms/pages?site=companionscpas`](https://inneranimalmedia.com/dashboard/cms/pages?site=companionscpas)  
**Required passes:** `2` (Tier 1 implementer + Tier 2 independent raw pull). Bump to `3` if we treat bridge/control-plane as ship-blocking.

**Related:** `plans/active/CMS-TOOL-CONTRACT-COMPANIONS-IAM-2026-07.md` · `docs/platform/cms-federated-hub-architecture.md` · supersedes pause on `tkt_companions_cms_ssot_audit` for this lane.

---

## Reality check (today)

| Surface | State |
|---------|--------|
| Companions native CMS | Real pipeline (D1 → R2 → KV). Recent: R2 Custom Code, Join Our Team `embedded_form`, hero pain still open. Editor UX still rough (colorways, scene jargon, Multicolumn pending). |
| IAM hub `?site=companionscpas` | Opens Studio shell. Bootstrap/page GET/publish **partially** bridged. Studio writes still PrimeTech dialect → empty IAM D1 or `409 CMS_CLIENT_WORKER_MODE`. **Not** a reliable edit surface yet. |
| `primetech_cms_asset_pipeline` | Agent workflow only — **not** live site resolution. |

**Operator truth until hub parity ships:** manage customers on **companionsofcaddo.org/dashboard/cms**. Use IAM hub for launch/overview only.

---

## What we must create / align

### A — Companions CMS = production (customer-usable)

1. **Editor UX / colorways (this ticket’s design slice)**  
   - Minimal, validated palette for dashboard CMS chrome (not public brand tokens).  
   - Readable contrast for sections list, inspector, pills → labeled fields.  
   - Drop “scene” jargon; Natural media / no forced cards (from Multicolumn UX plan Phase 1).  
2. **No mock surfaces**  
   - Forms: Join Our Team done; audit other disabled HTML.  
   - Custom Code: R2 pointers only (done for paste blobs).  
   - Hero natural media + Multicolumn (plan Phase 1–2).  
3. **Single public CSS** — `cpas-shell.css` only (plan Phase 0).  
4. **Proof** — About + Home edit → Save → Publish → live verify; form submit row in D1.

### B — IAM hub write parity (`?site=companionscpas`)

1. **Expand CPAS adapter** ([`src/core/cms-bridge-cpas-adapter.js`](../../src/core/cms-bridge-cpas-adapter.js)) to Studio verbs:  
   section save / reorder / visibility / page draft / assets list — mapped to Companions `/api/cms/section/save`, triad identity, not `section_data` blobs.  
2. **Studio host federation** ([`StudioCmsHost.tsx`](../../dashboard/pages/cms/studio/StudioCmsHost.tsx) + [`iamApi.ts`](../../dashboard/pages/cms/studio/iamApi.ts)) — pass `site` / bridge context; never write Companions content into IAM D1.  
3. **Tool contract** — implement shared verbs from CMS-TOOL-CONTRACT (page.get, section.save, publish, verify_live).  
4. **Do not** import Companions `cms_pages` into IAM D1.  
5. **Optional later:** embed-session on client worker *or* drop that path from docs.

### C — Design revisions process (validated)

Colorway / chrome changes ship only when:

1. Spec’d against Companions Brand & Settings (public) vs **editor chrome** (admin-only).  
2. Diff limited to dashboard CSS / `view-cms.jsx` tokens (client) and/or Studio cream theme (IAM) — no accidental public brand drift.  
3. Tier 1: screenshot + Publish proof on one page.  
4. Tier 2: independent raw D1/KV/live HTML check.  
5. Then `assert:ticket-shippable --set-shipped`.

---

## Acceptance (ticket shippable)

- [ ] From **client** CMS: edit About hero (natural image, no cream card), Save, Publish, live sharp.  
- [ ] From **client** CMS: Join Our Team submits → `cpas_form_submissions` row.  
- [ ] Editor chrome colorways revised and usable without coaching (staff walkthrough).  
- [ ] From **IAM** `/dashboard/cms/pages?site=companionscpas`: load About sections from Companions D1; save one field; publish; live matches — **or** explicit “hub read-only + deep link to client CMS” until B lands (document which).  
- [ ] Dual-pass recorded (`record:ticket-e2e-pass` ×2).  

---

## Sequencing (recommended)

1. Finish Companions production gaps (A + design) — you can manage customers **today** on client CMS.  
2. IAM hub write parity (B) — then `/dashboard/cms?site=companionscpas` becomes the daily operator surface.  
3. Multicolumn / remaining plan phases as follow-ons under same ticket or child tickets.

---

## Explicit non-goals

- Centralizing Companions content in `inneranimalmedia-business`.  
- Treating PrimeTech Studio dialect as Companions SSOT.  
- Using `primetech_cms_asset_pipeline` as the public asset resolver.
