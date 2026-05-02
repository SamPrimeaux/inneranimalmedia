# API / Secret rotation — kanban to-do

**Do these 1 by 1 when you’re 100% ready.** Terminal is set up; these are hygiene/security follow-ups.

---

## 1. TERMINAL_SECRET (rotate)

- **Why:** Value was pasted in chat; rotate so only you and the worker/server have the current secret.
- **Steps:**
  1. Generate new secret: `openssl rand -hex 32`
  2. Set in worker: `npx wrangler secret put TERMINAL_SECRET --config wrangler.production.toml` → paste the new value
  3. Restart the terminal server using the **same** new value:  
     `TERMINAL_SECRET=<new_value> PORT=3099 npm run terminal` (from repo root)
- [ ] Done

---

## 2. Cloudflare API token (rotate)

- **Why:** Token was used in chat/session for `wrangler secret put`; rotate so the old token can’t be reused.
- **Steps:**
  1. Cloudflare Dashboard → **My Profile** → **API Tokens**
  2. Revoke or delete the token you used for wrangler
  3. Create a new token with **Workers Scripts Edit** (and Account read if needed) for the same account
  4. Use the new token for future `wrangler` usage (e.g. `wrangler login` or `CLOUDFLARE_API_TOKEN=... wrangler ...`)
- [ ] Done

---

## 3. (Optional) Wrangler / OAuth session

- **Why:** If you used `wrangler login`, your OAuth session is tied to your Cloudflare account; no secret in repo. Rotating the API token (step 2) doesn’t invalidate `wrangler login`. Only do this if you want to force re-auth.
- **Steps:** Run `npx wrangler logout` then `npx wrangler login` to get a fresh session.
- [ ] Done (optional)

---

## 4. Other secrets (audit when ready)

- **Worker secrets:** TERMINAL_WS_URL is not sensitive (public hostname). TERMINAL_SECRET is in step 1. Any other `wrangler secret put` values — rotate if they were ever shared or committed.
- **Env files:** If `.env` or similar has API keys (e.g. CloudConvert, OpenAI, etc.), ensure they’re in `.gitignore` and rotate any that were ever exposed.
- **Cloudflare Tunnel token:** The tunnel install token (the long `eyJ...` from the dashboard) grants tunnel access. If it was shared, regenerate in Zero Trust → Tunnels → your tunnel → **Configure** / **Recreate token** and reinstall the service with the new token if needed.

---

## Quick reference

| Item              | Rotate when                    | Where to set new value                    |
|-------------------|---------------------------------|-------------------------------------------|
| TERMINAL_SECRET   | Exposed in chat                 | Worker secret + terminal server env        |
| Cloudflare API    | Shared in session               | Dashboard → API Tokens                     |
| Tunnel token      | If token was shared             | Zero Trust → Tunnels → Configure           |
| Other wrangler   | If secret was shared/committed | `wrangler secret put <NAME> --config wrangler.production.toml` |

---

*Terminal setup complete as of 2026-03-03. Use this list when you’re ready to rotate 1 by 1.*
