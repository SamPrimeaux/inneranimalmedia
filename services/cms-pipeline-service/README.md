# IAM CMS Pipeline (Python Worker)

Agentic CMS prototyping service: HTML section extract/inject, D1 bootstrap, R2 reads, Workers AI section proposals.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [uv](https://docs.astral.sh/uv/) (`curl -LsSf https://astral.sh/uv/install.sh | sh`)
- Cloudflare account + `.env.cloudflare` at repo root (same as `inneranimalmedia` deploy)

## Quick setup

From repo root:

```bash
./scripts/setup_cms_python_worker.sh
```

Or manually:

```bash
cd services/cms-pipeline-service
uv sync
uv run pywrangler dev --port 8788
```

## Deploy

```bash
cd services/cms-pipeline-service
uv run pywrangler deploy
```

Add DNS (if not present): `cms-pipeline.inneranimalmedia.com` → CNAME → `inneranimalmedia.com` (proxied).

Copy `SESSION_CACHE` KV id from `wrangler.production.toml` into this service's `wrangler.jsonc` before deploy.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Liveness |
| POST | `/pipeline/extract-sections` | Parse `data-cms-section` slots + default D1 section stubs |
| POST | `/pipeline/inject` | Splice section HTML into shell |
| GET/POST | `/pipeline/bootstrap?project_slug=` | D1 pages + sections tree |
| POST | `/pipeline/r2-text` | Read R2 HTML by key |
| POST | `/agent/prototype` | Workers AI section proposal JSON |
| POST | `/pipeline/studio-bootstrap-html` | Inject `__CMS_BOOTSTRAP__` into shell HTML |

## Integration with JS CMS (inneranimalmedia)

```
┌─────────────────────┐     ┌──────────────────────────┐     ┌─────────────┐
│ Dashboard / Studio  │────▶│ inneranimalmedia Worker  │────▶│ D1 / R2 / KV│
│ (React + iframe)    │     │ /api/cms/*               │     └─────────────┘
└─────────────────────┘     └───────────┬──────────────┘
                                        │ service binding (optional)
                                        ▼
                            ┌──────────────────────────┐
                            │ iam-cms-pipeline (Python)│
                            │ BeautifulSoup + Workers AI│
                            └──────────────────────────┘
```

- **Authoring UI** stays JS (`cms-editor-core.js`, studio lane).
- **Heavy agentic HTML** (theme imports, bulk section refactors, AI prototypes) runs in Python via service binding or `POST /agent/prototype`.
- **Publish gates + live routes** remain JS (`cms-promotion-gates.js`, `index.js` hydration).

See [docs/cms/PYTHON_CMS_AGENTIC.md](../../docs/cms/PYTHON_CMS_AGENTIC.md) for the full architecture.

## Agent Sam

Point new tools at this worker (HTTP or service binding):

- `cms_pipeline_extract` → `/pipeline/extract-sections`
- `cms_pipeline_prototype` → `/agent/prototype`
- `cms_pipeline_bootstrap` → `/pipeline/bootstrap`

Existing `agentsam_cms_read|write|publish` in `src/tools/builtin/cms.js` continue to hit D1/R2 directly on the main Worker; Python complements them for HTML intelligence.
