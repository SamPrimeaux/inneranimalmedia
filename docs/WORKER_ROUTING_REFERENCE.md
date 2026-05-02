# Worker routing reference (merge into full worker)

The **live** inneranimalmedia worker includes Durable Objects (e.g. `IAMCollaborationSession`). Deploying the minimal `worker.js` in this repo would remove those exports and break DOs, so the API rejects the deploy.

**Use this instead:** Merge the routing logic below into your **full** worker (the one that already exports `IAMCollaborationSession` and handles `/api/*`, OAuth, etc.). Keep that worker’s `fetch()` and add these rules **first** (before your existing API/dashboard handlers) so the homepage and login/dashboard are served from R2.

---

## Route → R2 mapping to implement

| Path | Binding | R2 key |
|------|---------|--------|
| `GET /` or `GET /index.html` | ASSETS | `index-v2.html` then fallback `index.html` |
| `GET /auth/signin` | DASHBOARD | `static/auth-signin.html` |
| `GET /dashboard` or `/dashboard/` | — | Redirect 302 to `/dashboard/overview` |
| `GET /dashboard/:page` (e.g. overview, agent) | DASHBOARD | `static/dashboard/:page.html` then `dashboard/:page.html` |
| Other static (e.g. `/static/*`, `.js`, `.css`) | ASSETS then DASHBOARD | key = path without leading `/` |

---

## Logic (paste into your fetch handler, early in the request flow)

```js
// At the top of your fetch(), after parsing URL:
const path = url.pathname.replace(/\/$/, '') || '/';
const pathLower = path.toLowerCase();

// Health
if (pathLower === '/api/health') {
  return new Response(JSON.stringify({
    ok: !!(env.ASSETS && env.DASHBOARD),
    worker: 'inneranimalmedia',
  }), { headers: { 'Content-Type': 'application/json' }, status: 200 });
}

// Homepage (ASSETS)
if (path === '/' || path === '/index.html') {
  const obj = await env.ASSETS.get('index-v2.html') ?? await env.ASSETS.get('index.html');
  if (obj) return new Response(obj.body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Auth sign-in (DASHBOARD)
if (pathLower === '/auth/signin') {
  const obj = await env.DASHBOARD.get('static/auth-signin.html');
  if (obj) return new Response(obj.body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Dashboard redirect
if (pathLower === '/dashboard' || pathLower === '/dashboard/') {
  return Response.redirect(url.origin + '/dashboard/overview', 302);
}

// Dashboard pages (DASHBOARD)
if (pathLower.startsWith('/dashboard/')) {
  const segment = pathLower.slice('/dashboard/'.length).split('/')[0] || 'overview';
  const obj = await env.DASHBOARD.get(`static/dashboard/${segment}.html`)
    ?? await env.DASHBOARD.get(`dashboard/${segment}.html`);
  if (obj) return new Response(obj.body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// Then continue to your existing API, OAuth, DO, etc.
```

---

## R2 keys that must exist

- **ASSETS (inneranimalmedia-assets):** `index-v2.html` or `index.html` for homepage.
- **DASHBOARD (agent-sam):**  
  - `static/auth-signin.html`  
  - `static/dashboard/overview.html` (and/or `dashboard/overview.html`)  
  - `static/dashboard/agent.html` (and/or `dashboard/agent.html`)

---

## Deploying

After merging this routing into the full worker (the one that exports `IAMCollaborationSession`), deploy from that project:

```bash
npx wrangler deploy
```

Do **not** deploy the minimal `worker.js` from this repo on top of the existing inneranimalmedia worker; it would break Durable Objects.
