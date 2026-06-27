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
| **`agentsam_terminal_remote`** | **GCP iam-tunnel VM** (`terminal.inneranimalmedia.com`) | Platform operators (Sam) | Mac asleep, phone, OAuth — full repo git/npm/wrangler on Linux clone |
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

Remote is "fully capable" when all pass with Mac asleep:

- [ ] `curl https://terminal.inneranimalmedia.com/health` → 200
- [ ] `agentsam_terminal_remote` + `git status` → real output from `/home/samprimeaux/inneranimalmedia`
- [ ] `npm run build:vite-only` completes on VM clone
- [ ] `wrangler deploy` works from VM (secrets synced via `sync-vm-env-cloudflare.sh`)
- [ ] No macOS `/Users/...` cwd passed to Linux spawn (ENOENT)
- [ ] OAuth MCP defaults to `remote` when `local` tunnel health fails

## Sandbox → Container (target)

```
zone_slug  →  getContainer(env.MY_CONTAINER, zoneSlug)
           →  clone-on-boot from GitHub
           →  node:22 + git + wrangler in image
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
