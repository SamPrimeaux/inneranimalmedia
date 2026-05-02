# Audit: Public Page Routing, R2 APIs, and Auth on Public Pages

**Date:** 2026-03-18  
**Scope:** worker.js — current state only. No fixes suggested.

---

## Part 1: Public Page Routing

### 1.1 How worker.js routes requests to inneranimalmedia.com/

Request handling order (relevant parts):

1. `path = url.pathname.replace(/\/$/, '') || '/'` and `pathLower = path.toLowerCase()`.
2. API routes are checked first (e.g. `/api/health`, `/api/r2/*`, `/api/agent/*`, etc.).
3. **Public (ASSETS)** block runs only for non-API GETs that fall through (see section 1.2).
4. **Static assets** use `assetKey = path.slice(1)` — literal path-to-R2-key (see 1.4).
5. If no object is found, `notFound(path)` returns JSON `{"error":"Not found","path":"/..."}` with status 404.

There is no global auth check before serving ASSETS or static assets; those responses are not gated by session.

### 1.2 Logic for serving files from ASSETS binding (inneranimalmedia-assets R2)

- **ASSETS** is the R2 binding for bucket **inneranimalmedia-assets** (see `getR2Binding` map in worker.js).
- In the public block, ASSETS is used in two places:

**A) Explicit root/index:**

```998:1002:worker.js
      // ----- Public (ASSETS) -----
      if (path === '/' || path === '/index.html') {
        const obj = await env.ASSETS.get('index-v3.html') ?? await env.ASSETS.get('index-v2.html') ?? await env.ASSETS.get('index.html');
        if (obj) return respondWithR2Object(obj, 'text/html');
        return notFound(path);
```

**B) Static assets (path used as key):**

```1035:1039:worker.js
      // Static assets: try ASSETS then DASHBOARD by path (key = path without leading slash)
      const assetKey = path.slice(1) || 'index.html';
      let obj = await env.ASSETS.get(assetKey);
      if (!obj && env.DASHBOARD) obj = await env.DASHBOARD.get(assetKey);
```

So for ASSETS: the worker uses **only** the path with the leading slash removed as the R2 key. There is no rewrite map (e.g. `/work` → `process.html`).

### 1.3 Why /work returns {"error":"Not found","path":"/work"}

- There is **no** route that maps `/work` to `process.html`.
- The only special-case for HTML is `/` and `/index.html` → `index-v3.html` (or v2/index).
- For `/work`, the code falls through to the static-asset block and does:
  - `assetKey = 'work'` (path.slice(1)).
  - `env.ASSETS.get('work')` — i.e. it looks for an R2 object with key **`work`**, not `process.html`.
- If the bucket has `process.html` but not `work`, the lookup fails and the worker returns:

```1139:1143:worker.js
function notFound(path) {
  return new Response(JSON.stringify({ error: 'Not found', path }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

So `/work` returns 404 with body `{"error":"Not found","path":"/work"}` because the routing is **path = key** and no object exists at key `work`.

### 1.4 Current mapping between URL paths and R2 file keys

| URL path        | R2 key(s) tried (ASSETS, then DASHBOARD) | Note |
|-----------------|------------------------------------------|------|
| `/`             | `index-v3.html` → `index-v2.html` → `index.html` | Explicit in code |
| `/index.html`   | Same as above                            | Same block |
| `/work`         | `work`                                   | No `.html`; no alias to process.html |
| `/about`        | `about`                                  | No `.html` |
| `/services`     | `services`                               | No `.html` |
| `/contact`      | `contact`                                | No `.html` |
| `/process.html` | `process.html`                           | Would work if key exists in ASSETS |
| `/about.html`   | `about.html`                             | Would work if key exists |
| Any other path  | `path.slice(1)`                          | Literal key only |

So for pretty URLs like `/work`, `/about`, `/services`, `/contact` to serve HTML, you would need either:

- R2 keys literally named `work`, `about`, `services`, `contact` (no extension), or  
- New worker logic that maps those paths to specific keys (e.g. `/work` → `process.html`).

---

## Part 2: Exact code for key paths and fallback

### 2.1 Root: / → index-v3.html

```998:1002:worker.js
      // ----- Public (ASSETS) -----
      if (path === '/' || path === '/index.html') {
        const obj = await env.ASSETS.get('index-v3.html') ?? await env.ASSETS.get('index-v2.html') ?? await env.ASSETS.get('index.html');
        if (obj) return respondWithR2Object(obj, 'text/html');
        return notFound(path);
```

### 2.2 /work, /about, /services, /contact

There is **no** dedicated block for `/work`, `/about`, `/services`, or `/contact`. They are handled only by the static-asset block:

```1035:1061:worker.js
      // Static assets: try ASSETS then DASHBOARD by path (key = path without leading slash)
      const assetKey = path.slice(1) || 'index.html';
      let obj = await env.ASSETS.get(assetKey);
      if (!obj && env.DASHBOARD) obj = await env.DASHBOARD.get(assetKey);
      // ... GLB viewer and dashboard static fallbacks ...
      if (obj) {
        const noCache = pathLower.startsWith('/static/dashboard/agent/') || pathLower.startsWith('/dashboard/') || url.searchParams.has('v');
        return respondWithR2Object(obj, contentType(assetKey), noCache ? { noCache: true } : {});
      }

      return notFound(path);
```

So:

- `/work` → `ASSETS.get('work')` (and optionally DASHBOARD.get('work')).
- `/about` → `ASSETS.get('about')`, etc.
- There is no mapping from `/work` to `process.html` or `/services` to `pricing.html`.

### 2.3 Fallback and 404

- If no handler returns a response, the request eventually hits the static-asset block. If `obj` is null after ASSETS and DASHBOARD lookups (and the dashboard-specific fallbacks), the worker calls `notFound(path)`.
- **404 handler** — the only generic “not found” is:

```1139:1143:worker.js
function notFound(path) {
  return new Response(JSON.stringify({ error: 'Not found', path }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

All 404s from this path return **JSON** with `error` and `path`. There is no HTML 404 page or redirect to a custom error page in the worker.

---

## Part 3: Agent Sam R2 capabilities and API routes

### 3.1 R2 binding used for inneranimalmedia-assets

```2413:2421:worker.js
function getR2Binding(env, bucketName) {
  const map = {
    'inneranimalmedia-assets': env.ASSETS,
    'splineicons': env.CAD_ASSETS,
    'agent-sam': env.DASHBOARD,
    'iam-platform': env.R2,
  };
  return map[bucketName] || null;
}
```

So bucket name **inneranimalmedia-assets** in R2 APIs uses **env.ASSETS** — the same binding that serves the public site.

### 3.2 Can Agent Sam read from inneranimalmedia-assets?

**Yes**, via the R2 API, as long as the request reaches `handleR2Api`:

- **List:** `GET /api/r2/list?bucket=inneranimalmedia-assets` (and optional prefix/recursive) uses `getR2Binding(env, 'inneranimalmedia-assets')` → ASSETS, and lists keys.
- **Get object:** `GET /api/r2/buckets/inneranimalmedia-assets/object/<key>` uses the same binding and returns the object body (or 404 if missing).

So any client (including Agent Sam) that can call these endpoints can read from inneranimalmedia-assets. **handleR2Api does not call getSession or getAuthUser** — there is no auth check at the start of the R2 API handler.

### 3.3 Can Agent Sam write to inneranimalmedia-assets?

**Yes**, with the same caveat (no auth in handleR2Api):

- **Upload (form):** `POST /api/r2/upload?bucket=inneranimalmedia-assets&key=...` with body → `binding.put(key, body, ...)`.
- **Put by path:** `PUT /api/r2/buckets/inneranimalmedia-assets/object/<key>` with body → same binding, put.
- **Delete:** `DELETE /api/r2/delete?bucket=...&key=...` or `DELETE /api/r2/file` with JSON body, or `DELETE /api/r2/buckets/<bucket>/object` with body `{ key }`.

So read/write/delete to inneranimalmedia-assets are all possible via the R2 API without authentication in the worker.

### 3.4 Routes under /api/r2/

All under `handleR2Api` (entered when `pathLower.startsWith('/api/r2/')`):

| Method | Path / pattern | Purpose |
|--------|-----------------|---------|
| GET    | `/api/r2/stats` | Aggregate stats from `r2_bucket_summary` (DB) |
| POST   | `/api/r2/sync` | Inventory all bound buckets into DB |
| GET    | `/api/r2/buckets` | List buckets (DB + bound list) |
| GET    | `/api/r2/list?bucket=&prefix=&recursive=` | List objects in a bucket (binding or S3 API) |
| GET    | `/api/r2/search?bucket=&q=` | Search keys in bucket (binding only) |
| POST   | `/api/r2/upload?bucket=&key=` | Upload body to bucket (binding) |
| DELETE | `/api/r2/delete?bucket=&key=` | Delete object (binding) |
| DELETE | `/api/r2/file` (body: bucket, key) | Delete object (binding) |
| GET    | `/api/r2/url?bucket=&key=` | Return proxy URL for object |
| POST   | `/api/r2/buckets/bulk-action` | Bulk update bucket metadata / cleanup in DB |
| GET    | `/api/r2/buckets/<name>` | Bucket summary/metadata from DB |
| PUT    | `/api/r2/buckets/<name>` | Update bucket metadata in DB |
| GET    | `/api/r2/buckets/<name>/objects` | List from `r2_object_inventory` (DB) |
| POST   | `/api/r2/buckets/<name>/sync` | Sync bucket to `r2_object_inventory` |
| GET    | `/api/r2/buckets/<name>/url/<key>` | Proxy URL for object |
| GET    | `/api/r2/buckets/<name>/object/<key>` | Get object (stream body) |
| PUT    | `/api/r2/buckets/<name>/object/<key>` | Put object |
| DELETE | `/api/r2/buckets/<name>/object` (body: key) | Records delete in DB / terminal; does not delete in R2 in worker |
| POST   | `/api/r2/upload/<bucket>` | Upload to bucket (key in query or generated) |

### 3.5 Routes under /api/assets/

**None.** There are no routes under `/api/assets/` in worker.js. Grep for `api/assets` returns no matches.

---

## Part 4: All R2-related API endpoints in worker.js (summary)

- **Entry:** `if (pathLower.startsWith('/api/r2/')) return handleR2Api(request, url, env);` (around line 747).
- **Handler:** `async function handleR2Api(request, url, env)` (starts around 2545). It uses `getR2Binding(env, bucketName)` for bucket name → binding (ASSETS, DASHBOARD, etc.).
- **Auth:** handleR2Api does **not** call `getSession` or `getAuthUser`. All R2 API endpoints listed above are unauthenticated at the worker level.
- **Bound buckets:** Code references `BOUND_BUCKET_NAMES = ['inneranimalmedia-assets', 'splineicons', 'agent-sam', 'iam-platform']` for list/sync; get/put/delete use the same binding map.

---

## Part 5: Authentication on public pages

### 5.1 Why does the homepage show an account dropdown?

The worker does **not** serve different HTML based on auth for `/` or other ASSETS. It serves `index-v3.html` (or v2/index) from R2 to everyone. So:

- The **account dropdown is not caused by worker routing**; it is determined by **client-side behavior** (HTML/JS in the page or its assets).
- That content lives in **index-v3.html** and any scripts it loads. Those files are in the **inneranimalmedia-assets** R2 bucket and are **not** in the repo, so the exact logic cannot be inspected here.
- A typical pattern would be: a script on the page calls an API that returns user/session info when a session cookie is present; if the response indicates “logged in,” the UI shows an account dropdown; otherwise it could show “Sign Up” or a link to sign-in.

### 5.2 Is there JavaScript in index-v3.html checking auth state?

**Unknown from the repo.** index-v3.html is only served from R2; it is not in the codebase. Any auth check would be in that file or in assets it references (e.g. shared header/nav script). To confirm, you would need to fetch the live `index-v3.html` (and its script URLs) from the site or from R2.

### 5.3 Should public pages load user session data?

- **Worker behavior:** Public routes (`/`, static ASSETS/DASHBOARD) do **not** call `getSession`. Session is only used for specific API routes (e.g. dashboard stats, agent chat, integrations, etc.).
- So the worker does not “load” session for the HTML of public pages. If the **page’s own script** calls an API that uses session (e.g. `/api/agent/boot`, `/api/overview/stats`), then the browser sends the cookie and the API may return user-specific data or 401. That is a product/UX choice: whether the public homepage script should call such endpoints at all, and how it should react (e.g. show “Sign Up” when 401 or when no user in response).

### 5.4 What would need to change so public pages show “Sign Up” instead of account dropdown?

From the worker side:

- **No change required** for routing or for how session is checked: public pages are already served without auth. Session is only used on certain APIs.
- The **necessary changes are in the front end** (index-v3.html and its scripts, in R2):
  1. Ensure the public page does not assume a logged-in user (e.g. do not call session-only endpoints, or handle 401/empty user).
  2. In the header/nav: if there is no session (or the “current user” API returns 401 or no user), render “Sign Up” / “Log in” instead of the account dropdown.

The worker does not expose a dedicated **GET /api/me** or **GET /api/session** that returns the current user. Session is established via cookie and checked only inside specific handlers (e.g. `getSession(env, request)`). So any “current user” UX on the homepage would today rely on:
- Calling an existing endpoint that optionally uses session (e.g. `/api/agent/boot`, which returns 200 with optional `integrations` when session exists), or  
- Adding a small endpoint that returns minimal user/session info for the header (e.g. `/api/me` or `/api/session`) and having the front end call it and branch UI on that.

---

## Summary table

| Topic | Current state |
|-------|----------------|
| `/` routing | Serves `index-v3.html` (or v2/index) from ASSETS. |
| `/work` | No route; static lookup uses key `work` → 404 if only `process.html` exists. |
| `/about`, `/services`, `/contact` | Treated as static keys `about`, `services`, `contact` (no .html or alias). |
| Fallback / 404 | `notFound(path)` → JSON `{"error":"Not found","path":"..."}`, 404. |
| R2 read/write for inneranimalmedia-assets | Yes, via `/api/r2/*`; no auth in handleR2Api. |
| `/api/assets/` | No routes. |
| Homepage account dropdown | Driven by client-side logic in R2-served assets (e.g. index-v3.html); worker does not vary public HTML by auth. |
| “Sign Up” vs dropdown | Requires front-end changes in R2-served assets; optional worker change could add a “current user” endpoint for the header. |
