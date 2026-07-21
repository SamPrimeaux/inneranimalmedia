---
name: iam-ship-mcp
description: >-
  Ship ONLY SamPrimeaux/inneranimalmedia-mcp-server (mcp.inneranimalmedia.com).
  Separate GitHub repo and Worker from the main app. Use for MCP worker deploy:full
  / health checks. NEVER deploy main app SPA/PWA or run Vite from this skill —
  that is /iam-ship-main.
---

# IAM ship — MCP (`inneranimalmedia-mcp-server`)

**ONE repo. ONE cwd. Do not ship main app from here.**

| | |
|--|--|
| Repo | `SamPrimeaux/inneranimalmedia-mcp-server` |
| Mac root | `/Users/samprimeaux/inneranimalmedia-mcp-server` |
| Live | `https://mcp.inneranimalmedia.com` |
| Worker | MCP worker (this repo’s wrangler) |
| Shared D1 | `inneranimalmedia-business` (tools/OAuth registry) — still **deploy Worker from MCP root only** |
| Scope | Platform ops under `ws_inneranimalmedia`; minted MCP tokens stay workspace-scoped |

Main app is **`/iam-ship-main`** · umbrella **`/iam-ship`**.

## Deploy

```bash
cd /Users/samprimeaux/inneranimalmedia-mcp-server   # REQUIRED — never main repo
node --check src/index.js
git status && git push
npm run deploy:full    # scripts/deploy-mcp-worker.sh
# Health: https://mcp.inneranimalmedia.com/health  (or worker /api/health)
```

On GCP: use this repo’s clone if present; **do not** run main-app `deploy:full` / Vite to “also” ship MCP.

## Hard rules

- **Never** `cd` to `inneranimalmedia` and wrangler-deploy “for MCP”
- **Never** expect `pwa-build-meta.json` to change from an MCP-only ship
- **Never** mix `npm run deploy:full` meanings — main’s script ≠ MCP’s script (same name, different package.json)
- Opt-outs: `local only` · `no commit` · `no push` · `no deploy` · …

## Proof

1. Cwd is MCP repo  
2. MCP health OK  
3. Main `pwa-build-meta` unchanged unless you also ran `/iam-ship-main`
