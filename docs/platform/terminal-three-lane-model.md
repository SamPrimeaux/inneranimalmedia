---
title: Terminal Three-Lane Model
project_key: inneranimalmedia
topic: terminal_exec
updated: 2026-07-01
status: canonical
---

# Terminal Three-Lane Model

Canonical split for `agentsam_terminal_*` tools. Each lane has one job; tools must not overlap.

## Lanes

| Tool | Exec surface | Who | When |
|------|--------------|-----|------|
| **`agentsam_terminal_local`** | Caller's **own device** via `user_hosted_tunnel` | Any user who completed device setup | Platform operator: `localpty.inneranimalmedia.com` → desk Mac tunnel. BYOK members: their provisioned tunnel when set up |
| **`agentsam_terminal_remote`** | **GCP iam-tunnel VM** (`terminal.inneranimalmedia.com`) | Platform operators (Sam) | Mac asleep, phone, OAuth — sparse git/shell/wrangler on Linux clone. **Not for CAD** — see [`iam-tunnel-vm-role-2026-07.md`](./iam-tunnel-vm-role-2026-07.md) |
| **`agentsam_terminal_sandbox`** | **Cloudflare Container** — single shared `inneranimalmedia` pool (path/R2-isolated, not per-`zone_slug` DO instance) | Any workspace user with tool access | Isolated dev zones, experiments — **default R2 FUSE persistence**. Design Studio CAD jobs use the separate **`iam-cad-worker`** container (`CAD_DISPATCH_TARGET=container`) |

## Routing (code)

```
agentsam_terminal_local   → target_type: user_hosted_tunnel  → wss://localpty.* (samsmac) or user tunnel URL
agentsam_terminal_remote  → target_type: platform_vm        → wss://terminal.inneranimalmedia.com (GCP / ExecOS)
agentsam_terminal_sandbox → target_type: container          → MY_CONTAINER.getByName("inneranimalmedia")
                            zone_slug = cwd/R2 path tag only, NOT a separate DO instance id
                            (per-zone_slug DO affinity was tried and explicitly reverted — see getZoneContainerStub)
```

### ExecOS worker (execos.inneranimalmedia.com)

| Env var | Target | Role |
|---------|--------|------|
| `MAC_EXEC_URL` | `https://localpty.inneranimalmedia.com/run` | **samsmac** tunnel — desk lane when Mac is awake |
| `GCP_EXEC_URL` | `https://terminal.inneranimalmedia.com/run` | GCP iam-tunnel — always-on when Mac sleeps |

Health-aware routing (`terminal-connection-health.js`): probe localpty first in `auto` mode; fall back to GCP, then sandbox.

## Access control

| Tool | Gate |
|------|------|
| `local` | User has active `user_hosted_tunnel` row in `terminal_connections` for their workspace |
| `remote` | `platform_operator` or Sam operator lane (`au_*` registry) |
| `sandbox` | Normal workspace OAuth/tool policy — no operator gate |

## Personas

### Platform operator

- **Awake at desk:** `local` → Mac `localpty.inneranimalmedia.com` → operator desk repo path
- **Mac asleep / phone / ChatGPT:** `remote` → GCP VM → remote clone path
- **Risky experiment / MCP zone:** `sandbox` → Container (shared `inneranimalmedia` pool; `zone_slug=engineer|architect|…` sets cwd/R2 path, not the container instance)

### BYOK tenant member

- **Their device:** `local` → their `user_hosted_tunnel` (when provisioned)
- **Never:** `remote` (platform production VM clone)
- **Default cloud work:** `sandbox` → shared Container pool, tenant-scoped cwd/R2 path

## Remote VM capability checklist (Sam)

Remote is **git/shell capable** (not a CI box) when all pass with Mac asleep:

- [ ] `curl https://terminal.inneranimalmedia.com/health` → 200
- [ ] `agentsam_terminal_remote` + `git status` → real output from `/home/samprimeaux/inneranimalmedia`
- [ ] Sparse partial clone at `~/inneranimalmedia` (`src`, `dashboard/src`, `scripts` only — no root `npm ci`)
- [ ] `wrangler deploy` works from VM when needed (secrets synced via `sync-vm-env-cloudflare.sh`; wrangler global on box)
- [ ] No macOS `/Users/...` cwd passed to Linux spawn (ENOENT)
- [ ] OAuth MCP defaults to `remote` when `local` tunnel health fails

**Heavy builds** (`npm run build:vite-only`, Playwright, GLB tooling) → **`agentsam_terminal_sandbox`** (CF Container), not the VM.

## Wrangler auth by lane

Aligned with [Wrangler general commands](https://developers.cloudflare.com/workers/wrangler/commands/) (Apr 2026). Code: `src/core/wrangler-terminal-guidance.js` · API: `GET /api/terminal/wrangler-guide?lane=local|remote|sandbox`.

| Lane | Auth path | Use |
|------|-----------|-----|
| **local** (Mac PTY) | `wrangler login` OAuth once | `wrangler whoami`, deploy, d1, r2 on your machine |
| **remote** (GCP VM) | `CLOUDFLARE_API_TOKEN` via `scripts/sync-vm-env-cloudflare.sh` | Headless — **avoid** `wrangler login` unless port 8976 is tunneled |
| **sandbox** (CF container) | Platform `CLOUDFLARE_API_TOKEN` injected for superadmin sandbox exec | `wrangler whoami --json` — **block** bare `wrangler login` (OAuth callback hangs) |

Container OAuth (interactive only): publish port **8976** and run `wrangler login --callback-host=0.0.0.0 --callback-port=8976`. Agent Sam sandbox prefers API token over OAuth.

Recovery hints on failed wrangler commands are appended via `wranglerTerminalRecoveryHints` in terminal tool responses.

## Sandbox → Container (target)

```
getContainerStub(env)  →  env.MY_CONTAINER.getByName(resolveContainerPoolId(env))  // always "inneranimalmedia"
                       →  Go sandbox + git + wrangler in image
                       →  **default** R2 FUSE at /mnt/r2/{workspace r2_prefix}/{zone_slug}/ (writable — see sandbox-r2-fuse-default.md)
                       →  exec cwd: /mnt/r2/{workspace r2_prefix}/{zone_slug}/…
```

`zone_slug` is metadata for cwd + R2 path isolation only — it is **not** the container DO id. Every `agentsam_terminal_sandbox` exec, health probe, MovieMode render attempt, and `/v1/*` proxy call hits the same named stub (`inneranimalmedia`). `getZoneContainerStub(env, _zoneSlug)` is a thin wrapper that ignores the zone argument and delegates to `getContainerStub(env)` — kept for call-site compatibility during the migration off per-zone routing, not because zone affects which DO instance is used.

Legacy per-zone DO instance names (`engineer`, `specialist`, `sam`, …) are retained in code/docs only for **cleanup and purge**, not for routing. See `src/core/my-container.js` (`getContainerStub`, `getZoneContainerStub`) and `mcp-zone-spine.js`.

Deprecate `agentsam_container_exec` once sandbox backend is fully consolidated onto this pool (same facet, clearer name).

### When to revisit this model

Single shared pool + R2 path isolation is correct for stateless jobs (git clone, npm, wrangler on mounted workspace dirs) where persistence lives in R2, not on local container disk. Switch to `idFromName(workspaceId)` / `idFromName(sessionId)` routing only if a workload needs true per-user/per-workspace container affinity — e.g. persistent local `node_modules`, a long-running `wrangler dev` process, or any state that can't live on R2/mounted storage. That is a distinct model from what's implemented today and would require explicit opt-in per facet, not a blanket routing change.

## Do not conflate

| Name | Meaning |
|------|---------|
| `sandboxterminal.inneranimalmedia.com` | Legacy GCP PTY hostname for tenant `/workspace/` — retire after container tenant facets |
| `agentsam_terminal_sandbox` tool | Product sandbox lane → **Containers**, single shared `inneranimalmedia` pool |
| `.mcp-zones/{slug}/` on shared host | Superseded by R2-backed cwd isolation (`/mnt/r2/{workspace}/{zone_slug}/…`) — remove any remaining references |

## Related

- [agents-sdk-2026-06-adoption.md](./agents-sdk-2026-06-adoption.md) — detached sub-agents wrap all three lanes
- [REPAIR-REMOTE-TERMINAL.md](../ops/REPAIR-REMOTE-TERMINAL.md) — GCP cwd / ENOENT fixes
- `src/core/terminal-routing-policy.js` — tool → target_type map
- `src/core/my-container.js` — pool routing SSOT (`getContainerStub`, `resolveContainerPoolId`, `getZoneContainerStub`)
