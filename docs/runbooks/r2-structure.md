# R2 Bucket: inneranimalmedia — Structure Guide

**Bucket:** `inneranimalmedia`  
**Bindings:** `ASSETS` and `DASHBOARD` on the production worker (`wrangler.production.toml`)

Sizes and object counts change over time; use the Cloudflare dashboard or Wrangler for current totals.

## Folder conventions

| Prefix | Purpose | Typical writer |
|--------|---------|----------------|
| `static/dashboard/agent/` | Dashboard SPA chunks and hashed assets | `promote-to-prod.sh`, sandbox deploy scripts |
| `static/dashboard/agent.html` | Dashboard HTML shell | Same |
| `analytics/app-builds/` | Optional build metadata JSON | Deploy scripts |
| `analytics/runs/` | CI/CD run artifacts | Internal `/api/internal/cicd-event` and related jobs |
| `captures/` | Screenshots / automation output | Worker Playwright and browser tooling |
| `cms/ws_{workspace_id}/` | Per-workspace CMS-style payloads | Worker CMS handlers |
| `cad/creations/{tenant}/{workspace}/{run}/` | Design Studio exports | Design Studio pipeline |
| `docs/` | Mirror of repo `docs/` (optional) | `scripts/sync-docs-to-r2.sh` |
| `scripts/` | Mirror of repo `scripts/*.sh` (optional) | `scripts/sync-scripts-to-r2.sh` |
| `glb/` | Shared 3D assets | Manual or pipeline uploads |
| `media/` | User-facing uploads | Worker media routes |

## Naming rules

- Prefer workspace prefixes like `ws_{slug}` where the product expects them
- Artifact paths should include tenant / workspace / run identifiers when storing generated outputs
- Avoid spaces in object keys; use hyphens
- Date segments in keys: ISO `YYYY-MM-DD`

## Sync scripts to R2

After changing any tracked shell script:

```bash
chmod +x scripts/sync-scripts-to-r2.sh   # once
./scripts/sync-scripts-to-r2.sh
```

Single file (example):

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object put \
  inneranimalmedia/scripts/promote-to-prod.sh \
  --file scripts/promote-to-prod.sh \
  --content-type text/x-shellscript \
  --remote -c wrangler.production.toml
```

## Sync docs to R2

```bash
chmod +x scripts/sync-docs-to-r2.sh   # once
./scripts/sync-docs-to-r2.sh
```

Objects are written under `docs/<relative-path>` inside the bucket.
