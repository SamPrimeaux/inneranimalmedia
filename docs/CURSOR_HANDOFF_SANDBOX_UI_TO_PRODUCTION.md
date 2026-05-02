# Cursor handoff: sandbox UI refinement and safe promotion to production

Copy everything below the line into a new Cursor chat when working on **inneranimal-dashboard** (Workers) + **agent-sam-sandbox-cicd** (R2), then promoting UI to **inneranimalmedia** + **agent-sam**.

---

## Context you must preserve

1. **Production Worker** (`inneranimalmedia`, `inneranimalmedia.com`) is the real product. **Never** change `handleGoogleOAuthCallback` or `handleGitHubOAuthCallback` in `worker.js` without explicit line-by-line owner approval. **Never** deploy production without Sam typing exactly: `deploy approved`.

2. **Sandbox Worker** (`inneranimal-dashboard`, `*.workers.dev`) is for **cosmetic / UI** iteration. It should use **sandbox R2** (`agent-sam-sandbox-cicd`) for `DASHBOARD` / `ASSETS` (or equivalent) so production bucket **agent-sam** is not overwritten by experiments.

3. **Production D1** (`inneranimalmedia-business`) is shared if the sandbox Worker binds it. Treat that as **production data**: prefer read-only or no-DB flows for pure UI; do not run destructive migrations or bulk deletes from sandbox unless Sam explicitly approves.

4. **R2 key layout** matches production so the same HTML paths work:
   - `/dashboard/<page>` → `static/dashboard/<page>.html`
   - Agent app: `static/dashboard/agent.html` + `static/dashboard/agent/agent-dashboard.js` (+ `.css`)
   - Overview app: `static/dashboard/overview.html` + **`static/dashboard/overview/overview-dashboard.js`** and any **Vite chunk** files in that folder (e.g. `overview-dashboard-PieChart.js`, `Finance.js`)

5. **Repo** `march1st-inneranimalmedia`: dashboard shells live under `dashboard/*.html`; Vite apps under `agent-dashboard/`, `overview-dashboard/`, etc.

6. **Agent first-load theme (2026-03-22):** `dashboard/agent.html` must load global tokens like **`overview.html`** does: **`styles_themes.css`** (pub R2 URL) + **`/static/dashboard/shell.css`** in `<head>`, and **`fetch('/api/settings/theme')` on every load** (not only when `localStorage` already has `dashboard-theme`). Without that, cold `/dashboard/agent` can render with **missing `--bg-canvas`** until you visit another dashboard page and return.

7. **Promotion scripts:**
   - **Sandbox:** `./scripts/upload-repo-to-r2-sandbox.sh`
   - **Production agent bundle (R2 only):** `PROMOTE_OK=1 ./scripts/promote-agent-dashboard-to-production.sh` — builds `agent-dashboard`, uploads `agent.html` + `agent-dashboard.js` + `.css` to **agent-sam**. Still requires **`deploy approved`** if `worker.js` changed.

8. **Roadmap (D1):** `roadmap_steps` rows **`step_agent_theme_initial_paint`** and **`step_sandbox_agent_promote_workflow`** on `plan_iam_dashboard_v1` (`order_index` 28–29). Re-run SQL: `scripts/d1-roadmap-sandbox-agent-workflow-20260322.sql`.

9. **Future Agent `/workflow` (multistep CICD):** Implement as a **recipe**, **`agent_commands`** slash entry, or **plan** that runs: (1) build, (2) sandbox upload, (3) human “ready for prod”, (4) `PROMOTE_OK=1` promote script, (5) optional Worker deploy after `deploy approved`. Do not auto-deploy production from an agent tool without that gate.

---

## Why `/dashboard/overview` can show “empty” main on sandbox

`dashboard/overview.html` mounts React via:

` <script type="module" src="/static/dashboard/overview/overview-dashboard.js"></script> `

If **`static/dashboard/overview/`** is missing in the sandbox bucket (no `overview-dashboard.js` or missing **dynamic import chunks**), the shell renders but the **charts / main UI do not**. `/dashboard/agent` can look fine because **`static/dashboard/agent/`** was uploaded.

**Fix:** From repo root, build and upload:

```bash
cd overview-dashboard && npm run build && cd ..
./scripts/upload-repo-to-r2-sandbox.sh
```

The script uploads `overview-dashboard/dist/*` → `static/dashboard/overview/` on **agent-sam-sandbox-cicd**. Re-deploy sandbox Worker only if Worker code changed (HTML/JS on R2 does not require Worker deploy).

---

## Recommended workflow: sandbox first, then production

### A. Day-to-day UI work (sandbox)

1. Edit **`dashboard/*.html`**, **`agent-dashboard/src/**`**, **`overview-dashboard/src/**`**, or CSS in dist targets as appropriate.
2. **Agent:** `cd agent-dashboard && npm run build` (or project’s canonical build command).
3. **Overview:** `cd overview-dashboard && npm run build`.
4. Push static assets to **sandbox** R2:

   ```bash
   ./scripts/upload-repo-to-r2-sandbox.sh
   ```

   Optional: `SANDBOX_BUCKET=agent-sam-sandbox-cicd` if you ever rename the bucket.

5. If **only** R2 objects changed, **no** Worker deploy is required for HTML/JS served from R2.
6. If **Worker routes / API / bindings** changed for the sandbox project, deploy **only** `inneranimal-dashboard` (or the sandbox wrangler project Sam uses). **Do not** deploy `inneranimalmedia` unless promoting.

### B. Promoting to production (after Sam is satisfied)

1. Confirm the same files are what you want on **agent-sam** (production). Use the **exact** upload commands from `.cursorrules` / `scripts/deploy-with-record.sh` patterns, e.g.:

   ```bash
   ./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/overview.html --file=dashboard/overview.html --content-type=text/html --remote -c wrangler.production.toml
   ```

   Repeat per changed file; **dashboard HTML served from R2 must be uploaded before** production Worker deploy if routing depends on fresh objects.

2. For **agent** bundle, only upload **`agent-dashboard.js` / `.css`** from **Vite `dist/`**, never hand-edited bundles (repo rule).

3. Production Worker: **`./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml`** only after Sam types **`deploy approved`**, and after listing every changed file and every R2 upload.

4. **Never** use bare `npx wrangler deploy` at repo root for production MCP or wrong config; follow `.cursorrules`.

---

## OAuth and “custom login” on sandbox

If the sandbox uses a **DB-driven email/password** path to avoid touching production Google/GitHub OAuth flows, keep that logic **only** on the sandbox Worker or behind feature flags. **Do not** merge sandbox-only auth shortcuts into production `worker.js` OAuth handlers without explicit review.

---

## Bulk sync (optional)

To mirror **entire** production bucket `agent-sam` into sandbox (not just repo-based files), use **`scripts/r2-clone-agent-sam-to-sandbox.sh`** with R2 **S3 API** keys (`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`). Wrangler alone cannot list/copy bucket-wide.

---

## Files to know

| Purpose | Path |
|--------|------|
| Sandbox upload (repo → sandbox R2) | `scripts/upload-repo-to-r2-sandbox.sh` |
| Prod → sandbox full bucket clone | `scripts/r2-clone-agent-sam-to-sandbox.sh` |
| Worker routing /dashboard → R2 | `worker.js` (production); sandbox may use trimmed copy |
| Overview shell | `dashboard/overview.html` |
| Overview React build | `overview-dashboard/dist/` → R2 `static/dashboard/overview/` |
| Agent React build | `agent-dashboard/dist/` → R2 `static/dashboard/agent/` |

---

## Checklist before telling Sam “ready for production”

- [ ] Tested on `https://inneranimal-dashboard.meauxbility.workers.dev` (or current sandbox URL).
- [ ] Overview main area loads (no missing `/static/dashboard/overview/*.js` in Network tab).
- [ ] Agent page still loads bundle and critical flows as expected.
- [ ] No unintended changes to production OAuth handlers or `wrangler.production.toml` bindings.
- [ ] List of every file to upload to **agent-sam** + confirmation **`deploy approved`** for Worker if needed.

---

_End of handoff block._
