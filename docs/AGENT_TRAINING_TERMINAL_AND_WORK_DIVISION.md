# Agent training, terminal capability, and work division

**Purpose:** Keep Agent Sam context-aware and up to date; add terminal/bash capability in the dashboard where safe; and divide work so ChatGPT/Claude can help efficiently.

---

## 1. Training the agent to be context-aware and up to date

### What you already have (R2 iam-platform + bootstrap)

- **R2 bucket `iam-platform`** (worker binding `R2`):
  - **`memory/daily/YYYY-MM-DD.md`** — daily logs (e.g. `2026-03-02.md`). Upload via `./scripts/upload-daily-log-to-r2.sh 2026-03-02` or manually to that key.
  - **`memory/schema-and-records.md`** — canonical tables, backfill workflow, API/metrics. Upload via `./scripts/upload-schema-memory-to-r2.sh`.
- **GET `/api/agent/bootstrap`** returns:
  - `daily_log` — today’s log from R2
  - `yesterday_log` — yesterday’s log
  - `schema_and_records_memory` — schema/records doc
- **Chat** already injects `schema-and-records.md` into the system prompt when present, so the agent has D1/schema/backfill context.

### Gaps and how to fix them

| Gap | Fix |
|-----|-----|
| Agent doesn’t see “platform summary” (dashboard, tools, APIs) | Add a short **platform summary** block to the system prompt in the worker (dashboard sections, main APIs, RAG, browser, D1, R2, deploy paths). See **docs/AGENT_TOOLS_DB_AUDIT_AND_PLAN.md** Phase 2. |
| Daily log only today/yesterday | Optional: extend bootstrap to list last N days from R2 `memory/daily/` and return the most recent 2–3 so the agent has “last few days” context. |
| No live RAG in chat | Before calling the LLM, call **POST `/api/agent/rag/query`** with the last user message; inject top 1–3 matches into the system prompt so the agent can cite docs. |
| RAG index empty or stale | Seed Vectorize via **POST `/api/agent/rag/insert`** with platform summary, daily log text, or key docs. Use a one-off script or a “Seed RAG” button in the Tools/Debug UI. |
| Wrangler / env not visible to agent | Add a **static “available tools”** section to the system prompt: list APIs (e.g. `/api/agent/playwright`, `/api/agent/rag/query`, `/api/agent/bootstrap`, `/api/finance/summary`, etc.) and that bindings include D1, R2, MYBROWSER, VECTORIZE, MY_QUEUE. So the agent can tell the user what exists and what to call. |

### Recommended order

1. **Upload daily logs and schema to R2** so bootstrap and chat have them (you’ve started this).
2. **Add platform summary + available tools** to the agent system prompt in `worker.js` (one short block).
3. **Optionally** add RAG query before LLM and inject top matches into the system prompt.
4. **Seed RAG** with platform summary + recent daily text so queries return useful snippets.

---

## 2. Terminal / bash capability in the clean GUI

**Goal:** Let the agent “do anything and everything,” including running terminal/bash, within the constraints of your stack (browser → Worker → no direct shell on the server).

### Options (from safest to most capable)

| Option | What it is | Pros | Cons |
|--------|------------|------|------|
| **A. CLI panel (current)** | In-dashboard “Agent Sam CLI” with fixed commands (`help`, `ls-agents`, `ls-models`, `ls-mcp`, `ls-tables`, `telemetry`, `boot`). | No server-side execution; safe; already built. | Not real bash; can’t run arbitrary commands. |
| **B. Extend CLI with “tool” commands** | Add more commands that call your APIs (e.g. `bootstrap`, `rag-query <text>`, `playwright <url>`, `sessions`). The “terminal” becomes a command-line to your backend. | Still no server shell; user sees a single place to trigger tools. | Not real bash; you maintain the command set. |
| **C. Backend “run script” API (sandboxed)** | New endpoint, e.g. POST `/api/agent/run` with `{ "script": "wrangler d1 execute ..." }`. Worker runs a **hardcoded allowlist** of commands (e.g. `npx wrangler d1 execute ... --file=...`) or interprets a tiny DSL (e.g. “d1-execute”, “rag-insert”). | Real execution on deploy runner or a dedicated sandbox; still no arbitrary shell. | Requires a secure runner (e.g. Cloudflare Workers + allowlist, or a separate job runner). Risk if allowlist is too broad. |
| **D. Real terminal in browser (PTY)** | Use something like **xterm.js** + a backend that spawns a real shell (e.g. Node server or a Worker that proxies to a PTY service). | Real bash/zsh. | Your current stack is Workers + static; no long-lived process. Would need a separate service (e.g. a small Node/Deno server or a third-party PTY API) and auth. |

### Practical recommendation

- **Short term:** Keep and **extend the CLI (Option B)** so it’s the “control plane” for your tools: add commands that map to `/api/agent/bootstrap`, `/api/agent/rag/query`, `/api/agent/playwright`, `/api/agent/sessions`, etc. Document in the agent system prompt: “The user can use the in-dashboard CLI to run: bootstrap, rag-query, playwright, sessions, telemetry, …” so the agent can direct the user to the CLI and tell them what to type.
- **Medium term:** If you need **real** script execution (e.g. “run this wrangler command”), add a **sandboxed run API (Option C)** with a strict allowlist (e.g. only `wrangler d1 execute` with specific args, or a small set of named operations). Expose it as a CLI command like `run d1-execute --file=migrations/116_...` so the agent can suggest it and the user can run it from the dashboard.
- **Real terminal (Option D)** is a larger project (separate service + auth); only pursue if you need full bash for power users and are willing to operate that service.

---

## 3. Dividing work: ChatGPT vs Claude vs you

Use each tool for what it’s best at and avoid duplicate work.

### You (human)

- **Decide** scope and priorities (e.g. “finish Tools/MCP/Cloud UI,” “repair Images/Draw,” “browser rendering UI”).
- **Approve** migrations and deploy steps (per your D1/schema rule).
- **Upload** daily logs and schema to R2 when you want the agent to have that context.
- **Test** in production (inneranimalmedia.com) and sanity-check agent answers.

### Cursor / Claude (this agent)

- **Code in your repo:** Worker routes, React (Agent dashboard, Chats, Finance, Overview), migrations, scripts.
- **Design and implement** UI (sticky header, preview close, session load from Chats, CLI extensions, tool-test panels).
- **Document** in `docs/` (this file, AGENT_TOOLS_DB_AUDIT_AND_PLAN.md, recovery plans).
- **Suggest** exact wrangler/D1 commands; you run them after approval.

### ChatGPT (or another LLM)

- **Content and copy:** Marketing text, onboarding copy, tooltips, error messages.
- **Structured plans:** “Break down the Tools page into 5 sections with acceptance criteria” — then you or Cursor implement.
- **Explanations:** “Explain OTLP traces in one paragraph” or “How does Vectorize upsert work?” to feed into docs or the platform summary.
- **Non-repo tasks:** Draft emails, social posts, or external docs that don’t touch the codebase.

### Division pattern that works

1. **You** set the goal (e.g. “All 9 tools pages live and useful”).
2. **Cursor/Claude** produces a short plan (e.g. in `docs/`) and implements code + migrations + deploy steps.
3. **You** approve migrations/deploys and test.
4. **ChatGPT** (optional) drafts user-facing text or high-level breakdowns; you paste into the repo or use as reference.
5. **Cursor** implements the next slice (e.g. “MCP page functional UI”) so there’s one source of truth (this repo) and no merge conflicts between two code-generating tools.

### What to avoid

- Don’t have **both** ChatGPT and Cursor edit the same files (merge hell).
- Don’t give ChatGPT your full worker or DB schema unless you’re only asking for prose or a plan; for code, keep implementation in Cursor so it stays consistent with your stack and rules.

---

## 4. Quick reference: keeping the agent “up to speed”

| Action | Where / how |
|--------|-------------|
| **Daily memory** | Upload `docs/memory/daily/YYYY-MM-DD.md` to R2 `iam-platform` at `memory/daily/YYYY-MM-DD.md` (e.g. `./scripts/upload-daily-log-to-r2.sh 2026-03-03`). |
| **Schema/records memory** | Upload to R2 `memory/schema-and-records.md` (e.g. `./scripts/upload-schema-memory-to-r2.sh`). |
| **Platform summary** | Add one block to the agent system prompt in `worker.js` (dashboard sections, main APIs, RAG, browser, D1, R2). |
| **Available tools** | Add a short list to the system prompt: GET/POST routes the agent can mention (bootstrap, rag, playwright, sessions, finance, overview, etc.). |
| **RAG** | Seed Vectorize via `/api/agent/rag/insert`; optionally run RAG query before each chat and inject top matches into the system prompt. |

Once this is in place, the agent can stay context-aware from R2 memory, bootstrap, and (optionally) RAG, and you can use ChatGPT for copy/planning while Cursor handles all code and deploys.
