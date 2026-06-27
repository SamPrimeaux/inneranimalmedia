# CMS workers

**Product repo:** [inneranimalmedia-cms](https://github.com/SamPrimeaux/inneranimalmedia-cms) — studio, sections, Python pipeline, manifests, integration contracts.

This monolith keeps a **thin host layer** only:

- `src/api/cms.js`, `src/core/cms-*.js` — auth, dispatch, promotion gates
- `CMS_PIPELINE` / `CMS_BUCKET` bindings in `wrangler.production.toml`
- Agent tools registered in D1 (`714_cms_pipeline_agent_tools.sql`)

## Deploy pipeline (from product repo)

```bash
git clone git@github.com:SamPrimeaux/inneranimalmedia-cms.git
cd inneranimalmedia-cms/services/cms-pipeline-service
uv sync && uv run pywrangler deploy
```

Or use the copy vendored under `services/cms-pipeline-service/` until submodule/subtree is wired.

## Legacy editor shell

- **Git:** `git@github.com:SamPrimeaux/agentsam-cms-editor.git`
- **Live:** https://agentsam-cms-editor.meauxbility.workers.dev/
