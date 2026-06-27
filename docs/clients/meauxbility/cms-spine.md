---
title: Meauxbility — CMS workspace spine
doc_type: client_cms_architecture
workspace_id: ws_meauxbility
project_slug: meauxbility
updated_at: 2026-06-27
---

# Meauxbility CMS spine

First **BYO runtime** CMS experiment: nonprofit site on its own Worker/D1/R2, orchestrated from IAM.

## Two databases, one workspace

| Plane | Database | What lives here |
|-------|----------|-----------------|
| **Control** | `inneranimalmedia-business` | `agentsam_workspace` row `ws_meauxbility`, package imports (`cms_liquid_imports`), Python audit, gallery candidates |
| **Runtime** | `meauxbilityorg` (`011d1629-…`) | Live `cms_pages`, `cms_page_sections`, `cms_assets`, `cms_site_registry` |

Never apply IAM platform migrations to `meauxbilityorg`. Use `migrations/client-runtime/meauxbilityorg_001_cms_runtime.sql` only.

## Workspace binding (platform D1)

```json
"d1_databases": [{
  "binding": "DB",
  "database_name": "meauxbilityorg",
  "database_id": "011d1629-b5c8-49e7-8f6d-ca311ba936fe"
}]
```

| Column / field | Value |
|----------------|-------|
| `id` | `ws_meauxbility` |
| `worker_name` | `meauxbility` |
| `deploy_url` | `https://meauxbility.org` |
| `byok_r2_bucket` | `meauxbilityv2` |
| `metadata.cms.mode` | `byo_runtime` |
| `metadata.cms.proceed_defaults` | `db_target: workspace`, `r2_target: workspace` |

## Default Proceed (theme zip → live site)

When you drop a theme in IAM dashboard with workspace `ws_meauxbility` selected:

1. **Inventory** runs on platform (zip → manifest + Python audit)
2. **Proceed** writes to **meauxbilityorg** + **meauxbilityv2** (ASSETS_BUCKET, WNAM):

```json
{
  "db_target": "workspace",
  "r2_target": "workspace",
  "worker_target": "workspace",
  "project_slug": "meauxbility",
  "template": "index",
  "r2_bucket": "meauxbilityv2"
}
```

## R2 layout (runtime)

```
meauxbilityv2/
  cms/ws_meauxbility/meauxbility/home/published.html
  cms/ws_meauxbility/meauxbility/home/draft.html
  cms/ws_meauxbility/meauxbility/assets/...
```

S3 API: `https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/meauxbilityv2`

Platform package staging (until Proceed):

```
cms/liquid-imports/{import_id}/extracted/...
cms/liquid-imports/{import_id}/audit/report.json
```

## Apply scaffold

```bash
# 1. Platform spine (IAM registry)
cd ~/inneranimalmedia
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/715_meauxbility_cms_workspace_scaffold.sql

# 2. Runtime CMS tables (nonprofit D1)
./scripts/with-cloudflare-env.sh npx wrangler d1 execute meauxbilityorg \
  --remote -c wrangler.production.toml \
  --file=./migrations/client-runtime/meauxbilityorg_001_cms_runtime.sql
```

## Verify

```bash
# Platform spine
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command "SELECT id, deploy_url, byok_r2_bucket, json_extract(metadata_json,'$.d1_databases') FROM agentsam_workspace WHERE id='ws_meauxbility'"

# Runtime tables
./scripts/with-cloudflare-env.sh npx wrangler d1 execute meauxbilityorg \
  --remote -c wrangler.production.toml \
  --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'cms_%'"
```

## vs other clients

| | Meauxbility | Companions CPAS | Fuel N Free Time |
|---|-------------|-----------------|------------------|
| CMS mode | BYO runtime (experiment) | Client worker bridge | BYO D1 catalog |
| Package registry | Platform | Platform | Platform |
| Live content D1 | `meauxbilityorg` | `companionscpas` | `fuelnfreetime` |
| Assets R2 | `meauxbilityv2` | client bucket | BYO bucket |
| Deploy | Direct to `meauxbility` Worker | `companionscpas` + IAM bridge | `fuelnfreetime` Worker |

## Next steps

1. Drop theme zip in IAM CMS → inventory → review `proposed_scaffold`
2. Proceed with workspace targets
3. Wire `meauxbility` Worker to serve `cms_pages` routes from its D1 (if not already)
4. Harvest premium sections to platform gallery after refinement
