# Production config (wrangler.production.toml) — OAuth checklist

This matches the production worker: **main = "worker.js"** (root), **DASHBOARD** → agent-sam, **SESSION_CACHE** → production-KV_SESSIONS.

## For `/api/oauth/google/start` and `/api/oauth/google/callback` to work

1. **GOOGLE_CLIENT_ID** — already in `[vars]` in your config.
2. **GOOGLE_OAUTH_CLIENT_SECRET** — must be set as an **encrypted secret** (not in `[vars]`):
   ```bash
   wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
   ```
   Paste the client secret from Google Cloud Console (same OAuth 2.0 Client ID as GOOGLE_CLIENT_ID).

3. **Worker code** — your root `worker.js` must implement:
   - `GET /api/oauth/google/start` (redirect to Google, store state in SESSION_CACHE).
   - `GET /api/oauth/google/callback` (exchange code, auth_users/auth_sessions, set `session` cookie, redirect to `/dashboard/overview`).
   - `GET /dashboard/agent` → serve `env.DASHBOARD.get('static/dashboard/agent.html')`.

The logic we added earlier lives in the **other** worker (the one with `main = "src/worker.js"` in the Cloudflare repo). If this production deploy uses a **different** root `worker.js`, that file needs the same OAuth and agent routes (or you need to point this wrangler at the same codebase that has them).

## Summary

| Item              | Status / action                                      |
|-------------------|------------------------------------------------------|
| DASHBOARD binding | Matches (agent-sam) — `/dashboard/agent` can be served |
| SESSION_CACHE     | Set (production-KV_SESSIONS) — OAuth state OK       |
| GOOGLE_CLIENT_ID  | In [vars]                                            |
| GOOGLE_OAUTH_CLIENT_SECRET | Set via `wrangler secret put`                 |
| Routes in worker.js | Ensure root worker.js has the OAuth + agent routes  |
