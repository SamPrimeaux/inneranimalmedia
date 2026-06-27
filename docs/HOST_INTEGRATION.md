# Host platform integration

Deploy CMS as a **product module** on a host Worker (Inner Animal Media, white-label stack, or customer Cloudflare account).

## Architecture

```
┌──────────────────┐     ┌─────────────────────────┐     ┌─────────────┐
│ studio/ assets   │────▶│ Host Worker             │────▶│ D1 / KV     │
│ (this repo)      │     │ /api/cms/* + studio lane│     └─────────────┘
└──────────────────┘     └───────────┬─────────────┘
                                     │ CMS_PIPELINE
                                     ▼
                         ┌─────────────────────────┐     ┌─────────────┐
                         │ iam-cms-pipeline        │────▶│ R2 cms      │
                         │ (this repo, Python)     │     └─────────────┘
                         └─────────────────────────┘
```

## 1. Wrangler bindings (host)

```toml
# integration/host-wrangler.snippet.toml

[[r2_buckets]]
binding = "CMS_BUCKET"
bucket_name = "cms"

[[services]]
binding = "CMS_PIPELINE"
service = "iam-cms-pipeline"

[vars]
CMS_R2_PUBLIC_ORIGIN = "https://cms.yourdomain.com"
```

Routes (host):

- `studio.yourdomain.com/*` → studio shell
- `/studio/editor` path alias until DNS live

## 2. Static studio assets

From this repo, sync to host R2 (example Inner Animal Media):

```bash
BUCKET=cms   # or host ASSETS bucket with prefix
PREFIX=static/dashboard/app/cms

wrangler r2 object put "$BUCKET/$PREFIX/cms-editor-core.js" --file=studio/public/cms-editor-core.js
wrangler r2 object put "$BUCKET/$PREFIX/cms-studio-shell.html" --file=studio/public/cms-studio-shell.html
# vendor/*.js likewise
```

Dashboard React embed: copy `studio/dashboard/*` into host `src/dashboard/cms/` or consume as npm package (future).

## 3. API surface (host implements or licenses)

Minimum HTTP contract for studio + agents:

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/cms/pages` | CRUD pages |
| GET/PUT/DELETE | `/api/cms/sections/:id` | Section edit |
| POST | `/api/cms/sections/save-injected` | HTML injection persist |
| POST | `/api/cms/pages/:id/publish` | Promotion gates |
| GET | `/api/cms/pages/:id/preview-urls` | Draft/live URLs |

Reference implementation lives in host monolith `src/api/cms.js` — **do not copy into this repo**; bind via manifest instead.

## 4. Agent tools

Apply or adapt `integration/agent-tools.reference.sql` on host D1. Tools use `handler_type = agent'` + `tools/builtin/cms.js` on host.

## 5. Python pipeline

Deploy from this repo:

```bash
cd services/cms-pipeline-service
uv sync && uv run pywrangler deploy
```

Set `SESSION_CACHE` KV id and D1 database id in `wrangler.jsonc` for the target account.

## 6. Monolith slimming strategy

| Move to this repo | Keep on host |
|-------------------|--------------|
| Studio HTML/JS/CSS | Auth, `getAuthUser` |
| Section templates | Tenant isolation |
| Python pipeline | Production dispatch |
| Manifests + docs | OAuth, billing |

Host adds ~3 adapter files: pipeline proxy, R2 binding resolver, tool handler re-exports.

## Version pin

Host `package.json` or deploy manifest should pin:

```json
{
  "inneranimalmedia-cms": "git+ssh://git@github.com/SamPrimeaux/inneranimalmedia-cms.git#main"
}
```

Or submodule at `vendor/inneranimalmedia-cms`.
