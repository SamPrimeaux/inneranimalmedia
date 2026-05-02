# How Bindings (and Durable Objects) Connect — Today’s Workflow

**Short answer:** You don’t run a separate “connect” command. Bindings are **connected by declaring them in `wrangler.toml` and using them in your worker**. Deploy the worker once; Cloudflare injects the bindings into `env` at runtime. For **Durable Objects**, the worker must also **export** the DO class and the config must declare the DO binding and migrations.

---

## 1. How bindings work (no extra “connect” step)

| Step | What you do |
|------|-------------|
| **Declare** | In `wrangler.toml`: define each binding (name + resource id/name). |
| **Use in code** | In `worker.js`: use `env.BINDING_NAME` (e.g. `env.ASSETS`, `env.DB`). |
| **Deploy** | Run `npx wrangler deploy`. Cloudflare attaches the resources to the worker. |

After deploy, every request gets the same `env` with those bindings. There is no separate “connect” CLI or Dashboard step for normal bindings; the connection is **deploy**.

---

## 2. What this repo’s wrangler already declares

Your `wrangler.production.toml` already defines:

| Binding | Type | Purpose |
|---------|------|---------|
| **ASSETS** | R2 | inneranimalmedia-assets (public homepage, etc.) |
| **CAD_ASSETS** | R2 | splineicons |
| **DASHBOARD** | R2 | agent-sam (login, dashboard pages) |
| **R2** | R2 | iam-platform |
| **DB** | D1 | inneranimalmedia-business |
| **KV** | KV | namespace id `09438d5e...` |
| **SESSION_CACHE** | KV | namespace id `dc87920b...` |
| **MY_QUEUE** | Queue | producer + consumer |
| **HYPERDRIVE** | Hyperdrive | config id `9108dd64...` |
| **VECTORIZE** | Vectorize | index inneranimal-knowledge |
| **WAE** | Analytics Engine | dataset inneranimalmedia |
| **AI** | Workers AI | — |

**Secrets** (API keys, OAuth secrets, etc.) are **not** in the toml; they’re set in Dashboard or with `wrangler secret put` and are already “connected” to the same worker by name.

So for **today’s workflow** (homepage from ASSETS, login/dashboard from DASHBOARD), the **R2 bindings are already declared**. They’re “connected” as soon as you deploy a worker that uses `env.ASSETS` and `env.DASHBOARD`.

---

## 3. Durable Objects (DO) — why deploy failed and how to “connect” them

The **live** inneranimalmedia worker was built from a script that **exports** a Durable Object class (e.g. `IAMCollaborationSession`). So:

- The **currently deployed** worker has:
  - A **script** that exports the DO class.
  - A **config** (from Dashboard or another wrangler.toml) that includes:
    - `[durable_objects.bindings]` — gives the DO a name and points it at the class.
    - `[migrations]` — assigns the DO class to a Durable Object namespace (so instances can be created).

- **This repo** has:
  - A minimal `worker.js` that **does not** export any DO class.
  - A `wrangler.production.toml` with **no** `[durable_objects.bindings]` or `[migrations]`.

So when we tried to deploy this repo’s worker, Cloudflare saw a **new** script that no longer exports `IAMCollaborationSession` and blocked the deploy to protect existing DO instances.

**To “connect” a Durable Object you need both:**

1. **In the worker:** export the class, e.g.  
   `export { IAMCollaborationSession }` (or `export class IAMCollaborationSession extends DurableObject { ... }`).
2. **In wrangler.toml:** declare the binding and migrations, e.g.  
   `[[durable_objects.bindings]]` with `name` and `class_name`, and `[[migrations]]` with `tag` and `new_classes`.

So for DO there **is** an extra requirement: the script and the config must **both** define the same DO; it’s not enough to only add something in the Dashboard.

---

## 4. Two ways to run today’s workflow

**Option A — Use the full worker (recommended)**  
Use the **same** codebase that already has:

- The DO class exported (e.g. `IAMCollaborationSession`).
- All API routes, OAuth, etc.

There you **only** add the R2 routing (homepage, `/auth/signin`, `/dashboard/*`) at the top of `fetch()`. No binding or DO “connection” changes needed; everything is already connected. Deploy from that project.

**Option B — Use only this repo**  
Then this repo’s worker must **also** export the same DO class and this repo’s wrangler must declare the DO binding and migrations. So you’d need to:

1. Get the **DO class source** (e.g. `IAMCollaborationSession`) from the other codebase.
2. Add it to this repo’s `worker.js` (or a module it imports) and **export** it.
3. Add to `wrangler.production.toml`:
   - `[[durable_objects.bindings]]` with the same binding name and `class_name` as the current worker.
   - `[[migrations]]` with the same `tag` / `new_classes` so you don’t create a new namespace (or add a migration if you do).

Then deploy from this repo. The “connection” for the DO is: **same class name in code + DO binding + migrations in toml**.

---

## 5. Checklist for “properly set today’s workflow”

- [ ] **R2 (ASSETS / DASHBOARD)** — Already in `wrangler.production.toml`; worker uses `env.ASSETS.get(...)` and `env.DASHBOARD.get(...)`. No extra connection step.
- [ ] **D1 (DB)** — Already in toml; use `env.DB.prepare(...)`. No extra step.
- [ ] **KV (SESSION_CACHE, etc.)** — Already in toml; use `env.SESSION_CACHE.get/put`. No extra step.
- [ ] **Secrets** — Set in Dashboard or `wrangler secret put`; no entry in toml. Already “connected” to the worker by name.
- [ ] **Durable Objects** — Either:
  - **A:** Keep using the full worker (with DO) and add our routing there → no DO changes, deploy that worker; or
  - **B:** Add the DO class to this repo’s worker and add `[durable_objects.bindings]` + `[migrations]` to this repo’s wrangler, then deploy from here.

So you don’t need to “connect” DO or other bindings in a separate step; you need to **either** deploy the full worker that already has the DO, **or** bring the DO (and its config) into this repo and deploy from here.
