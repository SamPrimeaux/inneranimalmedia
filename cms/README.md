# CMS workers (host monolith)

**Product repo (subtree):** `vendor/inneranimalmedia-cms/`  
**Upstream:** https://github.com/SamPrimeaux/inneranimalmedia-cms

This monolith keeps a **thin host layer** only:

- `src/api/cms.js`, `src/core/cms-*.js` — auth, dispatch, promotion gates
- `CMS_PIPELINE` / `CMS_BUCKET` bindings in `wrangler.production.toml`
- Agent tools in D1 (`714_cms_pipeline_agent_tools.sql`)

## Subtree sync

```bash
# Pull latest product into monolith
git subtree pull --prefix=vendor/inneranimalmedia-cms \
  git@github.com:SamPrimeaux/inneranimalmedia-cms.git main --squash

# Push monolith vendor changes back to product repo (when you edit under vendor/)
git subtree push --prefix=vendor/inneranimalmedia-cms \
  git@github.com:SamPrimeaux/inneranimalmedia-cms.git main
```

Prefer editing CMS product files in **inneranimalmedia-cms** directly, then `subtree pull` here.

## Pipeline deploy

```bash
./scripts/setup_cms_python_worker.sh
cd vendor/inneranimalmedia-cms/services/cms-pipeline-service
uv run pywrangler deploy
```

## Shopify theme import

Dashboard → CMS → **Imports** → drop `.zip` / `.tar.gz`.  
API: `POST /api/cms/liquid-imports/upload` (multipart `file`).

Extracts Liquid sections to R2 + `cms_liquid_sections`. Map to pages via studio or Agent Sam.

## Legacy editor shell

- https://github.com/SamPrimeaux/agentsam-cms-editor
