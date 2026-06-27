# CMS operator scripts

## Upload to R2 `cms` bucket

```bash
./scripts/upload-cms-bucket-assets.sh
```

Uploads `cms/templates/**` and `cms/instructions/**` to bucket `cms`.

## Frontend + worker deploy

```bash
npm run deploy:full
```

Includes Vite build (`cms-editor.js`), R2 sync dashboard, wrangler deploy, D1 migrations.

## Skill playbook ingest (single skill, revision-only)

```bash
npm run run:ingest_skill_playbooks:cms_edit
# dry-run:
npm run run:ingest_skill_playbooks:cms_edit:dry-run
```

Only `skill_iam_cms_edit` — skips re-embed when playbook content hash unchanged.

## Verify publish (Python)

```bash
python3 scripts/cms/verify_publish.py --url https://inneranimalmedia.com/agentsam
python3 scripts/cms/audit_pages.py --project inneranimalmedia
```

## Marketing templates (ASSETS bucket)

```bash
./scripts/upload-marketing-templates.sh
```

## Loading screen templates

```bash
./scripts/upload_loading_screens_templates.sh
```

## CMS Python pipeline deploy

```bash
./scripts/setup_cms_python_worker.sh
cd vendor/inneranimalmedia-cms/services/cms-pipeline-service && uv run pywrangler deploy
```

## D1 migrations

Applied automatically on `deploy:full` via `scripts/d1-apply-pending.mjs`.
