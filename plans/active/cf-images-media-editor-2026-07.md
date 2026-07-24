# Sprint Spec: Media Library rebuild (`/dashboard/images`)

**Status:** LOCKED for multi-agent sprint — one ship, one live surface  
**Canonical on `main`:** this file supersedes the short interim merge (`9f29c098` / Claude unified sketch).  
**Product URL:** `https://inneranimalmedia.com/dashboard/images`  
**Related product doc:** `docs/products/images/README.md`  
**CF docs hub:** §13 (owner matrix + QC gate — **no half-baked ship**)  
**Lanes:** Cursor = Lane 1 · Claude = Lane 2 · ChatGPT = Lane 3 (see §15 after push instructions)

---

## 0. Sprint contract

| Rule | Value |
|------|--------|
| Outcome | One coordinated deploy: rebuilt Media Library + CF Images transform/edit + Share + Drive fix |
| Style | Cloudflare Hosted Images UX (breadcrumb detail pages, tabs, multi-select) — **not** modal-first |
| Sharp in Worker | **Forbidden** for this product path |
| Sharp on Mac scripts | **Keep** (`scripts/designstudio/*`, `scripts/lib/glb-optimize.mjs`, PWA icon scripts) |
| “Optional” language | **None** — every section below is in-scope for this sprint |
| Tenancy | Platform Sam gets platform CF Images; customers (e.g. Connor) use **their** CF Images only after Cloudflare OAuth connects Images; R2/Drive/local remain visible via their own connections |
| Dual-pass tickets | Product tickets: Tier 1 + Tier 2 before `shipped` (`rule_ticket_dual_pass_e2e`) |

**Ship lane:** Mac → `npm run deploy:full` after commit/push (SPA + worker + PWA). Do not ship from GCP `iam-tunnel` with Vite.

---

## 1. Decisions (locked)

### 1.1 Transform engine = Cloudflare Images

Sam already pays for CF Images and has essentially **zero** transformations used. Do **not** build a custom Worker image pipeline with sharp/libvips.

| Capability | Mechanism |
|------------|-----------|
| Live preview / delivery sizes | Hosted delivery URL with named variant **or** flexible options |
| Commit crop/tone/export | `env.IMAGES` binding: `.input().transform()….output()` |
| Watermarks / logos | `.draw()` (Workers-only) |
| AI cutout / upscale | `segment=foreground`, `upscale=generate` (Phase C of this sprint) |
| Generative “AI edit” | Existing OpenAI `POST /api/images/edit` — **separate verb** from CF transform |

### 1.2 Navigation = real routes, not popups

| Route | Role |
|-------|------|
| `/dashboard/images` | Redirect → `/dashboard/images/storage` |
| `/dashboard/images/storage` | Gallery (previews), multi-select, batch export/delete, source filters |
| `/dashboard/images/delivery` | Variants + flexible transform presets (account/workspace) |
| `/dashboard/images/keys` | CF Images credential status, account hash, connect Cloudflare OAuth |
| `/dashboard/images/sourcing-kit` | Import sources: R2 buckets, Drive, URL upload, Drive connect repair |
| `/dashboard/images/:id` | Detail page (CF-style): metadata, tags, variant grid, Export / Edit / Delete / Share |

Clicking a gallery tile **navigates** to `/dashboard/images/:id` (React Router). Fullscreen lightbox may remain as an overlay **on the detail page only**, not as the primary detail UX.

### 1.3 Share = required product pathway

Share is a **controlled modal** (acceptable exception — Claude-style privacy chooser). States:

1. **Keep private** (default) — no share record; close.
2. **Share with team** — email delivery URL + preview via **Resend** (`resend-email` path / existing mail API). Recipient = workspace teammates and/or manual email.
3. **Create public link** — reveal/copy CF delivery URL (`…/imagedelivery.net/{hash}/{id}/public` or selected variant). Later: signed/expiring links; later-later: customer “Share to Facebook” for Companions — **out of this sprint’s code**, documented as follow-on product hook only.

### 1.4 Storage sources (tenancy — precise)

| Source | Who sees it | Transform/edit with CF Images |
|--------|-------------|-------------------------------|
| **R2** | User’s connected Cloudflare OAuth / workspace R2 bindings | Browse + download always when R2 connected. **Transform commit** requires CF Images credentials for that workspace (platform for Sam; Connor’s own Images token/hash). R2 objects stay in R2 until user explicitly migrates/uploads to CF Images. |
| **CF Images** | Only if workspace has Images credentials | Full transform, variants, tags sync to CF meta |
| **Drive** | User’s Google Drive OAuth | Browse/import; import-to-library may write R2 and/or CF Images per policy below |
| **All** | Union of above, workspace-scoped | Same rules per item `source` |

**Connor:** Cloudflare OAuth already grants R2 — he can view his R2 images. He does **not** get free use of **Sam’s** CF Images account. Connecting his CF Images enables transform/edit/delivery on **his** hosted images.

### 1.5 D1 vs Cloudflare-native: tags / variants / edits

**Not redundant — different jobs.**

| Concern | Cloudflare Images | D1 (`images` table + related) | Rule |
|---------|-------------------|-------------------------------|------|
| **Tags** | `metadata.iam_tags` (already written by `buildCfImagesMetaPayload`) | `images.tags` TEXT + `GET /api/images/tags` DISTINCT | **Dual-write.** D1 is query/filter/autocomplete SSOT across R2+Drive+CF. CF meta mirrors for hosted assets. |
| **Named variants** (`avatar`, `hero`, …) | Account-level CF variant definitions | Do **not** duplicate as per-image rows | Store workspace **preset catalog** in D1 only if we customize beyond CF defaults (Delivery tab). |
| **Flexible transforms** (preview) | URL options / binding stream | No row until commit | Preview is ephemeral. |
| **Committed edits** | New hosted image id (derivative) | New `images` row: `parent_image_id`, `transform_json`, `cloudflare_image_id`, `timestamp_unix` | **Required.** Derivatives are first-class library items. |
| **Share records** | N/A (delivery URL) | `image_shares` (or metadata) for team shares: who, when, channel | Required for “Share with team” audit. |

---

## 2. Current baseline (facts agents must not re-discover incorrectly)

| Fact | Location / value |
|------|------------------|
| Route today | `dashboard/App.tsx` → `path="/dashboard/images"` → lazy `ImagesPage` |
| UI monolith | `dashboard/components/ImagesPage.tsx` (~1500+ lines): gallery + modal detail + upload |
| Default page size | `useState(100)` — **must become 20** |
| API | `src/api/images.js` — list/upload/tags/PATCH; CF REST; Drive via `getOAuthToken(..., 'google_drive')` |
| Delivery helper | `cfDeliveryUrl(hash, id, variant)` → `imagedelivery.net/...` |
| Account hash var | `CLOUDFLARE_IMAGES_ACCOUNT_HASH` (`g7wf09fCONpnidkRnR_5vw` platform) |
| Creds | `src/core/cf-oauth-images.js` — user Cloudflare OAuth → platform token fallback |
| Main worker `IMAGES` binding | **Missing** (studio-cms-editor has one) |
| Tags API | `GET /api/images/tags` already exists; TagEditor exists but must match CF “Create key” UX |
| Drive connect write path | `src/api/oauth-login-callbacks.js` `connectDrive` → `upsertOauthToken` provider `google_drive` |
| Drive popup complete | `src/core/oauth-popup-complete.js` postMessage `iam_oauth_done` |
| ImagesPage Drive UX | Shows “Drive not connected” from `drive_connected` on list response — **does not** clearly own the connect+persist loop |

---

## 3. Target information architecture

```
/dashboard/images                    → Navigate to storage
/dashboard/images/storage            → Gallery shell + source chips (All|R2|CF|Drive)
/dashboard/images/delivery           → Variants + transform presets
/dashboard/images/keys               → Credentials / connect CF Images
/dashboard/images/sourcing-kit       → Imports + Drive connect + R2 bucket picker
/dashboard/images/:id                → Detail (Export | Edit | Delete | Share)
/dashboard/images/:id/edit           → Transform editor (config left, live preview right)
```

**Shared chrome:** `dashboard/components/images/ImagesShell.tsx`  
Tabs: Storage | Delivery | Keys | Sourcing Kit (same pattern intent as former analytics tab registry — implement `dashboard/components/images/imagesRegistry.ts`).

**Registry file (required):**

```ts
// dashboard/components/images/imagesRegistry.ts
export const IMAGES_TABS = [
  { id: 'storage', path: '/dashboard/images/storage', label: 'Storage' },
  { id: 'delivery', path: '/dashboard/images/delivery', label: 'Delivery' },
  { id: 'keys', path: '/dashboard/images/keys', label: 'Keys' },
  { id: 'sourcing-kit', path: '/dashboard/images/sourcing-kit', label: 'Sourcing Kit' },
] as const;
```

---

## 4. Feature specs (must ship)

### F1 — Pagination (20)

| Item | Spec |
|------|------|
| Default `per_page` | **20** (UI + API default when omitted) |
| UI | Page N of M · prev/next · keep search/tag/source filters |
| API | `GET /api/images?page=&per_page=` already exists; clamp max 100 (was 200) for gallery safety |
| Thumbnails | Prefer `thumbnail` / `small` delivery URLs for grid cards — never force full `public` decode for 20 tiles |
| Agent | **Agent A (perf)** — can land first as hotfix if needed, then merge into rebuild |

### F2 — Storage page layout (Cloudflare Hosted Images mirror)

**Route:** `/dashboard/images/storage` (also what `/dashboard/images` redirects to).  
**Visual reference:** CF dashboard Hosted images → Storage (drop zone + Usage/Account sidebar + list actions).  
**IAM difference:** primary library is a **preview gallery**, not filename-only rows.

```
┌─────────────────────────────────────────────┬──────────────────────────┐
│ Tabs: Storage | Delivery | Keys | Sourcing  │                          │
│                                             │  Usage (this period)     │
│  ┌─ drag / click upload zone ─────────────┐ │  • Images stored         │
│  └─────────────────────────────────────────┘ │  • Images transformed    │
│                                             │                          │
│  [Export selected]  [Delete selected]       │  Account                 │
│                                             │  • Account ID   [copy]   │
│  Gallery grid (previews, 20/page)           │  • Account hash [copy]   │
│  □ thumb  □ thumb  …                        │  • Image Delivery URL    │
│  each card: … → Edit | Copy URL | Export |  │    [copy]                │
│              Delete                         │  (or Connect CTA)        │
└─────────────────────────────────────────────┴──────────────────────────┘
```

| Element | Spec |
|---------|------|
| **Drop zone** | Top of Storage; drag file/folder or click → upload into **active source** (see source chips). CF Images source → hosted upload / Direct Creator Upload. R2 source → R2 put. Drive source → not a direct Drive write from drop (import path in Sourcing Kit); drop disabled or routes to import helper with clear copy. |
| **Usage (right)** | **Live numbers only — never hardcoded.** `Images stored` = count for active source/workspace. `Images transformed` = unique CF transformations this period when CF Images connected; else `—` + connect hint. Period label (e.g. Jul 1 – Aug 1) from API. |
| **Account (right)** | Dynamic from **that user’s/workspace’s** Cloudflare Images connection: Account ID, Account hash, Image Delivery URL (`https://imagedelivery.net/{hash}`) + copy. **Not connected:** replace values with clean **Connect Cloudflare Images** pathway (Keys tab / OAuth start). Connor sees **his** IDs after connect — never Sam’s. |
| **Gallery** | Preview tiles, multi-select checkboxes, select-all on page, pagination 20. |
| **Batch** | Export selected · Delete selected (enabled when selection ≥1). |
| **Per-item `…` menu** | **Edit** → `/dashboard/images/:id/edit` · **Copy image url** → delivery/public URL for that item · **Export** · **Delete** (confirm). |
| **Source chips** | All \| R2 \| CF Images \| Drive — **same chrome, source-specific sidebar + drop behavior** (below). |
| **File** | `ImagesStoragePage.tsx` + `ImageRowMenu.tsx` (or card `…` menu) |

#### Source chips — conceptual mirror

| Source filter | Drop zone | Usage sidebar | Account / connect sidebar |
|---------------|-----------|---------------|---------------------------|
| **CF Images** | Upload to hosted Images | Stored + transformed (CF) | Account ID / hash / delivery URL **or** Connect CF Images |
| **R2** | Upload to selected bucket/prefix | Object count / bytes in scope | Cloudflare OAuth status for **R2** (already in scopes: `workers-r2.*`) · Connect Cloudflare if missing · bucket picker |
| **Drive** | Point to Sourcing Kit / import (or disable with CTA) | File count when connected | **Connect Google Drive** OAuth · reconnect if token dead |
| **All** | Prefer CF Images if connected, else R2 if connected, else Connect CTAs | Combined stored count; transformed only if CF Images | Show primary connected account + “manage connections” |

#### Cloudflare OAuth scope note (Lane 3 / Keys)

Today `CLOUDFLARE_OAUTH_SCOPES` in `src/api/oauth.js` includes **R2** (`workers-r2.*`) but **does not** include Cloudflare Images scopes. R2 browse/upload via CF OAuth is the easy path. **CF Images for customers requires adding Images scopes on the IAM OAuth client** (dash → OAuth clients) **and** to `CLOUDFLARE_OAUTH_SCOPES` (or `CLOUDFLARE_OAUTH_SCOPES` env), then users **re-consent**. Until then: Keys page must say “R2 connected; Images not authorized — reconnect with Images permission.” Platform Sam continues via platform token / hash vars.

### F3 — Detail page (`/dashboard/images/:id`)


Mirror CF dashboard structure:

- Breadcrumb: `Images > Storage > {filename}`
- Header actions: **Export** · **Edit** · **Share** · **Delete**
- Left: Image ID, Created, Filename, Creator, Visibility, Tags (+ Add tag)
- Right: Metadata JSON (tenant/workspace/user + iam_* fields)
- Below: Variant grid (`avatar` `hero` `large` `medium` `public` `small` `thumbnail`) + large preview for selected variant

| File | Role |
|------|------|
| `dashboard/components/images/ImagesDetailPage.tsx` | Page |
| `dashboard/components/images/ImageVariantGrid.tsx` | Variant tiles |
| `dashboard/components/images/ImageShareModal.tsx` | Private / team / public link |
| `dashboard/components/images/ImageTagPicker.tsx` | Autocomplete + Create |

**API:** `GET /api/images/:id` (add if missing — currently list+PATCH oriented). Must scope by `workspace_id` / auth user.

### F4 — Tag picker (Create key UX)

| Item | Spec |
|------|------|
| Data | `GET /api/images/tags?workspace_id=` (exists) |
| UX | Typeahead of existing tags; if no match → row **Create tag "{input}"** |
| Write | `PATCH /api/images/:id` `{ tags: string[] }` → dual-write D1 + CF `iam_tags` via existing `syncImageStorageMeta` |
| Batch | `POST /api/images/batch/tags` `{ ids: string[], add: string[], remove?: string[] }` |

### F5 — Edit / transform (`/dashboard/images/:id/edit`)

UI mirrors CF “Create variant” layout: **Configuration** left · **Preview** right.

| Control | CF param / API |
|---------|----------------|
| Width / height | `width`, `height` |
| Fit | `fit` (`scale-down` default, `cover`, `contain`, `pad`, …) |
| Gravity | `gravity` / face / auto / {x,y} |
| Rotate / flip | `rotate`, `flip` |
| Tone | `brightness`, `contrast`, `saturation`, `gamma` |
| Blur / sharpen | `blur`, `sharpen` |
| Format / quality | `format`, `quality` |
| Watermark | `.draw()` with workspace logo asset |
| Segment / upscale | `segment=foreground`, `upscale=generate` (gates behind confirm + cost copy) |

| Endpoint | Behavior |
|----------|----------|
| `GET /api/images/:id/preview-url?ops=…` | Returns allowlisted delivery URL or binding preview route |
| `POST /api/images/:id/transform` | Body `{ ops, mode: "derivative" }` → binding → upload hosted → INSERT D1 derivative |
| `GET /api/images/transform/:jobId` | If async needed; prefer sync for MVP under size limits |

**Default save mode:** `derivative` only (no silent replace). Replace requires explicit `mode: "replace"` + confirm UI.

**Module:** `src/core/cf-images-transform.js` — allowlist, clamp ranges, `buildDeliveryOptions`, `applyBindingPipeline(env, bytes, ops)`.

**Wrangler:** add to `wrangler.jsonc` + `wrangler.production.toml`:

```jsonc
"images": { "binding": "IMAGES" }
```

### F6 — Delivery / Keys / Sourcing Kit pages

| Page | Must include |
|------|----------------|
| **Delivery** | List named variants (from CF API or hardcoded known set synced to D1 presets); document flexible URL pattern; “copy URL for size” |
| **Keys** | Show connected Cloudflare account / Images hash; Connect / Reconnect OAuth; clear message when Images unavailable (R2 still OK) |
| **Sourcing Kit** | Upload file/URL; Drive connect button + status; R2 bucket/prefix; “Import to CF Images” for selected R2 objects |

### F7 — Share

| State | Implementation |
|-------|----------------|
| Keep private | No DB write |
| Share with team | `POST /api/images/:id/share` `{ channel: "email", emails: string[] }` → Resend template with preview + delivery link; INSERT share audit row |
| Create public link | Return `{ url }` for selected variant; copy button |

**Out of sprint code (document only):** Share to Facebook / Companions social — design hook on `ImageShareModal` for future `channel: "facebook"`.

### F8 — Google Drive persistence bug (required repair)

**Symptom:** User completes Google permission click-through 3×; returns to dashboard; Drive still not connected.

**Investigation order (Agent D owns):**

1. Confirm OAuth start sets `connectDrive: true` (or equivalent) in KV/state — not login-only Google.
2. Confirm callback `upsertOauthToken` `user_id` matches `getOAuthToken` / `integrationUserId` key used by `GET /api/images` (`auth_users.id`).
3. Confirm provider normalized to `google_drive` (legacy `google` rows readable — already partially handled in `user-oauth-token.js`).
4. Confirm Images / Integrations UI listens for `iam_oauth_done` postMessage **and** re-fetches `drive_connected`; if flow is full-page redirect to `/dashboard/images`, parse query `drive=connected` and reload.
5. Confirm refresh_token stored (Google only returns refresh on first consent / `access_type=offline` + `prompt=consent`).
6. Proof: after connect, raw D1 row in `user_oauth_tokens` for that `user_id` + `drive_connected: true` on next list.

**Files:** `src/api/oauth-login-callbacks.js`, `src/core/user-oauth-token.js`, `src/core/oauth-popup-complete.js`, `dashboard/components/images/ImagesSourcingKitPage.tsx`, integrations connect entry points.

### F9 — Agent Sam batch (same sprint, after gallery)

Multi-select → agent instruction envelope (not a second gallery):

| Action | Behavior |
|--------|----------|
| Tag | `POST /api/images/batch/tags` |
| Migrate to R2 | Existing R2 put tools / internal batch job |
| Migrate to CF Images | Upload bytes → hosted → D1 |
| Edit | Queue transform jobs with shared `ops` |

UI: “Send to Agent Sam…” opens composer with selected ids in context (`image_ids: [...]`). Tooling must already resolve workspace scope.

---

## 5. File / module map (create vs edit)

### Create

| Path | Owner |
|------|-------|
| `dashboard/components/images/imagesRegistry.ts` | Agent B |
| `dashboard/components/images/ImagesShell.tsx` | Agent B |
| `dashboard/components/images/ImagesStoragePage.tsx` | Agent B |
| `dashboard/components/images/ImagesDetailPage.tsx` | Agent B |
| `dashboard/components/images/ImagesEditPage.tsx` | Agent C |
| `dashboard/components/images/ImagesDeliveryPage.tsx` | Agent C |
| `dashboard/components/images/ImagesKeysPage.tsx` | Agent E |
| `dashboard/components/images/ImagesSourcingKitPage.tsx` | Agent D |
| `dashboard/components/images/ImageVariantGrid.tsx` | Agent B |
| `dashboard/components/images/ImageTagPicker.tsx` | Agent B |
| `dashboard/components/images/ImageShareModal.tsx` | Agent B |
| `dashboard/components/images/ImageBatchBar.tsx` | Agent B |
| `src/core/cf-images-transform.js` | Agent C |
| `migrations/XXX_image_derivatives_and_shares.sql` | Agent C |

### Edit heavily

| Path | Owner |
|------|-------|
| `dashboard/App.tsx` | Agent B — route table |
| `dashboard/components/ImagesPage.tsx` | Agent B — thin re-export/redirect to storage **or** delete after split |
| `src/api/images.js` | Agents C/D/E — endpoints |
| `wrangler.jsonc`, `wrangler.production.toml` | Agent C — `IMAGES` binding |
| `docs/products/images/README.md` | Agent F (docs) — sync to this spec |
| `product-manifests/images.json` | Agent F |

### Migration sketch (required columns)

```sql
-- images: parent + transform receipt
ALTER TABLE images ADD COLUMN parent_image_id TEXT;
ALTER TABLE images ADD COLUMN transform_json TEXT; -- allowlisted ops JSON
-- shares
CREATE TABLE IF NOT EXISTS image_shares (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  shared_by TEXT NOT NULL,
  channel TEXT NOT NULL, -- email | public_link
  recipients_json TEXT,
  delivery_url TEXT,
  created_at_unix INTEGER NOT NULL
);
```

(Use next free migration number after remote head; timestamps INTEGER unixepoch only.)

---

## 6. API contract (additions)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/images/:id` | Detail payload |
| GET | `/api/images/:id/preview-url` | Transform preview |
| POST | `/api/images/:id/transform` | Commit derivative |
| POST | `/api/images/:id/share` | Team email / public link audit |
| POST | `/api/images/batch/delete` | Multi-delete |
| POST | `/api/images/batch/export` | Zip or JSON URL list |
| POST | `/api/images/batch/tags` | Multi-tag |
| POST | `/api/images/batch/migrate` | `{ target: "r2"\|"cf_images", ids: [] }` |
| GET | `/api/images/capabilities` | `{ cf_images: bool, r2: bool, drive: bool, account_hash?: string }` |

All writes: auth required; SELECT/UPDATE/DELETE bind `workspace_id` (and user where policy requires).

---

## 7. Multi-agent work split (parallel tracks)

| Agent | Focus | Entry files | Done when |
|-------|-------|-------------|-----------|
| **A — Perf** | Pagination 20 + thumbnail URLs | `ImagesPage`/`ImagesStoragePage`, `images.js` list defaults | Grid loads ≤20; LCP improved on `/dashboard/images/storage` |
| **B — Shell/UI** | Routes, shell, storage, detail, tags, share, batch bar | `App.tsx`, `dashboard/components/images/*` | All routes render; no modal-primary detail |
| **C — Transform** | Binding, allowlist module, edit page, derivatives migration | `cf-images-transform.js`, wrangler, edit API | Preview + derivative commit works on platform account |
| **D — Drive + Sourcing** | Drive persist bug, sourcing kit, import | oauth callbacks, sourcing page | Connect once → `drive_connected` true after reload (proof query) |
| **E — Keys + tenancy** | Capabilities endpoint, Keys page, Connor BYOK messaging | `cf-oauth-images.js`, Keys UI | Capabilities reflect per-workspace Images vs R2 |
| **F — Docs/QA (gatekeeper)** | This plan ↔ product README, CF doc compliance, E2E passes, **block ship if any §13 QC row is red** | `docs/products/images/README.md`, ticket e2e, §13 checklist | Every feature in §9 + every **Must verify** in §13 proven live; Tier 1+2 recorded |

**Merge order:** A → B shell/routes → E capabilities → D Drive → C transform/edit → **F QC gate (must pass)** → single `deploy:full`.

**Conflict hotspots:** `ImagesPage.tsx`, `src/api/images.js`, `App.tsx` — Agents B/C/D coordinate via thin route files; prefer new files over editing the monolith in parallel.

**Hard rule:** Agent F does **not** rubber-stamp. If any §13 “Must verify” item is missing, stubbed, or “works on my machine only,” F returns the owning agent’s lane to **in_progress** and **blocks** `deploy:full`.

---

## 8. Explicit non-goals (this sprint)

- Building sharp/libvips into the Worker
- Replacing GLB poster / gltf-transform Mac scripts
- Facebook / social share buttons (document hook only)
- Silent replace of originals as default edit save
- Giving customers platform CF Images quota without their own connection

---

## 9. Acceptance checklist (ship gate)

1. `/dashboard/images` redirects to storage; tabs Storage/Delivery/Keys/Sourcing Kit all resolve.
2. Storage shows **preview grid**, **20 per page**, multi-select export/delete/tag.
3. Click image → `/dashboard/images/:id` with breadcrumb, metadata, variant grid, Export/Edit/Share/Delete.
4. Tag +Add → autocomplete + Create tag "{name}"; persists D1 + CF meta for hosted images.
5. Edit page: change fit/width → live preview; Save → new library row with `parent_image_id` + `transform_json`.
6. Share: private / team (Resend) / copy public delivery URL.
7. Drive: one successful OAuth → survives reload; list shows Drive files when connected.
8. Capabilities: without CF Images connect, R2 still lists; transform endpoints return clear 403 with connect CTA.
9. Watermark path: `.draw()` used at least for platform branded export preset.
10. `npm run deploy:full` green; `pwa-build-meta.json` updated; ticket dual-pass recorded.

---

## 10. Proof queries / commands (Tier 2 style)

```sql
-- latest derivatives
SELECT id, parent_image_id, cloudflare_image_id, substr(transform_json,1,200), created_at
FROM images
WHERE parent_image_id IS NOT NULL
ORDER BY created_at DESC LIMIT 10;

-- drive token present for user
SELECT user_id, provider, account_email, expires_at, updated_at
FROM user_oauth_tokens
WHERE lower(provider) IN ('google_drive','google')
ORDER BY updated_at DESC LIMIT 5;

-- share audit
SELECT * FROM image_shares ORDER BY created_at_unix DESC LIMIT 10;
```

```bash
curl -s 'https://inneranimalmedia.com/api/images?page=1&per_page=20' -H 'cookie: …' | jq '.images|length'
curl -s 'https://inneranimalmedia.com/api/images/capabilities' -H 'cookie: …' | jq .
```

---

## 12. Open product hooks (documented, not coded this sprint)

- Companions / customer builds: Share modal `channel: "facebook"` (+ Instagram later).
- Custom delivery hostname `images.inneranimalmedia.com`.
- Signed expiring public links.
- Agent Sam natural-language batch from chat with attached `image_ids`.

---

## 13. Cloudflare documentation ownership + QC gate

Every implementing agent **reads their assigned docs before coding**. Agent **F** re-reads **all** of them at review time and marks each row Pass/Fail with a proof URL or command output. **Fail = no ship.**

Also required for everyone (shared baseline):  
[Features (params)](https://developers.cloudflare.com/images/optimization/features/) · [Pricing / unique transformations](https://developers.cloudflare.com/images/pricing/)

### 13.1 What is a `fetch()` response? (Agent C must internalize)

In Workers, `fetch(url)` returns a standard **`Response`** object. Its **`.body`** is a `ReadableStream` of bytes.

The [Images binding](https://developers.cloudflare.com/images/optimization/binding/) accepts those bytes via `env.IMAGES.input(stream)` — so a **`fetch()` response body** is one legal image source, alongside:

- Hosted Images: `env.IMAGES.hosted.image(id).bytes()`
- R2: `env.R2.get(key)` → `.body`
- Upload: `request.body` / `file.stream()`

**Do not confuse** with [transform via `fetch` + `cf.image`](https://developers.cloudflare.com/images/optimization/transformations/transform-via-workers/): that path optimizes a **URL** by passing `{ cf: { image: { … } } }` on a subrequest. Binding path = **bytes in, bytes out**. Fetch+`cf.image` path = **URL in, optimized Response out**. This sprint uses **both**: delivery URLs / variants for gallery; binding for edit commit + `.draw()`.

### 13.2 Doc → owner → implement → F must verify

| # | Doc | Primary owner | Write-up / implement | Agent F must verify (no half-bake) |
|---|-----|---------------|----------------------|-----------------------------------|
| 1 | [Introduction](https://developers.cloudflare.com/images/get-started/introduction/) | **E** (+ F skim) | Decide per-asset: **R2 origin + transform** vs **hosted Images**; Keys/Sourcing copy must match CF’s “when to use which” | Capabilities UI states R2-vs-hosted correctly; Connor cannot consume platform hosted quota |
| 2 | [Key concepts](https://developers.cloudflare.com/images/get-started/key-concepts/) | **C** + **B** | Vocabulary in UI/API: remote vs hosted, transformation vs variant, parameter vs option | Detail page labels match CF terms; no “variant” used for ephemeral edit ops |
| 3 | [Make responsive images](https://developers.cloudflare.com/images/optimization/make-responsive-images/) | **A** + **B** | Gallery + CMS helpers: `srcset` with explicit widths **and/or** `dpr`; prefer named variants (`thumbnail`/`small`) for Storage grid; Delivery tab documents breakpoints | Grid never loads 20× full `public` originals; `srcset` or variant sizes present on detail/hero paths |
| 4 | [Limits and formats](https://developers.cloudflare.com/images/get-started/limits/) | **C** | Enforce in `cf-images-transform.js` + upload: hosted **10 MB**, binding `.input()` **20 MB**, area/dimension limits; reject SVG “resize”; HEIC in → WebP/AVIF/JPEG out | Oversized upload returns clear error; transform rejects over-limit with message citing CF limit |
| 5 | [Draw overlays](https://developers.cloudflare.com/images/optimization/draw-overlays/) | **C** | Branded export preset via `.draw()` (logo corner and/or `repeat` watermark); opacity/position documented | At least one live Export path produces watermarked derivative; proof image URL |
| 6 | [Optimize with Workers (binding)](https://developers.cloudflare.com/images/optimization/binding/) | **C** | `images.binding = "IMAGES"` in wrangler; chain `.input` → `.transform` → `.draw?` → `.output({ format })`; enable Workers Cache + `Cache-Control` on preview responses (CF warns binding responses are **not** auto-cached) | Binding present in production wrangler; preview/transform endpoints work; cache headers set on binding responses |
| 7 | [Integrate with frameworks](https://developers.cloudflare.com/images/optimization/transformations/integrate-with-frameworks/) | **B** | We are **Vite/React**, not Next.js — do **not** copy Next loader blindly. Port the **idea**: one `cloudflareImageUrl(src, { width, quality })` helper for dashboard `<img>` | Shared helper used by Storage + Detail; no ad-hoc string concat of delivery URLs |
| 8 | [Transform via Workers (`cf.image`)](https://developers.cloudflare.com/images/optimization/transformations/transform-via-workers/) | **C** | Use for **R2/remote** thumbs when object is reachable by URL on our zone; guard **infinite loops** (`Via: image-resizing`); allowlist origins (no open SSRF) | R2 thumb path either CF hosted after import **or** guarded `cf.image` fetch; loop guard present |
| 9 | [Direct Creator Upload](https://developers.cloudflare.com/images/storage/upload-images/direct-creator-upload/) | **D** + **E** | Sourcing Kit / Upload: mint one-time `uploadURL` from Worker; browser POSTs file **without** exposing API token; webhook or poll draft→ready; write D1 on complete | Browser never sees `CLOUDFLARE_IMAGES_TOKEN`; upload completes into library row |
| 10 | [Images batch API](https://developers.cloudflare.com/images/storage/upload-images/images-batch/) | **C** + **Agent Sam lane** | Multi-select migrate/tag/delete at scale: obtain `batch_token`, call `batch.imagedelivery.net` (200 rps) so Agent Sam workflows do not hit global API rate limits | Batch migrate of ≥N images uses batch token path (log proof); documented for agentsam tools |
| 11 | [Upload via a Worker](https://developers.cloudflare.com/images/storage/upload-images/upload-file-worker/) | **C** | Derivative commit + AI-gen save: Worker fetches/holds bytes → FormData → Images API (or `hosted.upload` when available) | Transform commit and generate→library both upload from Worker with workspace creds |
| 12 | [Fullstack application (ref arch)](https://developers.cloudflare.com/reference-architecture/diagrams/serverless/fullstack-application/) | **F (inspection only)** | Do **not** rebuild platform. F reads once and lists **easy wins** we already have (Workers + R2 + D1 + Images + AI) vs gaps. Attach 3–5 bullets under §13.3 | §13.3 filled before ship; no speculative new services |

### 13.3 Agent F — ref-arch inspection notes (fill before ship)

_F writes 3–5 bullets here after reading the fullstack diagram. Example shape (replace with real findings):_

1. …
2. …
3. …

**Likely easy wins to confirm (F checks):** Images for media delivery already in stack; R2 for originals; D1 for library SSOT; Workers AI only where CF params (`segment`/`upscale`) insufficient; no need for separate image microservice.

### 13.4 Agent F — ship gate scorecard (copy into ticket)

Mark each **Pass** only with proof (URL, D1 id, or curl). Any **Fail** or **N/A-without-justification** blocks deploy.

| ID | Check | Owner lane | Pass? | Proof |
|----|-------|------------|-------|-------|
| QC-01 | Routes: storage/delivery/keys/sourcing-kit/:id/:id/edit | B | | |
| QC-02 | Pagination default 20; API clamp | A | | |
| QC-03 | Gallery uses thumbnail/small not full public | A/B | | |
| QC-04 | Detail: breadcrumb, metadata, variant grid, Export/Edit/Share/Delete | B | | |
| QC-05 | Tag autocomplete + Create tag | B | | |
| QC-06 | Dual-write tags D1 + CF `iam_tags` | C/B | | |
| QC-07 | `IMAGES` binding in production wrangler | C | | |
| QC-08 | Preview URL allowlisted ops | C | | |
| QC-09 | Transform commit → derivative row (`parent_image_id`, `transform_json`) | C | | |
| QC-10 | `.draw()` watermark export path | C | | |
| QC-11 | Limits enforced (10/20 MB, clear errors) | C | | |
| QC-12 | Direct Creator Upload (no token in browser) | D/E | | |
| QC-13 | Batch API used for multi-image CF ops | C | | |
| QC-14 | Drive OAuth persists after reload | D | | |
| QC-15 | Capabilities: R2 without Images; Images BYOK for customers | E | | |
| QC-16 | Share: private / team Resend / public link | B | | |
| QC-17 | Shared `cloudflareImageUrl` helper (framework port) | B | | |
| QC-18 | R2 `cf.image` path has Via-loop + origin allowlist **or** import-first policy | C | | |
| QC-19 | Binding preview responses set Cache-Control | C | | |
| QC-20 | §13.3 ref-arch notes completed | F | | |
| QC-21 | Dual-pass Tier 1 + Tier 2 recorded | F | | |
| QC-22 | `deploy:full` + `pwa-build-meta.json` | Ship | | |

**Ship phrase for F:** “QC scorecard 22/22 Pass with proofs attached” — anything less is not a release.

---

## 14. One-line summary

Rebuild `/dashboard/images` as a Cloudflare-style Images product (gallery + detail + Delivery/Keys/Sourcing routes), wire the paid CF Images binding for real edit/transform (including `.draw()` watermarks), fix Drive OAuth persistence, keep R2/Drive usable without borrowing platform Images, dual-write tags in D1+CF, store committed edits as D1 derivatives — shipped by parallel agents as **one** deploy only after **Agent F’s §13 QC scorecard is fully green**.

---

## 15. Three-lane accountability (Cursor · Claude · ChatGPT)

**No overlap rule:** each lane owns distinct paths. Do not “explore the whole DAM.” Read this file + your lane only. Discovery outside your files is out of scope.

| Lane | Agent | Owns |
|------|-------|------|
| **1** | **Cursor** | Shell/UI routes, gallery, detail, tags, share, pagination defaults, `cloudflareImageUrl` helper |
| **2** | **Claude** | CF Images binding, transform/edit, derivatives migration, `.draw()`, batch API, limits, wrangler `IMAGES` |
| **3** | **ChatGPT** | Drive OAuth persist fix, Sourcing Kit, Keys/capabilities/tenancy, Direct Creator Upload, Agent F–style QC scorecard fill |

Merge order: Lane 1 shell → Lane 3 capabilities/Drive → Lane 2 transform → Lane 3 QC green → Cursor `deploy:full`.
