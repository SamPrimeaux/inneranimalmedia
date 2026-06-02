---
name: iam-playwright-quality-report
description: Run Playwright for IAM, render branded quality-report HTML (not Playwright branding), upload to R2, and share a temporary public URL at inneranimalmedia.com/qualityreport/{date}/{time}/.
---

# IAM Playwright quality report

Use this skill when the user asks for Playwright QA, quality reports, `/work` checks, or uploading test evidence.

**Canonical copy:** `inneranimalmedia-autorag/skills/iam-playwright-quality-report/SKILL.md` (loaded via D1 `skill_iam_playwright_quality_report`, `retrieval_strategy=r2`).  
**D1** stores the registry row only — not the full markdown body.

## Principles

- **Branded output:** `reports/template/` — Inner Animal Media logos and layout. Never ship raw Playwright HTML as the primary link.
- **Report R2:** `inneranimalmedia/reports/quality-report/YYYY-MM-DD/HHMMSS/` (screenshots under `…/screenshots/`, evidence JSON with bucket-relative `screenshotPath`).
- **Template R2:** `inneranimalmedia/reports/template/` (`npm run reports:template:upload-r2`).
- **Public URL:** `https://inneranimalmedia.com/qualityreport/YYYY-MM-DD/HHMMSS/`
- **Customer data:** Do not persist customer Playwright reports by default unless they opt into their own storage.

## Commands (repo root)

```bash
# Upload this skill to autorag (after editing SKILL.md)
npm run skills:quality-report:upload-r2

# Single page (/work) — test, stage, upload report, register URL
npm run test:work-quality-report-upload

# Render only (needs captures/<workspace>/results.json)
npm run quality-report:render
```

## Pipeline

1. Playwright with JSON reporter → `captures/<workspace>/results.json`
2. `python3 reports/template/render.py` → branded `captures/<workspace>/report/index.html`
3. `QUALITY_REPORT_SCOPE=work ./scripts/stage-quality-report-for-upload.sh` when scoped
4. `./scripts/upload-playwright-report-to-r2.sh` → report bucket + D1 `agentsam_quality_reports`
5. Return `public_url` to the user

## D1 tables

| Table | Purpose |
|-------|---------|
| `agentsam_skill` | Registry: `skill_iam_playwright_quality_report` → R2 skill path |
| `agentsam_quality_reports` | Per-run index: `public_url`, `r2_prefix`, date/time |

## Agent Sam

When a Playwright quality run finishes:

1. Return the branded `public_url` (from register API or `agentsam_quality_reports`).
2. Do not link Playwright default report branding as the primary deliverable.
3. Optional: `diagnostics/index.html` under the same run folder for advanced traces.
