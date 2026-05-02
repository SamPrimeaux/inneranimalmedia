# Deploy, D1, safe agent keys & today’s priorities

**Date:** 2026-03-02

---

## 1. Sync Cloudflare env (match ~/.zshrc)

Run **once** from repo root so `.env.cloudflare` has the same values as your shell (no secrets typed or pasted in chat):

```bash
source ~/.zshrc && ./scripts/sync-cloudflare-env-from-zshrc.sh
```

Then all deploy/R2 commands (yours or an agent’s) can use:

```bash
./scripts/with-cloudflare-env.sh npx wrangler deploy --config wrangler.production.toml
./scripts/with-cloudflare-env.sh npx wrangler r2 object put ...
```

---

## 2. Safe agent keys (no keys in chat)

**Where keys live (already set up):**

- **Cloudflare Dashboard / Wrangler** — Worker secrets and env (e.g. `GOOGLE_OAUTH_CLIENT_SECRET`, API keys) are in the CF dashboard or `wrangler secret put`. The worker reads them at runtime; they are **never** in the repo or in chat.
- **Local only:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for wrangler CLI (deploy, R2) live in `~/.zshrc` or `.env.cloudflare` (gitignored). Agents **never** need to see or paste these.

**How agents work safely:**

- Agents run **commands** like `./scripts/with-cloudflare-env.sh npx wrangler r2 object put ...`. The script loads credentials from `.env.cloudflare` or `~/.zshrc`; the agent never receives or echoes the token.
- You **do not** paste tokens in Cursor chat. You run the sync script once so `.env.cloudflare` exists; after that, any agent can run the wrapper and deploy/upload without ever having the keys in context.
- For **agent_ai_sam** (your personal AI) and other tools that need to “read/write/edit/deploy”: they trigger the same wrapper from the repo (e.g. via a small “deploy” or “upload” action that runs `./scripts/with-cloudflare-env.sh ...`). Backend/worker secrets stay in CF; CLI token stays in `.env.cloudflare` / zshrc.

**Rule:** Never put `CLOUDFLARE_API_TOKEN` or any API key in a prompt, a rule file that gets committed, or a doc that gets committed. Use the wrapper + gitignored env only.

---

## 3. D1 deployment (migrations)

**Database:** `inneranimalmedia-business` (binding `DB` in wrangler.production.toml).

### Remote production: do **not** use `wrangler d1 migrations apply` (Option A — permanent)

Wrangler’s **`migrations apply`** replays the **entire** `migrations/` sequence in order against the remote ledger. On this database, **linear replay breaks early** (e.g. migration **107** touches **`cloudflare_deployments`**; that table no longer exists on remote). **That condition is effectively permanent** until someone manually repairs Wrangler’s migration ledger *and* reconciles every file in `migrations/` with live schema — high risk, rarely worth it.

**Operational rule:** For **remote** `inneranimalmedia-business`, **always ship schema with one-off files**, not `migrations apply`:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/<migration_sql_you_intend.sql>
```

Example:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/109_agent_footer_ai_spend.sql
```

**Inspect what Wrangler thinks is pending (informational only — do not rely on `apply` on remote):**

```bash
npx wrangler d1 migrations list inneranimalmedia-business -c wrangler.production.toml
```

More context: `docs/CICD_TABLES_AND_MIGRATIONS.md` (apply section), `docs/LIVE_DASHBOARD_API_SURFACE.md` (D1 notes).

Migrations live in `migrations/*.sql`. The DB has 500+ tables; many exist, some not yet populated (UI/backend to be fixed). D1 docs: [Cloudflare D1](https://developers.cloudflare.com/d1/).

---

## 4. Fresh deployment checklist (/dashboard/agent)

1. **Sync env (once):** `source ~/.zshrc && ./scripts/sync-cloudflare-env-from-zshrc.sh`
2. **Worker:** `./scripts/with-cloudflare-env.sh npx wrangler deploy --config wrangler.production.toml`
3. **R2 (full page):** `./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/agent.html --file=./dashboard/agent.html --content-type=text/html --remote -c wrangler.production.toml`
4. **R2 (fragment):** `./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/pages/agent.html --file=./dashboard/pages/agent.html --content-type=text/html --remote -c wrangler.production.toml`
5. **Verify:** `node scripts/debug-agent-page.mjs` then open https://inneranimalmedia.com/dashboard/agent?v=3 and test.

If R2 put returns 400, upload the same files via **Cloudflare Dashboard → R2 → agent-sam** at keys `static/dashboard/agent.html` and `static/dashboard/pages/agent.html`.

---

## 5. Rough time today (estimate)

From this session’s work: **~2–4 hours** of focused back-and-forth (agent page blank/stale, R2 uploads, cache, debug script, credential wrapper, zshrc fallback, sync script, docs). Your own testing and context-switching add more. Use this only as a ballpark for planning.

---

## 6. Today’s priorities & who does what

**Goal:** Reliably work inside the UI/UX — agent, chats, dev tools, MCP, Cloud, Images, Draw, Meet all functional.

**Top priorities (after a successful /dashboard/agent deploy):**

| Priority | What | Who can do it |
|----------|------|----------------|
| 1 | **Agent** — Confirm /dashboard/agent shows full UI (Monaco, workstation, footer chat); fix any remaining blank/stale. | You (test) + any agent (run debug script, R2 upload via wrapper). |
| 2 | **Chats** — In sync with one another; backend/API so conversations persist and sync. | Backend (worker/D1) + frontend (dashboard/chats). |
| 3 | **Dev Tools** — Reliable run/edit/deploy from the dashboard. | Agent or you (wire to existing APIs + R2/wrangler via wrapper). |
| 4 | **MCP** — MCP tools reachable and documented for agents. | Doc + small “MCP gateway” or use existing MeauxMCP if already in dashboard. |
| 5 | **Cloud** — R2/workers visibility and actions from dashboard. | Worker routes + dashboard/cloud UI. |
| 6 | **Images** — CF Images already set up; fix “failed to load” in dashboard. | Find the failing request (Network/Console), fix API or binding. |
| 7 | **Draw** — Draw UI/flow functional. | Frontend + any backend it needs. |
| 8 | **Meet** — Meet UI/flow functional. | Frontend + any backend it needs. |

**How you and agents can split work:**

- **You:** Test /dashboard/agent after deploy; report what’s broken (e.g. “Images says failed to load”, “Chats don’t sync”). Prioritize which of the 8 to do first.
- **Agent (Cursor or agent_ai_sam):** Implements fixes and features: run debug script, run wrapper for deploy/R2/D1, edit worker/dashboard code, add APIs, fix UI. Never asks for or stores tokens in chat; uses wrapper and docs.
- **Other agents / puppeteer:** If you add browser automation later, same rule: credentials only in env/wrangler; agents run scripts that use `.env.cloudflare` or equivalent.

**Efficiency tips:**

- Keep `docs/AGENT_PAGE_DEBUG_SUMMARY.md` and this doc open for the next agent so they know deploy steps, wrapper, and priorities.
- One agent can own “Agent + Chats + Dev Tools” (read/write/deploy flows); another “Cloud + Images + Draw + Meet” (APIs + UI). Or one agent does backend, another frontend, with clear handoff (e.g. “API is at /api/foo; dashboard calls it from bar.js”).

---

## 7. Reference

- **Agent page debug + R2 keys:** `docs/AGENT_PAGE_DEBUG_SUMMARY.md`
- **Worker config:** `wrangler.production.toml` (DASHBOARD = agent-sam, DB = inneranimalmedia-business)
- **Migrations:** `migrations/*.sql`
- **Credentials:** `.env.cloudflare` (gitignored), `scripts/with-cloudflare-env.sh`, `scripts/sync-cloudflare-env-from-zshrc.sh`
