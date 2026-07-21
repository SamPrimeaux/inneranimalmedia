# CMS tool contract — Companions SSOT + IAM alignment

**Status:** proposal (2026-07-21)  
**Law:** if a table/column/layout exists and a renderer reads it, tools must require it. “Optional” is not a synonym for “agent may skip.”  
**Baseline:** Companions CPAS CMS (`companionscpas`) is the reliable runtime. IAM federated hub aspires to the **same verbs and publish semantics**, even when storage bindings differ.

---

## 1. Non-negotiables

1. **D1 is SSOT.** R2 HTML / KV `page:{route}` are build artifacts. Never patch R2 as the edit surface.
2. **Save ≠ live.** Every write tool returns `{ saved: true, published: false }` unless `publish: true` was explicit and succeeded.
3. **Identity triad is required** on every section op: `tenant_id` + `page_route` + `section_key` (Companions). IAM maps to `tenant_id`/`site_id` + page id/slug + `section_key`.
4. **Soft-delete vs hide are different verbs.** `is_visible=0` ≠ `deleted_at` set.
5. **Typed `config_json` is first-class.** When `layout=two_cards` (or type declares config cards), card fields are **required** in the tool schema — not “optional extras.”
6. **No lazy SELECTs.** Active queries always filter `(deleted_at IS NULL OR deleted_at='')`. Public assemble also requires `is_visible=1`.
7. **Publish always records a job** (`cms_publish_jobs` on Companions; IAM must grow the same receipt, not activity_log-only).

---

## 2. Shared toolset (verbs)

One catalog for agents — same names across Companions worker tools and IAM `agentsam_cms_*` (thin adapters).

| Tool | Purpose | Required input | Required output |
|------|---------|----------------|-----------------|
| `cms.site.resolve` | Resolve tenant/site + brand + routes | `host` **or** `tenant_id` **or** `project_id` | `tenant_id`, `site_slug`, `routes[]`, `brand` summary |
| `cms.page.get` | Load page + active sections | `tenant_id`, `page_route` | `page`, `sections[]` (active only), `blocks[]` |
| `cms.section.get` | One section + typed config | triad + `section_key` | section row + `parsed_config` + `edit_model` |
| `cms.section.save` | Upsert section (draft) | triad, `section_type`, `sort_order`, `is_visible`, `config_json` (object), content columns as required by type | `{ section_id, saved: true, published: false, edit_model }` |
| `cms.section.hide` | `is_visible=0` | triad | `{ saved: true, published: false }` |
| `cms.section.soft_delete` | set `deleted_at` + trash fragment | triad | `{ soft_deleted: true }` |
| `cms.section.restore` | clear `deleted_at`, bump `restore_count` | triad | `{ restored: true }` |
| `cms.block.save` | Content-block lane only | triad, `block_key`, `block_type` | `{ block_id, saved: true }` |
| `cms.cards.save` | **Config-card lane** (`two_cards` / campaign grids) | triad, `layout: "two_cards"`, `cards[]` (see §4) | `{ cards_count, saved: true, published: false }` |
| `cms.asset.upload` | Image → R2 + `cms_assets` | `tenant_id`, file/bytes, `alt_text` | `{ asset_id, public_url }` (full CDN URL required) |
| `cms.preview` | Assemble preview HTML from D1 | `tenant_id`, `page_route` | `{ preview_url or html_sha, include_hidden: bool }` |
| `cms.publish` | Sync fragments → bust KV → assemble → R2 + KV | `tenant_id`, `page_route`, `triggered_by` | `{ published: true, job_id, artifact_key, kv_key }` |
| `cms.verify_live` | Fetch public URL; assert strings/hashes | `url`, `expect[]` | `{ ok, mismatches[] }` |

**IAM mapping today → aspired**

| Aspired | Current IAM tool (approx) | Gap to close |
|---------|---------------------------|--------------|
| `cms.page.get` / `cms.section.*` | `agentsam_cms_read` / `agentsam_cms_write` | Force triad; typed `edit_model`; stop freeform HTML as default write |
| `cms.publish` | `agentsam_cms_publish` | Require `cms_publish_jobs` (or equivalent) receipt; fragment assemble as default for product sites |
| `cms.cards.save` | *(missing)* | Must not overload `section_data` blob without `layout`+`cards` schema |
| `cms.verify_live` | `agentsam_cms_verify_live` | Keep; make required after every `publish: true` |

Deprecate as **primary** edit path: `agentsam_cms_save_page_html` / whole-document R2 overwrite for product CMS sites. Allow only as escape hatch with `mode: "legacy_html"` and explicit approval.

---

## 3. Companions binding (stable)

| Concern | Binding |
|---------|---------|
| Worker | `companionscpas` · `companionsofcaddo.org` |
| D1 | `companionscpas` · tenant `tenant_companionscpas` |
| Tables | `cms_pages`, `cms_page_sections`, `cms_page_content_blocks`, `cms_assets`, `cms_publish_jobs`, `cms_brand_settings` |
| Publish | `cms_pipeline.publishRoute` → R2 fragments + `static/pages…/index.html` → KV `page:{route}` TTL 3600 |
| Editor | R2 `dashboard/js/view-cms.jsx` |
| Catalog | `cms_section_catalog.js` `D1_SECTION_TYPES` / `renderSectionByType` |

**Lanes (do not mix):**

| Lane | Storage | Used by |
|------|---------|---------|
| **Section columns** | `eyebrow`, `heading`, `subheading`, `body`, `image_url`, `cta_*` | hero, text_image, donate_payment_hero copy, section intro |
| **Config cards** | `config_json.layout=two_cards` + `config_json.cards[]` | home `campaigns`, donate `donate_campaign_grid` |
| **Content blocks** | `cms_page_content_blocks` | feature_cards, home_pillars, block grids |
| **Payment methods** | `config_json.payment_methods_json[]` (+ donation_settings sync) | `donate_payment_hero` |

Agents failing Companions almost always write the **wrong lane**.

---

## 4. Required schemas (no optional slip)

### 4.1 Every section (`cms.section.save`)

```json
{
  "tenant_id": "tenant_companionscpas",
  "page_route": "/donate",
  "section_key": "donate_grid",
  "section_type": "donate_campaign_grid",
  "sort_order": 40,
  "is_visible": 1,
  "config_json": {},
  "publish": false
}
```

All keys above **required**. Empty `config_json` only when type has no config lane.

### 4.2 Config cards (`cms.cards.save`) — Companions two_cards

```json
{
  "tenant_id": "…",
  "page_route": "/donate",
  "section_key": "donate_grid",
  "layout": "two_cards",
  "cards": [
    {
      "id": "puppy_pads",
      "eyebrow": "Urgent Need",
      "title": "Wishlist",
      "image": "https://assets.companionsofcaddo.org/…",
      "cta_label": "Shop Wishlist",
      "cta_href": "https://www.amazon.com/…",
      "cta_external": true
    }
  ],
  "publish": false
}
```

**Per card required:** `id` (or stable title key), `title`, `image` (absolute CDN URL), `cta_href`.  
`layout` **must** be `"two_cards"` or renderer ignores cards.  
**Forbidden:** writing card title into section `heading` and calling it done.

### 4.3 Payment hero

Required: section `heading`; `config_json.payment_methods_json[]` where each enabled method has resolvable `id` + (`url` | `url_field` | `component_id` | `action`).

### 4.4 Publish

```json
{
  "tenant_id": "…",
  "page_route": "/donate",
  "triggered_by": "agent|dashboard|script",
  "verify": {
    "expect_contains": ["Wishlist", "#wdg-home_wetdog_gallery"]
  }
}
```

`verify` recommended; if present, tool **fails** when live HTML mismatches (no silent success).

### 4.5 `edit_model` (tool output, required)

Every `cms.section.get` / `cms.section.save` returns:

```json
{
  "edit_model": {
    "lane": "config_cards|section_columns|content_blocks|payment_methods",
    "fields": ["title", "image", "cta_href"],
    "forbidden_writes": ["section.heading as card title"],
    "publish_required_for_live": true
  }
}
```

Agents must follow `edit_model.lane` — not invent fields.

---

## 5. IAM current vs aspired

| Topic | IAM today | Aspired (Companions-shaped) |
|-------|-----------|------------------------------|
| SSOT | `cms_pages` + `cms_page_sections.section_data` blob | Same triad; prefer columns + typed `config_json` over opaque blobs |
| Nested UI | `cms_section_components` | Keep **or** map ↔ `cms_page_content_blocks`; pick one SSOT per site profile |
| Publish | Full-page R2 draft→published; assemble pilot `/agentsam` only | Default **fragment assemble + job receipt** for product sites; KV/page cache where profile says so |
| Jobs | Mostly activity_log | `cms_publish_jobs` (or IAM twin) required |
| Soft-delete | Page archive; section visibility uneven | `deleted_at` + hide verbs everywhere |
| Hub | Federated: client content stays on client D1 | Tools take `hosting: "platform"|"client_worker"`; never write Companions rows into IAM D1 |
| Editor | `/dashboard/cms` + cms-editor iframe (unstable) | Typed inspector driven by `edit_model` / section catalog (Companions pattern) |

**IAM `api_profile` / bridge:** Companions remains client_worker. IAM tools call Companions APIs with session/bridge — they do **not** reimplement Companions SQL inside `inneranimalmedia-business`.

---

## 6. Agent anti-patterns (hard deny)

| Deny | Why |
|------|-----|
| `cms.section.save` without `tenant_id` | Wrong tenant / ghost rows |
| Patch section columns for `two_cards` card copy | Wrong lane |
| `cards` without `layout: "two_cards"` | Renderer no-op |
| Blocks table for config cards | Wrong lane |
| Claim “published” after save only | KV/R2 stale |
| SELECT sections without `deleted_at` filter | Ghost sections |
| Relative image URLs | Broken CDN |
| Hand-edit R2 HTML | Drift from D1 |
| Treat IAM empty `cms_pages` for client slugs as bug | Expected under federated hub |

---

## 7. Rollout

1. **Codify Companions** — add `cms.cards.save` + tighten `cms.section.save` validation in Companions (reject wrong-lane writes).  
2. **D1 `agentsam_tools`** — register shared tool schemas; handlers dispatch by `hosting` / project binding.  
3. **IAM** — implement `edit_model` on read; require publish job receipts; migrate product sites toward fragment publish.  
4. **E2E** — dual-pass: save → preview assert → publish → `cms.verify_live` (Companions donate grid as gold fixture).

---

## 8. Gold fixture (Companions)

`page_route=/donate`, `section_key=donate_grid`, `section_type=donate_campaign_grid`:

- Lane: `config_cards`
- Cards: Wishlist + Wet Dog Competition
- Vote CTA → homepage `#wdg-home_wetdog_gallery`
- Publish + verify_live contains `Wishlist` and `#wdg-home_wetdog_gallery`

Any agent/tool that “updates donate grid” without `cms.cards.save` (or equivalent `config_json.cards`) is **incorrect by contract**.
