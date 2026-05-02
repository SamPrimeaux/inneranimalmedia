# Cursor handoff: sandbox worker (`inneranimal-dashboard`) + R2 `agent-sam-sandbox-cicd`

Use this when fixing **sandbox-only** UI, bindings, or R2 layout for  
`https://inneranimal-dashboard.meauxbility.workers.dev/`.  
**Do not** use this to change production `inneranimalmedia` without a separate promote flow and Sam approval.

---

## Hard rules

1. **Sandbox config file:** `wrangler.jsonc` only (Worker name `inneranimal-dashboard`).  
   **Never** edit `wrangler.production.toml` for sandbox experiments unless Sam explicitly approves prod changes.

2. **OAuth:** Do not modify `handleGoogleOAuthCallback` / `handleGitHubOAuthCallback` in `worker.js` without line-by-line approval.

3. **Deploy:** Sandbox Worker deploy requires Sam to type **`deploy approved`** when an agent runs it. R2-only updates do **not** require a Worker redeploy if routes already read from `DASHBOARD` / `ASSETS`.

4. **D1:** Sandbox uses shared `inneranimalmedia-business`. Treat as production data for destructive operations.

---

## R2 bucket and bindings

| Binding    | Bucket (canonical today)        |
|-----------|----------------------------------|
| `DASHBOARD` | `agent-sam-sandbox-cicd`       |
| `ASSETS`    | `agent-sam-sandbox-cicd`       |

After `wrangler deploy -c wrangler.jsonc`, Cloudflare should show **both** on **`cicd`**. If **ASSETS** still points at **`agent-sam-sandbox-cicd`**, redeploy or align in the dashboard.

---

## URL to R2 key mapping (`worker.js`)

The Worker does **not** serve arbitrary bucket root keys for `/dashboard/*`. It resolves:

| Browser path | R2 object key (under `DASHBOARD`) |
|-------------|-----------------------------------|
| `/dashboard/overview` | `static/dashboard/overview.html` |
| `/dashboard/agent`    | `static/dashboard/agent.html` + `static/dashboard/agent/agent-dashboard.{js,css}` |
| `/dashboard/pages/foo.html` | `static/dashboard/pages/foo.html` |
| `/auth/signin` (and login/signup) | `static/auth-signin.html` or fallback `static/static_auth-signin.html` |
| `/` (homepage) | `ASSETS`: `index-v3.html` / `index-v2.html` / `index.html`, else `DASHBOARD` sign-in HTML |

**Important:** A file stored only at `static/index.html` does **not** automatically map to `/dashboard/agent`. Dashboard MPAs must live at **`static/dashboard/<segment>.html`**.

---

## One-shot upload (repo parity with prod key layout)

From repo root:

```bash
cd overview-dashboard && npm run build && cd ..
./scripts/upload-repo-to-r2-sandbox.sh
```

Optional: `SANDBOX_BUCKET=agent-sam-sandbox-cicd` (default).

This uploads:

- `dashboard/*.html` → `static/dashboard/*.html` (except `auth-signin.html`, which goes to `static/auth-signin.html`)
- `dashboard/pages/*.html` → `static/dashboard/pages/`
- `static/dashboard/**` (JS/CSS/html fragments)
- `agent-sam/static/**` (shell fragments, page mirrors, if present)
- `overview-dashboard/dist/*` → `static/dashboard/overview/` (+ `Finance.js` / chunks beside `static/dashboard/` where needed)
- `agent-dashboard/dist/*` → `static/dashboard/agent/`
- `worker.js` snapshot → `source/worker.js` (reference only)

Full sandbox pipeline (build agent app + upload + deploy Worker):

```bash
./scripts/deploy-sandbox.sh
```

---

## Verification

```bash
curl -sI "https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/overview" | head -3
curl -sI "https://inneranimal-dashboard.meauxbility.workers.dev/dashboard/agent" | head -3
npx wrangler deploy --dry-run -c wrangler.jsonc
```

---

## Related docs

- `docs/agent-sam-sandbox-cicd/README.md` — registry / prefix vocabulary  
- `docs/CURSOR_HANDOFF_SANDBOX_UI_TO_PRODUCTION.md` — deeper UI + promote notes (some lines still mention legacy `cicd`; prefer **this** file for current bucket name)  
- `docs/AITESTSUITE_IAM_STACK_INTEGRATION.md` — lab (`aitestsuite`) vs sandbox vs prod

---

*Last updated: 2026-04-01. Bucket: `agent-sam-sandbox-cicd`.*
