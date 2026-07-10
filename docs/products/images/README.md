# Images (DAM)

**Classification:** `shared_capability`  
**Stage:** `incubating`  
**Route:** `/dashboard/images`  
**Manifest:** [`product-manifests/images.json`](../../product-manifests/images.json)

Shared **digital asset management** — not a standalone resale SKU today.

---

## Stack (verified)

| Layer | Path |
|-------|------|
| UI | `dashboard/components/ImagesPage.tsx` |
| API | `src/api/images.js` |
| D1 | `cms_assets` |
| CF Images | `cloudflare_image_id`, `imagedelivery.net` |
| Draft flow | `src/core/image-draft-store.js` |

Sources in UI: `all` | `r2` | `cf_images` | `drive`

---

## Workflow gap (not infrastructure)

The stack is correct. Missing:

1. Unified pickers in CMS, Create, Movie Mode
2. Category taxonomy enforcement (`cms`, `3d_studio`, `moviemode`, `project`, `brand`)
3. Optional client-side compression (`@squoosh/lib` WASM) before upload — nicety, not required (CF transform at serve time)

---

## Recommended organization

```
Upload (optional Squoosh) → CF Images ingest → cms_assets row
  → tagged, categorized, project_slug
  → consumed by CMS / Create / Movie Mode / projects
```

**Generate flow:** `POST /api/images/generate` → draft → `commit` when approved

---

## Related

- [../../shared/SHARED_CAPABILITIES.md](../../shared/SHARED_CAPABILITIES.md)
- [../../shared/ARTIFACT_SCHEMA.md](../../shared/ARTIFACT_SCHEMA.md)
