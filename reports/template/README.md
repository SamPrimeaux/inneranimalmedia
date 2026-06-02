# Quality report template

IAM-branded HTML quality reports (not Playwright-branded). Playwright writes `captures/<workspace>/results.json`; this template renders the public `index.html`.

## Layout

| Path | Role |
|------|------|
| `index.html` | Page shell with `{{PLACEHOLDER}}` tokens |
| `styles.css` | Brand styles (inlined in output) |
| `partials/test-row.html` | Per-test evidence row |
| `render.py` | Runner: reads results JSON → writes `captures/<workspace>/report/index.html` |

## Run

From repo root (after Playwright with JSON reporter):

```bash
python3 reports/template/render.py
```

Or via staging/upload:

```bash
npm run test:work-quality-report-upload
```

## Env (optional)

| Variable | Default |
|----------|---------|
| `IAM_WORKSPACE_SLUG` | `inneranimalmedia` |
| `IAM_BRAND_NAME` | `Inner Animal Media` |
| `IAM_HEADER_LOGO` / `IAM_FOOTER_LOGO` | IAM CDN logos |
| `IAM_CAPTURES_ROOT` | `captures/<workspace>` |
| `IAM_RESULTS_JSON` | `<captures>/results.json` |
| `IAM_REPORT_OUT_DIR` | `<captures>/report` |

R2 uploads use `reports/quality-report/YYYY-MM-DD/HHMMSS/` (see `scripts/upload-playwright-report-to-r2.sh`).

**Agent Sam skill (markdown on autorag, not in D1):** `npm run skills:quality-report:upload-r2` → `inneranimalmedia-autorag/skills/iam-playwright-quality-report/SKILL.md`. D1 row: `skill_iam_playwright_quality_report`.
