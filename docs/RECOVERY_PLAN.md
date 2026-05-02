# Recovery plan — don’t lose today’s work

Minimal steps. Run from **repo root** unless noted.

---

## 1. Repo and env
- Repo: `march1st-inneranimalmedia` (or your actual clone path).
- Env: `export CLOUDFLARE_API_TOKEN='…'` (needs R2 + Workers deploy).

## 2. D1 (chats)
```bash
npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/112_agent_sessions_messages.sql
```
(Only if not already run; creates `agent_sessions`, `agent_messages`.)

## 3. Deploy static (R2) + worker
```bash
./agent-dashboard/deploy-to-r2.sh
npm run deploy
```
First builds agent dashboard and uploads JS/CSS + `agent.html` + `chats.html`. Second deploys the worker.

## 4. Seed Vectorize (first time / after wipe)
```bash
curl -X POST https://inneranimalmedia.com/api/agent/rag/insert \
  -H "Content-Type: application/json" \
  -d '{"items":[{"id":"bootstrap-2026-03-02","text":"Agent Sam: image upload and file drop in chat, chats in D1, Chats page, RAG and bootstrap API. Daily logs in R2 memory/daily/YYYY-MM-DD.md","metadata":{"source":"bootstrap","date":"2026-03-02"}}]}'
```

## 5. Daily log in R2 (optional)
- **Option A:** Run `./scripts/upload-daily-log-to-r2.sh` (uploads `docs/memory/daily/$(date +%Y-%m-%d).md` to R2). Or pass a date: `./scripts/upload-daily-log-to-r2.sh 2026-03-02`.
- **Option B:** Put today’s log at **R2 bucket `iam-platform`**, key **`memory/daily/YYYY-MM-DD.md`** (e.g. `2026-03-02.md`) via Cloudflare dashboard or Wrangler.
- Content: use `docs/memory/daily/2026-03-02.md` or write a short summary.
- Then GET `/api/agent/bootstrap` returns it for the agent.

## 6. If something breaks
- **Agent UI blank:** Hard refresh; check R2 has `static/dashboard/agent/agent-dashboard.js` and `agent.html` (deploy script).
- **Chats not saving:** Confirm migration 112 ran; check worker logs for D1 errors.
- **Images not sending:** Ensure request body has `images` array (frontend uses `imagesToSend`).
- **Vectorize empty:** Call POST `/api/agent/rag/insert` with at least one item; index is `inneranimal-knowledge` (768 dim, `@cf/baai/bge-base-en-v1.5`).

## 7. RAG usage
- **Insert:** `POST /api/agent/rag/insert` body `{ "items": [ { "id": "unique-id", "text": "chunk text", "metadata": {} } ] }`.
- **Query:** `POST /api/agent/rag/query` body `{ "query": "your question", "topK": 5 }`.
- **Bootstrap:** `GET /api/agent/bootstrap` → `daily_log`, `yesterday_log` from R2 `memory/daily/*.md`.

---

Keep this file and `docs/memory/daily/2026-03-02.md` in the repo so tomorrow you can rerun 2–5 and continue from a known state.
