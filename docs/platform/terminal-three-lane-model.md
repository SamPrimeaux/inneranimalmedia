---
title: Terminal Three-Lane Model
project_key: inneranimalmedia
topic: terminal_exec
updated: 2026-06-27
status: canonical
---

# Terminal Three-Lane Model

Canonical split for `agentsam_terminal_*` tools. Each lane has one job; tools must not overlap.

## Lanes

| Tool | Exec surface | Who | When |
|------|--------------|-----|------|
| **`agentsam_terminal_local`** | Caller's **own device** via `user_hosted_tunnel` | Any user who completed device setup | Sam's Mac (zsh), Connor's Windows (PowerShell), any provisioned tunnel |
| **`agentsam_terminal_remote`** | **GCP iam-tunnel VM** (`terminal.inneranimalmedia.com`) | Platform operators (Sam) | Mac asleep, phone, OAuth — sparse git/shell/wrangler on Linux clone |
| **`agentsam_terminal_sandbox`** | **Cloudflare Container** per `zone_slug` | Any workspace user with tool access | Isolated dev zones, experiments, CAD/movie batch — not shared VM disk |

## Routing (code)

```
agentsam_terminal_local   → target_type: user_hosted_tunnel  → wss://localpty.* or user tunnel URL
agentsam_terminal_remote  → target_type: platform_vm        → wss://terminal.inneranimalmedia.com
agentsam_terminal_sandbox → target_type: container          → MY_CONTAINER DO id = zone_slug (target)
                            (interim: sandbox PTY until container dev image ships)
```

## Access control

| Tool | Gate |
|------|------|
| `local` | User has active `user_hosted_tunnel` row in `terminal_connections` for their workspace |
| `remote` | `platform_operator` or Sam operator lane (`au_*` registry) |
| `sandbox` | Normal workspace OAuth/tool policy — no operator gate |

## Personas

### Sam (platform operator)

- **Awake at desk:** `local` → Mac `localpty.inneranimalmedia.com` → `/Users/samprimeaux/inneranimalmedia`
- **Mac asleep / phone / ChatGPT:** `remote` → GCP VM → `/home/samprimeaux/inneranimalmedia`
- **Risky experiment / MCP zone:** `sandbox` → Container `zone_slug=engineer|architect|…`

### Connor (tenant dev)

- **His PC:** `local` → his `user_hosted_tunnel` → PowerShell on Windows (when provisioned)
- **Never:** `remote` (Sam's production VM clone)
- **Default cloud work:** `sandbox` → Container dev zone or tenant-scoped sandbox

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
zone_slug  →  getContainer(env.MY_CONTAINER, inneranimalmedia pool)
           →  Go sandbox + git + wrangler in image
           →  optional R2 FUSE at /mnt/r2 (worker secrets R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY)
           →  exec cwd: /mnt/r2/{workspace r2_prefix}/{zone_slug}/…
```

Deprecate `agentsam_container_exec` once sandbox backend is container-native (same facet, clearer name).

## Do not conflate

| Name | Meaning |
|------|---------|
| `sandboxterminal.inneranimalmedia.com` | Legacy GCP PTY hostname for tenant `/workspace/` — retire after container tenant facets |
| `agentsam_terminal_sandbox` tool | Product sandbox lane → **Containers** |
| `.mcp-zones/{slug}/` on shared host | Old path isolation — **remove** when container backend ships |

## Related

- [agents-sdk-2026-06-adoption.md](./agents-sdk-2026-06-adoption.md) — detached sub-agents wrap all three lanes
- [REPAIR-REMOTE-TERMINAL.md](../ops/REPAIR-REMOTE-TERMINAL.md) — GCP cwd / ENOENT fixes
- `src/core/terminal-routing-policy.js` — tool → target_type map
