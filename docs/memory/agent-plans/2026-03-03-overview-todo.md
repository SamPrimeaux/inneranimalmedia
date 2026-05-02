# Today’s agent to-do — Overview refactor (cost-aware, stepwise)

**Hand this to your new agent at the start of a fresh chat.**

---

## Primary goal for today

**Refactor the `/dashboard/overview` page only.** One page, one feature at a time. No massive overhauls. No searching the whole repo for local files — work **remote/production-ready** only: change what gets built and deployed, not exploratory local-only edits.

---

## Where the LIVE (--remote) platform lives

| What | Where it’s stored/served |
|------|--------------------------|
| **Worker (API + routing)** | Cloudflare Workers. Deploy: `npm run deploy` from repo root (uses `wrangler.production.toml`). Live: `https://inneranimalmedia.meauxbility.workers.dev` and `https://www.inneranimalmedia.com`. |
| **Dashboard HTML/static** | **R2 bucket `agent-sam`.** Dashboard pages (e.g. `overview.html`) are uploaded to R2; the worker serves them from that bucket. Upload with: `./agent-dashboard/deploy-to-r2.sh` (from repo root). |
| **Database** | **D1 `inneranimalmedia-business`** (remote). All production data; no local DB. |
| **Overview APIs** | Worker routes: GET `/api/overview/recent-activity`, GET `/api/overview/stats`, GET/POST `/api/overview/checkpoints`. Data comes from D1 (remote). |

**Production URLs:**  
- Overview: `https://www.inneranimalmedia.com/dashboard/overview`  
- Agent: `https://www.inneranimalmedia.com/dashboard/agent`  
- Chats: `https://www.inneranimalmedia.com/dashboard/chats`  

After any change to dashboard HTML or JS: run `./agent-dashboard/deploy-to-r2.sh` so the live site updates. After worker changes: `npm run deploy`.

---

## JSX for Overview — prepare, don’t build yet

A **new JSX app for the Overview page** will be delivered later. Your job today is to **prepare the shell** so that when that JSX is ready, it can be dropped in with no big refactor.

- **Do:** Ensure the overview page uses the **same shell** as the rest of the dashboard (topbar, sidenav, active state for “Overview”) so the shell is consistent.
- **Do:** Leave a **clear mount point** (e.g. a `div#overview-root` or similar) in `dashboard/overview.html` where the future Overview JSX bundle will mount, and document it (e.g. in this file or a one-line comment in the HTML).
- **Do not:** Build a full React/JSX overview app today. Await the new JSX; today = shell + mount point + any small layout/CSS improvements that don’t depend on that app.

---

## Strategic approach (cost-aware, minimal over-prompting)

**Where to put the new Overview JSX in R2 (efficient token spend):** Bucket `agent-sam`. Key prefix `static/dashboard/overview/`. Upload e.g. `static/dashboard/overview/overview-dashboard.js` and `overview-dashboard.css`. Served at `https://www.inneranimalmedia.com/static/dashboard/overview/overview-dashboard.js`. In overview.html use mount point `#overview-root` and `<script type="module" src="/static/dashboard/overview/overview-dashboard.js">`. Save your built JSX to that path so the shell only needs to reference it.

1. **One page, one step** — Only touch `/dashboard/overview` today. Don’t refactor other dashboard pages in the same session.
2. **Remote/production only** — Edit the files that are built and deployed (e.g. `dashboard/overview.html`), then run `./agent-dashboard/deploy-to-r2.sh`. Don’t spend time searching the whole repo or editing unused local-only files.
3. **Small, testable steps** — Each change: edit → deploy to R2 → verify on live URL. Avoid “one huge change then deploy once” so you can backtrack easily if something breaks.
4. **Reuse existing patterns** — Overview should match the shell/structure of `dashboard/chats.html` or `dashboard/agent.html` (same nav, same container classes). Copy patterns from those files rather than inventing new ones.
5. **Keep APIs as-is** — Overview already has `/api/overview/recent-activity` and `/api/overview/checkpoints`. Use them in the page; don’t add new backend routes unless the user explicitly asks.

---

## Today’s checklist (in order)

- [ ] **Step 1:** Read `dashboard/overview.html` and `dashboard/chats.html` (or `agent.html`) to align shell/structure.
- [ ] **Step 2:** Refactor overview layout/styling so it’s readable and consistent with the rest of the dashboard (keep Recent Activity; improve clarity).
- [ ] **Step 3:** Add a single, clearly named mount point in `overview.html` for the future Overview JSX and add a short comment or doc note.
- [ ] **Step 4:** Run `./agent-dashboard/deploy-to-r2.sh` and confirm `https://www.inneranimalmedia.com/dashboard/overview` looks correct.
- [ ] **Step 5:** (Optional) If the user wants checkpoints visible on the page, wire the existing GET `/api/overview/checkpoints` into the overview HTML (simple list or section). No new API.

---

## Out of scope today

- Other dashboard pages (Tools, MCP, Cloud, Images, Draw, etc.).
- New backend routes or D1 migrations.
- Building the Overview JSX app (only prepare the shell and mount point).
- Telemetry endpoints, browser rendering UI, or Meet/livestreaming.

**API/secret rotation to-do (do 1 by 1 when ready):** `docs/memory/API_SECRET_ROTATION_TODO.md`

Reference for broader context: `docs/memory/daily/2026-03-02.md` and `docs/memory/agent-plans/telemetry-endpoints.md` when you move on to other days.
