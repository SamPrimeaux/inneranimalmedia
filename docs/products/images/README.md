# Images (DAM)

**Classification:** `shared_capability`  
**Stage:** `ui_wired_pending_qc`  
**Route:** `/dashboard/images` → `/dashboard/images/storage` (+ Delivery / Keys / Sourcing Kit / `:id` / `:id/edit`)  
**UI:** `dashboard/components/images/*` (wired in `App.tsx`) · legacy `ImagesPage.tsx` retained unused  
**Manifest:** [`product-manifests/images.json`](../../product-manifests/images.json)  
**Sprint SSOT:** [`plans/active/cf-images-media-editor-2026-07.md`](../../plans/active/cf-images-media-editor-2026-07.md)

Shared **digital asset management** — Cloudflare Hosted Images UX on IAM, not a resale SKU.

---

## Stack (target)

| Layer | Path |
|-------|------|
| Shell / tabs | `dashboard/components/images/ImagesShell.tsx`, `imagesRegistry.ts` |
| Storage gallery | `dashboard/components/images/ImagesStoragePage.tsx` |
| Detail / edit / share | `ImagesDetailPage.tsx`, `ImagesEditPage.tsx`, `ImageShareModal.tsx` |
| API | `src/api/images.js` |
| Transform | `src/core/cf-images-transform.js` + Worker `IMAGES` binding |
| Creds | `src/core/cf-oauth-images.js` |
| D1 | `images` (+ `parent_image_id`, `transform_json`, `image_shares`) |

Sources: `all` | `r2` | `cf_images` | `drive` — CF Images transform requires **that workspace’s** Images connection (platform for the platform owner; BYOK for customer workspaces). R2/Drive work without platform Images.

**Drive tab = browse-only.** Connect Google Drive to list/preview files via OAuth proxy. Files stay in Drive until you explicitly **Import to R2** (R2 + D1 registry only — not Cloudflare Images). Hosting on CF Images is a separate explicit action.

---

## Locked product rules

1. **CF Images** = crop/transform/watermark engine (no sharp in Worker).
2. **Detail = route** `/dashboard/images/:id`, not a primary modal.
3. **Tags** = D1 SSOT for query + dual-write to CF `iam_tags` when hosted.
4. **Variants** = CF account variants; committed edits = new D1 derivative rows.
5. **Pagination** = 50 per page (API clamp max 100).
6. **Share** = private / team (Resend) / public delivery URL.
7. **Ship gate** = Agent F §13 CF-docs QC scorecard (22 checks) — no half-baked features.

See sprint spec §13 for Cloudflare doc ownership, `fetch()` response notes, and the QC scorecard.
