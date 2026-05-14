# Maintenance scripts

One-off or **recovery** utilities that are **not** part of normal CI or `npm run deploy:full`. Keep them here so they stay discoverable without cluttering `scripts/`.

| Script | Purpose |
|--------|--------|
| [`fix_deploy_pipeline.py`](./fix_deploy_pipeline.py) | Historical repair: align `package.json` deploy targets, `deploy-full.sh` / `deploy-frontend.sh` notify path (`build-deploy-email-html.mjs`), and env-driven defaults in `post-deploy-memory-sync.sh`. **Current `main` is usually already patched.** Default is **dry-run**; use `--apply` only after reading the script and `git diff`. |

## Run from repo root

```bash
python3 scripts/maintenance/fix_deploy_pipeline.py
python3 scripts/maintenance/fix_deploy_pipeline.py --apply
```

## Docs

- Production checklist: `docs/DEPLOY-CHECKLIST.md` (references this folder).
- Deploy env / agent guide: `docs/DEPLOY_AND_AGENT_GUIDE.md`.
