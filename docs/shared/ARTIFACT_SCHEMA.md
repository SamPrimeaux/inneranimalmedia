# Artifact schema (index)

**Status:** Canonical index · **Scope:** Cross-product durable outputs

This document indexes artifact types. Detailed schemas live in product and platform docs.

---

## Storage planes

| Plane | Typical use |
|-------|-------------|
| **D1** | Metadata, jobs, blueprints, CMS registry |
| **R2** | GLB, exports, static publish, large binaries |
| **CF Images** | Raster assets, thumbnails, `cms_assets.cloudflare_image_id` |
| **Supabase `agentsam`** | Vectors, agent run artifacts |

---

## Create family artifacts

| Type | Table / path | Product |
|------|--------------|---------|
| Blueprint | `designstudio_design_blueprints` | Design Studio |
| CAD job | `agentsam_cad_jobs` → R2 `cad/exports/` | Design Studio |
| Sketch | Draw API / Excalidraw JSON | Draw |
| 3D stock | `cms_assets` category `3d_studio` | Design Studio |
| Project files | `projects.metadata_json.project_files` | Sam Sketch / projects |

---

## CMS artifacts

| Type | Location |
|------|----------|
| Pages / sections | Client D1 or IAM D1 per `api_profile` |
| Published HTML | Client R2 |
| Hub registry | IAM D1 `cms_tenants`, `agentsam_project_context` |

See [../platform/cms-federated-hub-architecture.md](../platform/cms-federated-hub-architecture.md).

---

## Images / DAM

**Table:** `cms_assets` — canonical row for durable images across products.

Fields: `cloudflare_image_id`, `r2_key`, `public_url`, `category`, `tags`, `is_live`, `project_slug`.

---

## Movie Mode artifacts

| Type | Table / path |
|------|--------------|
| Project / timeline | `moviemode_*` D1 |
| Export bytes | `artifacts` R2 + ingest API |
| Media embeddings | Vectorize media lane |

---

## Agent artifacts

Chat outputs, tool traces, committed image drafts — `src/api/agent-artifacts.js`, `image-draft-store.js`.

---

## Related

- [AGENT_RUNTIME.md](./AGENT_RUNTIME.md)
- [../inneranimalmedia/product/designstudio/companion-tables.md](../inneranimalmedia/product/designstudio/companion-tables.md) (legacy path — technical detail)
