# Inner Animal Media — Company Mind Map & Tech Architecture

**Purpose:** One-page mental picture of how our stack fits together. For humans and AI agents.  
**Once approved:** Save to R2 bucket `iam-platform` (e.g. `https://ede6590ac0d2fb7daf155b35653457b2.r2.cloudflarestorage.com/iam-platform`).

---

## 2D wireframe (tech drawing)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         INNERANIMALMEDIA.COM (Worker)                             │
│                              "inneranimalmedia"                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                    │
                    │  routes: inneranimalmedia.com, www, webhooks
                    ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              CLOUDFLARE EDGE                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │  R2: ASSETS │  │ R2: DASHBOARD│  │ R2: CAD_    │  │  R2: R2     │            │
│   │             │  │             │  │   ASSETS    │  │ (iam-platform)│            │
│   │ inneranimal-│  │ agent-sam   │  │ splineicons │  │              │            │
│   │ media-assets│  │ (dashboard  │  │ (icons/CAD) │  │ docs, mind   │            │
│   │ (homepage,  │  │  pages,     │  │             │  │ maps, assets │            │
│   │  public)    │  │  auth, UI)  │  │             │  │              │            │
│   └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬───────┘            │
│          │                │                │                │                     │
│          └────────────────┴────────────────┴────────────────┘                  │
│                                    │                                              │
│                                    ▼                                              │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │                    D1 DATABASE (DB) — "Massive DB"                       │  │
│   │                    inneranimalmedia-business                               │  │
│   │   auth_users | auth_sessions | finance_transactions | spend_ledger          │  │
│   │   workspaces | project_time_entries | agent_telemetry | cloudflare_...      │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                    │                                              │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │  AI / API TOOLS (all bound to the same Worker)                           │  │
│   ├────────────┬────────────┬────────────┬────────────┬────────────┬─────────┤  │
│   │ AI         │ MYBROWSER  │ HYPERDRIVE │ VECTORIZE  │ KV         │ SESSION_│  │
│   │ (Workers   │ (Puppeteer │ (DB accel) │ (vector    │ (general   │ CACHE   │  │
│   │  AI)       │ / Browser) │            │  search)   │  key-value)│ (OAuth) │  │
│   ├────────────┼────────────┼────────────┼────────────┼────────────┼─────────┤  │
│   │ MY_QUEUE   │ WAE        │ IAM_COLLAB │ CHESS_     │            │         │  │
│   │ (Queues)   │ (Analytics │ (Durable   │ SESSION    │            │         │  │
│   │            │  Engine)   │  Object)   │ (DO)       │            │         │  │
│   └────────────┴────────────┴────────────┴────────────┴────────────┴─────────┘  │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Simple English: what each piece does

### The 4 R2 buckets (storage)

| Binding    | Bucket name                | In plain English |
|-----------|----------------------------|-------------------|
| **ASSETS** | inneranimalmedia-assets    | Public website stuff: homepage, index, public JS/CSS. What visitors see first. |
| **DASHBOARD** | agent-sam              | Logged-in area: dashboard HTML, auth sign-in page, agent/draw pages, static dashboard files. |
| **CAD_ASSETS** | splineicons           | Icons and CAD-related assets (e.g. Spline). |
| **R2**    | iam-platform               | General platform storage you’re building: docs, mind maps, backups, internal assets. This mind map will live here once approved. |

**Rule of thumb:** Worker reads/writes these by key (e.g. `env.ASSETS.get('index.html')`, `env.DASHBOARD.get('static/dashboard/overview.html')`). No direct public URL unless you turn on public access for a bucket.

---

### The big database (D1)

| Binding | Database name              | In plain English |
|---------|----------------------------|-------------------|
| **DB**  | inneranimalmedia-business  | The main SQL database. Users, sessions, finance, time tracking, workspaces, agent telemetry, spend ledger, deployment records. One place for “who is who” and “what happened.” |

**In the Worker:** `env.DB.prepare("SELECT ...").first()` or `.all()`, and `env.DB.prepare("INSERT/UPDATE/DELETE ...").run()`. Hyperdrive (below) can make DB access faster.

---

### AI and API-style tools (bindings)

| Binding        | What it is        | In plain English |
|----------------|--------------------|-------------------|
| **AI**         | Workers AI         | Cloudflare’s AI APIs (models, inference). Use for chat, embeddings, etc. |
| **MYBROWSER**  | Browser (Puppeteer)| Headless browser at the edge. Use for screenshots, PDFs, or scraping from the Worker. |
| **HYPERDRIVE** | Hyperdrive        | Speeds up and pools connections to your database (fewer cold connections). |
| **VECTORIZE**  | Vectorize         | Vector index `inneranimal-knowledge`. For semantic search / RAG over your content. |
| **KV**         | KV namespace       | Simple key–value store. Good for config, feature flags, or cache. |
| **SESSION_CACHE** | KV namespace    | Sessions and OAuth state (e.g. `oauth_state_xyz`). Short-lived. |
| **MY_QUEUE**   | Queue              | Async job queue. Worker can push messages and a consumer can process them. |
| **WAE**        | Analytics Engine   | Dataset `inneranimalmedia`. Send events/metrics for dashboards and analysis. |
| **IAM_COLLAB** | Durable Object     | Real-time collaboration session object. |
| **CHESS_SESSION** | Durable Object  | Chess room object (multiplayer state). |

**In the Worker:** Each is `env.BINDING_NAME` (e.g. `env.AI`, `env.MYBROWSER`, `env.VECTORIZE`). Use them from your request handlers and cron.

---

## Flow in one sentence

**Traffic** hits the Worker at inneranimalmedia.com → Worker uses the **4 R2 buckets** to serve pages and assets, the **DB** for auth and business data, and **AI/API tools** (AI, MYBROWSER, Hyperdrive, Vectorize, KV, Queue, Analytics, Durable Objects) when it needs to run logic, store state, or talk to external systems.

---

## For agents (quick reference)

- **R2 keys:** ASSETS, DASHBOARD, CAD_ASSETS, R2 (iam-platform). Use `env.R2.get(key)` / `env.R2.put(key, value)` for iam-platform.
- **DB:** One D1 database, binding `DB`. SQL via `env.DB.prepare(...)`.
- **AI/API:** AI, MYBROWSER, HYPERDRIVE, VECTORIZE, KV, SESSION_CACHE, MY_QUEUE, WAE, IAM_COLLAB, CHESS_SESSION — all on `env`.
- **Save this file to iam-platform:** Upload this markdown (e.g. as `COMPANY_MINDMAP_ARCHITECTURE.md`) to the `iam-platform` R2 bucket once the team approves it.

---

*Doc version: 1.0. Approve and then store in iam-platform R2.*
