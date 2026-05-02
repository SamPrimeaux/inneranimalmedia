# Dev Tools Page — Product & Technical Spec

**Purpose:** Single source of truth for (1) shell/theme constraints, (2) wrangler bindings, and (3) a functional, reliable Dev Tools UI that exposes all tools/assets. Use this when designing or building the Dev Tools page so the shell stays intact and the page is 100% capable.

**Audience:** You, other agents, and any developer building the Dev Tools UI.

---

## 1. Shell / theme — DO NOT CHANGE

The dashboard **shell** is the same across all dashboard routes (overview, finance, tools, agent, etc.). When building or redesigning the Dev Tools page, **preserve** the following.

### 1.1 Layout

- **Left sidebar (dark blue):** Navigation with sections:
  - **Operations:** Finance, Billing, Clients
  - **Tools:** Agent, Chats, **Dev Tools** (current page)
  - **Projects:** Kanban, Time Tracking, CMS, Mail, Pipelines
  - **Settings:** User Settings, Onboarding
- **Main content area (white):** Title, search/command bar, and the **page-specific content**. Only this page-specific content is replaced for Dev Tools; the sidebar and top chrome stay the same.
- **URL:** `/dashboard/tools` (route served by Worker from R2: `static/dashboard/tools.html` or fragment injected into shell).

### 1.2 Theme logic

- Reuse the same CSS variables, fonts, and color scheme as the rest of the dashboard (e.g. dark blue nav, white content, green “online” indicators, red “offline”, orange “checking”/“on hold”).
- Keep existing “Run Primary Workspace,” “New Prompt,” and search bar behavior if they are part of the shell. Do not remove or relocate them unless the product owner explicitly asks.
- Tabs like “Workers 4,” “OpenAI,” “Anthropic” are part of the **Dev Tools content**, not the shell — they can be redesigned as long as the overall shell (sidebar + main layout) is unchanged.

**Rule for agents:** Treat the shell as a **wrapper**. Your job is to build the **inner content** of the Dev Tools page so it is functional and reliable. Do not modify the outer layout, sidebar markup, or global dashboard theme.

---

## 2. Wrangler & bindings — source of truth

All of the following are bound to the **inneranimalmedia** Worker. The Dev Tools UI should expose these in a clear, reliable way. This list is the single source of truth; keep it in sync with `wrangler.production.toml`.

### 2.1 R2 (4 buckets)

| Binding       | Bucket name             | Use in Dev Tools UI |
|---------------|-------------------------|----------------------|
| **ASSETS**    | inneranimalmedia-assets | List/read keys, preview, upload (homepage/public assets). |
| **DASHBOARD** | agent-sam               | List/read keys, preview, upload (dashboard HTML/JS/CSS, pages). |
| **CAD_ASSETS**| splineicons             | List/read keys, preview (icons/CAD). |
| **R2**       | iam-platform            | List/read/write keys, upload docs/mind maps/backups. |

Worker API: `env.ASSETS.get(key)`, `env.DASHBOARD.put(key, value)`, etc. Dev Tools should call **Worker APIs** (see section 4), not R2 directly.

### 2.2 D1 (database)

| Binding | Database name              | Use in Dev Tools UI |
|---------|----------------------------|----------------------|
| **DB**  | inneranimalmedia-business | Run read-only or read-write SQL (with safety), list tables, quick stats. “D1 Studio” style. |

Worker API: `env.DB.prepare("SELECT ...").all()`. Prefer **read-only** by default; warn before writes.

### 2.3 AI & API

| Binding | What it is        | Use in Dev Tools UI |
|---------|-------------------|----------------------|
| **AI**  | Workers AI        | Run inference (chat, embeddings, image). Optional “OpenAI” tab can proxy to Workers AI or use OPENAI_API_KEY. |
| **OPENAI_API_KEY** (secret) | OpenAI API key | Use for chat/completions/embeddings via Worker proxy. Do not expose key in UI. |

### 2.4 Browser rendering

| Binding      | What it is     | Use in Dev Tools UI |
|--------------|----------------|----------------------|
| **MYBROWSER**| Puppeteer (Cloudflare Browser Rendering) | **First-class:** Run headless browser: health check, open URL, screenshot, PDF, or metrics. UI: “Browser” or “Puppeteer” card with “Health,” “Screenshot,” “Metrics” actions. |

Existing Worker routes: `GET /api/browser/health`, `GET /api/browser/metrics?url=...`. Dev Tools should add links or buttons that call these and show results; optionally add new Worker routes for screenshot/PDF if needed.

### 2.5 Other bindings

| Binding         | What it is       | Use in Dev Tools UI |
|-----------------|------------------|----------------------|
| **HYPERDRIVE**  | DB connection acceleration | Status/config; optional “Hyperdrive” card. |
| **VECTORIZE**   | inneranimal-knowledge (vector index) | Query/embed; “Vectorize” card. |
| **KV**          | Key-value namespace | List/get/put keys; “KV” card. |
| **SESSION_CACHE** | KV (OAuth/sessions) | List/get (careful with PII); part of “KV” or “Auth” tooling. |
| **MY_QUEUE**    | Queue producer    | Send test message; “Queue” card. |
| **WAE**         | Analytics Engine (inneranimalmedia dataset) | Ingest events or view recent; “Analytics” card. |
| **IAM_COLLAB**  | Durable Object   | Status or “open session”; “DO” card. |
| **CHESS_SESSION** | Durable Object | Status or “open room”; “DO” card. |

---

## 3. Dev Tools page — functional goals

### 3.1 Principles

- **Efficient:** Minimal clicks to list, inspect, or run an action per tool.
- **Effective:** Each card/section does one main job (e.g. R2: list + get; D1: run query; Browser: health + screenshot).
- **Reliable:** Clear loading/error states, no silent failures. Show “binding not configured” when a binding is missing.

### 3.2 Must-have (MVP)

1. **R2:** At least one card or panel that lists keys for a chosen bucket (ASSETS, DASHBOARD, CAD_ASSETS, R2) and allows get/preview. Upload for at least R2 (iam-platform) and DASHBOARD.
2. **D1:** “D1 Studio” style: input SQL (read-only by default), run, show results in a table. Optional: table list + quick stats.
3. **Browser (MYBROWSER):** Card with “Health” (calls `/api/browser/health`) and “Metrics” (input URL, call `/api/browser/metrics?url=...`). Display JSON or summary. Optionally add “Screenshot” once a Worker route exists.
4. **Bindings checklist:** Simple “status” view: which bindings are configured (from `/api/health` or a new `/api/dev/bindings`). Green/red per binding so we know we’re on the same page.
5. **Shell preserved:** Same sidebar and theme as the rest of the dashboard; only the main content area is the new Dev Tools UI.

### 3.3 Nice-to-have

- **AI/OpenAI:** Tab or card to send a chat/completion (via Worker using OPENAI_API_KEY or AI binding).
- **KV:** List keys, get/put by key.
- **Queue:** Send one test message.
- **Vectorize:** Query or embed.
- **DO:** “Ping” IAM_COLLAB / CHESS_SESSION and show status.
- **Hyperdrive / WAE:** Config or “last events” view.

---

## 4. How the UI talks to the backend

- The Worker already serves the dashboard and APIs. The Dev Tools page is **front-end only** (HTML/JS loaded from R2).
- All actions (R2 list/get, D1 query, browser health, etc.) must go through **Worker routes** (fetch to same origin: `https://inneranimalmedia.com/api/...`). Do not embed API keys or Cloudflare credentials in the front end.
- Add new routes in `worker.js` as needed, e.g.:
  - `GET/POST /api/dev/r2/list`, `GET /api/dev/r2/get`, `PUT /api/dev/r2/put`
  - `POST /api/dev/d1/query` (read-only or with confirmation)
  - `GET /api/browser/health`, `GET /api/browser/metrics` (already exist); optional `POST /api/browser/screenshot`
  - `GET /api/dev/bindings` (returns `{ ASSETS: true, DASHBOARD: true, ... }` from env)
- Dev Tools JS: `fetch('/api/...')`, then render results in the UI. Use the same auth as the rest of the dashboard (session cookie).

---

## 5. Summary for the next agent

- **Keep:** Shell and theme (sidebar, nav, layout, CSS). Only replace the **content** of `/dashboard/tools`.
- **Reference:** This doc + `wrangler.production.toml` + `docs/COMPANY_MINDMAP_ARCHITECTURE.md` for bindings and architecture.
- **Build:** A functional Dev Tools content area that (1) shows binding status, (2) exposes R2, D1, and **Browser (MYBROWSER)** as first-class tools, (3) uses Worker APIs for every action, (4) is efficient, effective, and reliable.
- **Do not:** Change the shell/theme, expose secrets in the UI, or call Cloudflare/R2/OpenAI directly from the browser.

Once this spec is approved, the Dev Tools page can be implemented (or redesigned) against it so the app is 100% capable (UI-wise) to utilize all tools and assets.
