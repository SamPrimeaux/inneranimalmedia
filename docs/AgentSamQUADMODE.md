# AgentSam QUADMODE

**Remember:** QUAD = four terminal lanes + four platform surfaces.  
**SSOT repos:** `inneranimalmedia` (core) · `iam-pty` (shell server + tunnels) · `moviemode-service` · `inneranimalmedia-mcp-server`

Last verified: 2026-06-12

---

## PART A — TERMINAL QUAD (the four lanes)

Dashboard splash menu maps to **two** user-facing choices. Under the hood there are **four** lanes.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        inneranimalmedia.com (CORE)                          │
│   Dashboard WS  ·  /api/terminal/*  ·  PTY_SERVICE (Worker VPC binding)   │
└─────────────────────────────────────────────────────────────────────────────┘
         │                    │                    │                    │
         ▼                    ▼                    ▼                    ▼
   ┌───────────┐       ┌───────────┐       ┌───────────┐       ┌───────────┐
   │  LANE 1   │       │  LANE 2   │       │  LANE 3   │       │  LANE 4   │
   │ LOCAL-SAM │       │LOCAL-USER │       │   CLOUD   │       │ VPC-EXEC  │
   └─────┬─────┘       └─────┬─────┘       └─────┬─────┘       └─────┬─────┘
         │                   │                   │                   │
    samsmac tunnel      per-user tunnel     inneranimalmedia      iam-vpc route
    localpty.*          (Connor VM/PS)      tunnel terminal.*     (no browser UI)
         │                   │                   │                   │
         ▼                   ▼                   ▼                   ▼
    Mac iam-pty         Connor iam-pty      GCP iam-pty         same :3099
    :3099               :3099               :3099 (prod)        private /exec
```

### Lane 1 — LOCAL-SAM (your "Start local")

| Field | Value |
|-------|--------|
| **UI** | Splash → `1` Start local |
| **D1** | `conn_mac_local` · `target_type=user_hosted_tunnel` · priority 10 · default |
| **Tunnel** | **samsmac** (`fbc1a392-9113-4dfc-b55b-6b24483a3a3a`) |
| **Public host** | `wss://localpty.inneranimalmedia.com` |
| **Process** | Mac LaunchDaemon `com.cloudflare.cloudflared` (system) |
| **iam-pty** | `~/iam-pty` · PM2 · port **3099** |
| **cwd** | `host_default` → `/Users/samprimeaux/inneranimalmedia` |
| **Who** | Sam only (your Mac must be on) |

### Lane 2 — LOCAL-USER (Connor's "Start local")

| Field | Value |
|-------|--------|
| **UI** | Same splash option — **per-user** row in D1 |
| **D1** | `user_hosted_tunnel` row for Connor's `user_id` + `workspace_id` |
| **Tunnel** | Connor's own cloudflared (his VM or Windows + PowerShell) |
| **Public host** | His `ws_url` (not Sam's localpty) |
| **iam-pty** | Connor installs `iam-pty` on **his** machine |
| **cwd** | `platform_workspace` → `/workspace/tenant_connor_mcneely/au_5d17673408aaebc7/` |
| **Who** | Any user with `self_service_enabled=1` + tunnel row |

Connor can have **both** VM Linux and PowerShell paths — still one D1 row per workspace; pick one active `ws_url`.

### Lane 3 — CLOUD (operator / always-on fallback)

| Field | Value |
|-------|--------|
| **UI** | Splash → `2` Cloud terminal |
| **D1** | `conn_mac_shell2` · `platform_vm` · priority 50 |
| **Tunnel** | **inneranimalmedia** (`aa79ecd4-d8c6-4c40-bc17-09f9ae230508`) |
| **Public host** | `wss://terminal.inneranimalmedia.com` |
| **Production origin** | **GCP VM `iam-tunnel`** (Debian · us-central1-f) |
| **Dev replica** | Mac LaunchAgent `com.cloudflare.cloudflared.inneranimalmedia` (when desk is on) |
| **cwd** | `host_default` → `/Users/samprimeaux/inneranimalmedia` (Sam operator) |
| **Who** | Everyone with `can_run_pty` — **works when Sam's Mac is off** (GCP path) |

### Lane 3b — SANDBOX (isolated GCP `/workspace`)

| Field | Value |
|-------|--------|
| **UI** | Splash → `3` Sandbox terminal |
| **D1** | `conn_sam_sandbox` · `target_type=sandbox` · priority 55 |
| **Tunnel** | **inneranimalmedia** (GCP replica preferred) |
| **Public host** | `wss://sandboxterminal.inneranimalmedia.com` |
| **cwd** | `platform_workspace` → `/workspace/{tenant_id}/{user_id}/` |
| **Who** | Sam operator experiments; Connor/customers use their own clone path |
| **Install** | `./scripts/install-sandboxterminal-route.sh` + CF dashboard Published application |

### Lane 4 — VPC-EXEC (headless — MovieMode, agent tools)

| Field | Value |
|-------|--------|
| **UI** | No splash — Worker calls it |
| **Binding** | `PTY_SERVICE` in `wrangler.production.toml` (`iam-vpc` on inneranimalmedia tunnel) |
| **Path** | `env.PTY_SERVICE.fetch('http://localhost:3099/exec', …)` |
| **Fallback** | Public `https://terminal.inneranimalmedia.com/exec` |
| **Needs** | inneranimalmedia tunnel **UP** + iam-pty listening on 3099 |
| **Used by** | MovieMode Remotion render, `runTerminalCommandViaHttpExec`, AgentChat platform_vm |

---

## Resolution order (D1 law)

```sql
SELECT * FROM terminal_connections
WHERE user_id = ? AND workspace_id = ? AND is_active = 1
ORDER BY is_default DESC, target_priority ASC
LIMIT 1;
```

- Interactive WS: user picks **local** (`user_hosted_tunnel`) or **cloud** (`platform_vm`) on splash.
- Auto jobs: default row wins unless `target_id` forced (e.g. MovieMode on `platform_vm`).

---

## PART B — PLATFORM QUAD (four Workers)

| # | Surface | URL | Repo | Binding? |
|---|---------|-----|------|----------|
| 1 | **CORE** | inneranimalmedia.com | inneranimalmedia | — |
| 2 | **MOVIE** | moviemode.inneranimalmedia.com | moviemode-service | `MOVIEMODE_SERVICE` |
| 3 | **SERVICES** | services.inneranimalmedia.com | iam-pwa-services (companion) | HTTP only |
| 4 | **MCP** | mcp.inneranimalmedia.com | inneranimalmedia-mcp-server | D1 catalog only |

Tunnels do **not** connect MOVIE or SERVICES bindings. Tunnels connect **CORE ↔ iam-pty** (lanes 3–4).

---

## PART C — Put GCP in `github.com/SamPrimeaux/iam-pty`? **YES (recommended)**

You thought GCP lived in iam-pty — **it should.** Split today is accidental.

### iam-pty repo should own (runtime shell)

```
iam-pty/
├── server.js              # port 3099 — WS + /exec + /health
├── ecosystem.config.cjs   # PM2
├── package.json
├── deploy/
│   ├── mac/
│   │   ├── install-samsmac-tunnel.sh      # system LaunchDaemon → localpty
│   │   └── install-inneranimalmedia-tunnel-mac.sh  # user LaunchAgent (dev replica)
│   └── gcp/
│       ├── iam-tunnel-bootstrap.sh        # first-time VM setup
│       ├── cloudflared.service            # systemd unit
│       ├── install-inneranimalmedia-tunnel-gcp.sh
│       └── health-check.sh
├── config/
│   ├── cloudflared-inneranimalmedia.yml.example
│   └── cloudflared-samsmac.token.env.example
├── INFRASTRUCTURE.md      # mirror of core doc
└── AgentSamQUADMODE.md    # copy of this file
```

### inneranimalmedia repo keeps (control plane)

- `src/api/terminal.js` — WS broker, splash targets API
- `src/core/terminal.js` — D1 resolution, PTY_SERVICE exec
- D1 migrations — `terminal_connections`
- `dashboard/components/XTermShell.tsx` — splash UI
- `scripts/install-terminal-tunnel-env.sh` — thin wrapper calling iam-pty deploy scripts

**Why not only inneranimalmedia?** iam-pty runs on Mac and GCP **outside** Workers. One repo = one `git pull && pm2 restart` on both hosts.

---

## PART D — GCP production replica (do this once, then forget)

### VM facts

| | |
|---|---|
| Name | `iam-tunnel` |
| Zone | `us-central1-f` |
| Project | `gen-lang-client-0684066529` |
| SSH | `gcloud compute ssh iam-tunnel --zone=us-central1-f --project=gen-lang-client-0684066529` |

### On GCP (one-time + after iam-pty updates)

```bash
# From laptop
gcloud compute ssh iam-tunnel --zone=us-central1-f --project=gen-lang-client-0684066529

# On VM
cd ~/iam-pty && git pull && npm install
pm2 restart iam-pty --update-env || pm2 start ecosystem.config.cjs
pm2 save

# inneranimalmedia tunnel connector (production replica)
sudo cloudflared service install <INNERANIMALMEDIA_TUNNEL_TOKEN>
# OR if already installed: edit /etc/systemd/system/cloudflared.service token + restart

sudo systemctl restart cloudflared
lsof -i :3099 | head -3
curl -s localhost:3099/health | jq .
```

### From Mac (sync secrets + verify)

```bash
cd ~/inneranimalmedia
./scripts/install-terminal-tunnel-env.sh --gcp-only
./scripts/install-terminal-tunnel-env.sh   # mac + workers + gcp when ready
```

### Verify quad health

```bash
curl -s https://localpty.inneranimalmedia.com/health    # Lane 1 (Mac on)
curl -s https://terminal.inneranimalmedia.com/health    # Lane 3 (GCP or Mac replica)
# CF Zero Trust → Tunnels → inneranimalmedia → 2 replicas ideal:
#   darwin_arm64 (Mac dev) + linux_amd64 (GCP prod)
```

---

## PART E — Mac two-tunnel rule (do not break samsmac)

| Tunnel | Install method | Token |
|--------|----------------|-------|
| samsmac | `sudo cloudflared service install` (already done) | samsmac token |
| inneranimalmedia | **User** LaunchAgent only | inneranimalmedia token |

```bash
# NEVER sudo install inneranimalmedia token — conflicts with samsmac.
~/inneranimalmedia/scripts/install-inneranimalmedia-tunnel-mac.sh
```

---

## PART F — Dashboard splash → lane mapping

| Key | Label | `startTerminalConnection()` | Lane |
|-----|-------|---------------------------|------|
| `1` | Start local | `user_hosted_tunnel` | 1 (Sam) or 2 (Connor) |
| `2` | Cloud terminal | `platform_vm` | 3 CLOUD |
| `3` | Agent Sam | models list | (no PTY) |

API: `GET /api/terminal/connections/targets?workspace_id=…` → `local.ready` + `cloud.ready`

---

## PART G — CMS (where it fits — not Agent clutter)

| Route | Job |
|-------|-----|
| `/dashboard/cms` | Page list |
| `/dashboard/cms/editor/:id` | Sections (work globe, case studies, …) |
| `/dashboard/cms/preview/:route` | Preview **with** globe tweaks |
| `/dashboard/agent` | Chat + tools only |

Publish → R2 `pages/*` (e.g. `./scripts/upload-work-page.sh`).

---

## PART H — Quick troubleshooting

| Symptom | Lane | Fix |
|---------|------|-----|
| localpty 200, terminal 530 | 3 | Start GCP cloudflared OR Mac inneranimalmedia LaunchAgent |
| Splash "Cloud" greyed | 3 | `conn_mac_shell2` missing or `buildTerminalConfigStatus` false |
| MovieMode export PTY missing | 4 | `PTY_SERVICE` binding + iam-vpc route up |
| Connor local fails | 2 | His tunnel row + iam-pty on his VM |
| `service install` conflicts | Mac | Use LaunchAgent script for inneranimalmedia only |

---

## PART I — Efficiency plan (stop paying for idle GCP)

1. **GCP always-on:** iam-pty + cloudflared systemd on `iam-tunnel` (Lane 3 prod).
2. **Mac when coding:** samsmac (Lane 1) + optional inneranimalmedia replica (Lane 3 dev).
3. **Move deploy scripts** into `iam-pty` repo (`deploy/gcp/`, `deploy/mac/`).
4. **Cron/alert:** CF tunnel replica count < 1 on inneranimalmedia → page Sam.
5. **Connor:** document Lane 2 self-service in onboarding HTML (already started).

---

## Cheat sheet (tattoo-sized)

```
CORE     = inneranimalmedia.com
MOVIE    = moviemode.* (binding)
SERVICES = services.* (companion)
MCP      = mcp.* (external OAuth)

LOCAL    = localpty (samsmac) → your Mac
CLOUD    = terminal (inneranimalmedia) → GCP iam-tunnel
VPC      = iam-vpc → Worker /exec (MovieMode)
CONNOR   = his tunnel → his iam-pty

Deploy core:     npm run deploy:full
Deploy movie:    cd services/moviemode-service && npx wrangler deploy -c wrangler.toml
Fix Mac tunnel:  ./scripts/install-inneranimalmedia-tunnel-mac.sh
Fix GCP tunnel:  gcloud ssh iam-tunnel → pm2 restart iam-pty → systemctl restart cloudflared
Sync env:        ./scripts/install-terminal-tunnel-env.sh
```

---

*Mirror this file to `~/iam-pty/AgentSamQUADMODE.md` when iam-pty repo is updated.*
