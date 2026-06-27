# CMS workers

## In-monorepo (recommended)

**`services/cms-pipeline-service/`** — Python Worker (`iam-cms-pipeline`) for agentic HTML/D1/R2 prototyping.

- Setup: `./scripts/setup_cms_python_worker.sh`
- Docs: [docs/cms/PYTHON_CMS_AGENTIC.md](../docs/cms/PYTHON_CMS_AGENTIC.md)
- Deploy: `cd services/cms-pipeline-service && uv run pywrangler deploy`

## Separate repo (legacy editor shell)

The **agentsam-cms-editor** Worker is not vendored in this monorepo. Clone and deploy from its own repository:

- **Git:** `git@github.com:SamPrimeaux/agentsam-cms-editor.git`
- **Live:** https://agentsam-cms-editor.meauxbility.workers.dev/
- **Deploy:** `pywrangler deploy` / repo `README.md` (not `npm run deploy:full` on inneranimalmedia)

A local checkout may exist at `cms/agentsam-cms-editor/` for convenience; it is gitignored here and tracks `origin/main` independently.
