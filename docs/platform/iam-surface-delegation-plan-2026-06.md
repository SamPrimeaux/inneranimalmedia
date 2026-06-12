# IAM surface delegation plan — core, satellites, CMS, tunnels

**Date:** 2026-06-12  
**Core:** [inneranimalmedia.com](https://inneranimalmedia.com) (`inneranimalmedia` repo)  
**Related:** [iam-runtime-architecture-2026-06.md](./iam-runtime-architecture-2026-06.md) · **[AgentSamQUADMODE.md](../AgentSamQUADMODE.md)** (terminal + platform quad — tattoo cheat sheet)

---

## 1. Mental model (one screen)

```
                         ┌─────────────────────────────────────┐
                         │  inneranimalmedia.com (CORE)        │
                         │  Auth · D1 · APIs · Dashboard SPA   │
                         └──────────────┬──────────────────────┘
                                        │
          ┌─────────────────────────────┼─────────────────────────────┐
          │ service binding           │ HTTP sibling                │ OAuth bridge
          ▼                           ▼                             ▼
┌──────────────────┐      ┌──────────────────────┐      ┌─────────────────────┐
│ moviemode-service│      │ services.* worker      │      │ mcp.inneranimalmedia  │
│ custom domain +  │      │ platform landing,    │      │ external clients only │
│ MOVIEMODE_SERVICE│      │ PWA manifest, push     │      │ (Cursor, Claude, GPT) │
└────────┬─────────┘      └──────────────────────┘      └─────────────────────┘
         │ globe / legacy /meaux*
         │
┌────────▼──────────────────────────────────────────────────────────────┐
│ PTY / render / builds (NOT Workers)                                    │
│  localpty (samsmac tunnel) → Mac iam-pty :3099                         │
│  terminal + iam-vpc (inneranimalmedia tunnel) → Mac or GCP iam-pty     │
│  Worker PTY_SERVICE binding → private iam-vpc route on same tunnel     │
└────────────────────────────────────────────────────────────────────────┘
```

**Rule:** Satellites **never** own D1 truth. They render, proxy, or run scoped lanes. Core owns sessions, CMS graph, tools, billing.

---

## 2. moviemode-service — how to delegate properly

### Today

| Layer | Owner |
|-------|--------|
| Studio UI | Core `/dashboard/moviemode` |
| Encode APIs | Core `/api/moviemode/*`, `/api/cloudconvert/*` |
| Globe landing | moviemode-service `public/` + core `/globe` proxy |
| Remotion render | Core → `PTY_SERVICE` or `terminal.inneranimalmedia.com/exec` |

### Target (phased)

| Phase | moviemode-service | Core |
|-------|-------------------|------|
| **A (now)** | Landing + legacy `/meaux*` | All APIs + dashboard |
| **B** | `POST /api/moviemode/conversions` offload (read-heavy encode webhook) | Session mint + D1 writes |
| **C** | Full API bundle + `IAM_SERVICE_KEY` auth from core | Dashboard calls `env.MOVIEMODE_SERVICE.fetch` for encode lane only |

**Service binding pattern:**

```js
// Core worker — delegate encode job creation (future)
const res = await env.MOVIEMODE_SERVICE.fetch(
  new Request('https://moviemode.inneranimalmedia.com/api/moviemode/conversions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-IAM-Service-Key': env.IAM_SERVICE_KEY,
      'X-IAM-User-Id': userId,
      'X-IAM-Workspace-Id': workspaceId,
    },
    body: JSON.stringify(payload),
  }),
);
```

**Do not** move auth or `cms_page_sections` to moviemode. Binding is for **compute + static product**, not identity.

---

## 3. services.inneranimalmedia.com — companion worker

### Role

| Concern | services worker | Core |
|---------|-----------------|------|
| Agent Sam platform marketing | ✅ landing HTML | Links into `/dashboard/agent` |
| Dashboard SPA | ❌ | ✅ R2 `static/dashboard/app` |
| `/sw/manifest.json` deploy receipts | ✅ poll + mirror | ✅ writes manifest on deploy |
| Web Push subscriptions | ✅ store + notify | ✅ triggers on deploy/events |
| D1 business logic | ❌ | ✅ |

### Optional service binding (later)

Add `[[services]] binding = "IAM_SERVICES"` only if you need **in-process** manifest fetch from core (low latency). Otherwise HTTP is fine — companion pattern.

**Enhances dashboard by:** version coordination, offline/PWA, operator status — not by hosting React routes.

---

## 4. CMS — where it should live

### Recommendation: **`/dashboard/cms`** (not inside Agent)

| Route | Purpose |
|-------|---------|
| `/dashboard/cms` | Page list, routes, publish status |
| `/dashboard/cms/editor/:pageId` | Section editor (work globe, case studies, contact hero, …) |
| `/dashboard/cms/preview/:route` | Preview with tweaks (globe panel, draft sections) |
| `/dashboard/agent` | Chat, tools, terminal, workflows — **no CMS chrome** |

### Why split from Agent

- Agent is **execution** (tools, PTY, MCP, streams) — already crowded.
- CMS is **content graph** (`cms_pages`, `cms_page_sections`, R2 `pages/*`) — form + preview + publish.
- `/work` already has `data-cms-section` markers — editor writes R2 + D1, public serves static.

### Data flow

```
Editor (/dashboard/cms/editor)
  → GET /api/cms/pages/:id + sections
  → PATCH section JSON + HTML fragments
  → POST /api/cms/publish → R2 pages/work/index.html + invalidate cache
Public /work
  → Core worker ASSET_ROUTES + optional hydrate (contact pattern)
```

**Globe scene:** editor preview mounts `#tweak-toggle`; public `/work` omits it (already shipped).

### Phase order

1. CMS shell route + page picker (D1 `cms_pages` where `route_path=/work`)
2. Section list from HTML `data-cms-section` or D1 `cms_page_sections`
3. WYSIWYG for text blocks; embed globe as locked **scene section** type
4. Publish → `./scripts/upload-work-page.sh` API wrapper

---

## 5. Tunnels — what helps what

| Tunnel | ID | Hostname(s) | Helps |
|--------|-----|-------------|-------|
| **samsmac** | fbc1a392… | `localpty.inneranimalmedia.com` | Mac PTY primary (`conn_mac_local`), dashboard terminal WS |
| **inneranimalmedia** | aa79ecd4… | `terminal.inneranimalmedia.com`, **iam-vpc**, `0.0.0.0/0` | VM/Mac PTY fallback, **Worker `PTY_SERVICE` VPC exec**, MovieMode Remotion on platform_vm |

**Service bindings (moviemode, future services) do NOT use Cloudflare Tunnel.** Tunnels connect **Workers VPC / public hostname → your iam-pty :3099** for shell and `/exec`.

**MovieMode render path:** Core API → `PTY_SERVICE.fetch(localhost:3099/exec)` (needs **iam-vpc** route UP) OR fallback `https://terminal.inneranimalmedia.com/exec`.

### Mac fix (two tunnels, one machine)

System daemon = **samsmac** only. Install inneranimalmedia via user LaunchAgent:

```bash
./scripts/install-inneranimalmedia-tunnel-mac.sh
```

Do **not** `sudo cloudflared service install` with inneranimalmedia token — replaces/conflicts with samsmac.

### Production

GCP `iam-tunnel` VM should also run cloudflared for `inneranimalmedia` tunnel (linux_amd64 replica). Mac = dev + iam-vpc when you're at the desk.

---

## 6. Tomorrow build order

1. ✅ Repair inneranimalmedia tunnel on Mac (script above); verify CF dashboard replicas + `terminal` health
2. CMS routes in `App.tsx` + empty `CmsEditorPage` shell
3. Wire `/work` sections to `GET /api/public/cms?route=/work` + publish API
4. moviemode phase B: webhook + conversion status on satellite (optional binding)
5. services worker: `/sw/manifest.json` mirrors last `deploy:full` receipt

---

## 7. Quick reference

| URL | Type | Binds to core? |
|-----|------|----------------|
| inneranimalmedia.com | Core | — |
| moviemode.inneranimalmedia.com | Satellite | **Yes** `MOVIEMODE_SERVICE` |
| services.inneranimalmedia.com | Companion | HTTP (binding optional) |
| mcp.inneranimalmedia.com | MCP bridge | D1 only; no dashboard through MCP |
| localpty.* | Tunnel → Mac PTY | Terminal WS |
| terminal.* + iam-vpc | Tunnel → PTY | `/exec` + `PTY_SERVICE` |
