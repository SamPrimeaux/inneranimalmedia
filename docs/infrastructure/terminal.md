# Inner Animal Media — Infrastructure & Terminal Architecture

> **Audience:** Sam Primeaux, Connor McNeely, Agent Sam (AI agents reading this as context)
> **Last updated:** May 2026
> **Status:** Production

---

## The Big Picture

Every terminal session, AI tool call, and agent action in the IAM platform flows through a layered stack. Understanding each layer prevents security mistakes and makes debugging straightforward.

```
User / Agent
     │
     ▼
Cloudflare Worker (inneranimalmedia.com)
     │  auth, routing, tenant scoping
     ▼
Cloudflare Tunnel (inneranimalmedia)
     │  encrypted, no open firewall ports
     ▼
GCP VM: iam-tunnel (34.171.161.41, us-central1-f)
     │  Debian 12, e2-micro, 30GB disk
     ▼
iam-pty (Node.js / PM2, port 3099)
     │  per-tenant workspace isolation
     ▼
/workspace/{tenant_id}/{user_id}/
```

Nothing in this stack has open firewall ports exposed to the public internet. All traffic enters through Cloudflare.

---

## Layer 1 — GCP VM (`iam-tunnel`)

### What it is
A Google Cloud Compute Engine virtual machine running Debian 12. It exists for one reason: to host services that need persistent processes (PTY terminals, tunnels) which Cloudflare Workers cannot run natively.

### Key facts
| Property | Value |
|---|---|
| Name | `iam-tunnel` |
| External IP | `34.171.161.41` |
| Internal IP | `10.128.0.2` |
| Zone | `us-central1-f` |
| Project | `gen-lang-client-0684066529` (InnerAnimalMedia) |
| OS | Debian 12 (bookworm) |
| Machine type | e2-micro (2 vCPU, 1 GB RAM) — upgrade to e2-small for production load |
| Disk | 30 GB standard persistent |
| SSH user | `samprimeaux` (via gcloud) or `info` (legacy key) |

### How to SSH in
```bash
gcloud compute ssh iam-tunnel --zone=us-central1-f --project=gen-lang-client-0684066529
```

### What runs on the VM
- `cloudflared` — the Cloudflare Tunnel daemon (systemd service)
- `iam-pty` — the PTY terminal server (PM2 process, port 3099)

### What does NOT run on the VM
- The main Cloudflare Worker (`inneranimalmedia.com`) — that runs on Cloudflare's edge globally
- The MCP server (`mcp.inneranimalmedia.com`) — also a Cloudflare Worker
- D1, R2, KV, Vectorize — all Cloudflare-managed, not on this VM

---

## Layer 2 — Cloudflare Tunnel

### What it is
`cloudflared` creates an outbound-only encrypted connection from the GCP VM to Cloudflare's network. This means:
- The VM has **no open inbound firewall ports** (HTTP: Off, HTTPS: Off in GCP firewall)
- Traffic reaches the VM only through the tunnel
- Cloudflare terminates TLS and routes requests

### Tunnel details
| Property | Value |
|---|---|
| Tunnel name | `inneranimalmedia` |
| Tunnel ID | `aa79ecd4-d8c6-4c40-bc17-09f9ae230508` |
| Config file | `~/.cloudflared/config.yml` on the VM |

### Routes (4 active)
```yaml
# ~/.cloudflared/config.yml on iam-tunnel VM
tunnel: aa79ecd4-d8c6-4c40-bc17-09f9ae230508

ingress:
  - hostname: terminal.inneranimalmedia.com
    service: http://127.0.0.1:3099      # → iam-pty
  - hostname: ollama.inneranimalmedia.com
    service: http://localhost:11434      # → Ollama (if running)
  - service: http://127.0.0.1:3099      # catch-all fallback
```

### Why the tunnel matters for security
Without the tunnel, you would need to open GCP firewall ports 80/443/3099 to the internet. Anyone who found the IP could attempt connections. With the tunnel, the VM's firewall is fully closed — the only way to reach `terminal.inneranimalmedia.com` is through Cloudflare, which enforces your Worker's auth logic first.

### Two replicas
The tunnel dashboard shows two replicas:
- `darwin_arm64` — Sam's Mac (local PTY for development)
- `linux_amd64` — GCP VM (cloud PTY for production / multi-user)

Cloudflare load-balances between them. **Only the GCP VM should serve production terminal traffic.** Sam's Mac replica is for local dev only.

---

## Layer 3 — Cloudflare Workers VPC Connector

The Cloudflare Workers VPC (`iam-vpc`) allows the main Worker at `inneranimalmedia.com` to make internal requests to the GCP VM over the private network (`10.128.0.2`) without going through the public tunnel.

This is used for low-latency internal calls from the Worker to the PTY service. If you see "Bad Upstream: Connection Refused" errors in the VPC metrics, it means the `iam-pty` process is not running on port 3099 on the VM.

---

## Layer 4 — `iam-pty` Terminal Server

### What it is
A Node.js WebSocket server that spawns real shell (PTY) processes. When the dashboard opens a terminal, it connects here.

### Repository
`https://github.com/SamPrimeaux/iam-pty`

### How it runs on the VM
```bash
cd ~/iam-pty
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup   # auto-restart on VM reboot
```

### Per-tenant workspace isolation
Each user gets a completely isolated working directory:
```
/workspace/
  tenant_sam_primeaux/
    au_77a622faf006c9e4/    ← Sam's shell lands here
  tenant_connor_mcneely/
    au_5d17673408aaebc7/    ← Connor's shell lands here
```

The PTY server reads `tenant_id` and `user_id` from the WebSocket URL query params, creates the directory if it doesn't exist, and spawns the shell with `cwd` set to that path. Neither user can navigate to the other's workspace by default.

### Environment variables (set in ecosystem.config.cjs)
| Variable | Purpose |
|---|---|
| `PTY_AUTH_TOKEN` | Shared secret — Worker sends this to prove it's allowed to open sessions |
| `IAM_WORKSPACES_ROOT` | Root directory for per-tenant workspaces (default: `/workspace`) |
| `ALLOWED_TENANTS` | Comma-separated list of tenant IDs allowed to use the terminal |
| `WORKER_URL` | Main worker URL for theme/config lookups |
| `PORT` | PTY server port (default: `3099`) |

**Never hardcode these values.** They are injected at runtime from the PM2 ecosystem config or GCP metadata.

---

## The Two Auth Tokens

### `PTY_AUTH_TOKEN` / `TERMINAL_SECRET`

**What it is:** A shared secret between the Cloudflare Worker and the PTY server.

**Flow:**
1. User opens terminal in the dashboard
2. Worker validates the user's session (cookie/JWT)
3. Worker checks `identity.tenantId` is in the allowed list
4. Worker proxies a WebSocket to `terminal.inneranimalmedia.com` with `?token=PTY_AUTH_TOKEN&tenant_id=...&user_id=...`
5. PTY server validates the token, then scopes the session to the tenant workspace

**Who holds it:**
- Cloudflare Worker secret: `TERMINAL_SECRET` (set via `wrangler secret put TERMINAL_SECRET`)
- GCP VM env var: `PTY_AUTH_TOKEN` (set in ecosystem.config.cjs, sourced from `.env`)
- These two values **must match exactly**

**Who should NOT have it:** End users, Connor, external clients. This is an internal service-to-service secret.

---

### `MCP_AUTH_TOKEN`

**What it is:** A Bearer token that authenticates requests to the MCP server at `mcp.inneranimalmedia.com`.

**Flow:**
1. Cursor / Agent Sam / any MCP client sends a JSON-RPC request to `https://mcp.inneranimalmedia.com/mcp`
2. Request includes `Authorization: Bearer <token>`
3. MCP server SHA-256 hashes the token and looks it up in `mcp_workspace_tokens` D1 table
4. If found and `is_active=1`, the request is allowed and scoped to that workspace's `allowed_tools`

**Where it's stored:**
| Location | Value |
|---|---|
| `.env.cloudflare` | `MCP_AUTH_TOKEN=<raw token>` |
| Cloudflare Worker secret (main worker) | `MCP_AUTH_TOKEN` — used for dashboard health checks |
| Cloudflare Worker secret (mcp-server worker) | `MCP_AUTH_TOKEN` — used to validate incoming requests |
| D1 `mcp_workspace_tokens` table | SHA-256 hash of the token (never the raw value) |
| Cursor `mcp.json` config | Raw token in `Authorization: Bearer` header |

**Per-workspace tokens:**
Each workspace gets its own token with its own `allowed_tools` list:
```sql
-- Sam's token (full access)
tok_iam_main → ws_inneranimalmedia → 36 tools including terminal_execute

-- Connor's token (read-only, no terminal)
tok_connor_main → ws_connor_mcneely → 8 tools, no terminal_execute
```

---

### `AGENTSAM_BRIDGE_KEY`

**What it is:** A secret used for internal Worker-to-Worker communication. When the main `inneranimalmedia` Worker needs to call another Worker (e.g., `inneranimalmedia-mcp-server`, `companionscpas-platform`, `shinshu-solutions`), it sends this key in the `X-Bridge-Key` header.

**Important:** The header name is `X-Bridge-Key`, NOT `Authorization: Bearer`. This is a common source of bugs.

**Flow:**
```
inneranimalmedia Worker
  → X-Bridge-Key: <AGENTSAM_BRIDGE_KEY>
  → inneranimalmedia-mcp-server Worker (or other internal worker)
```

**Who holds it:**
- All workers that need to communicate internally: `inneranimalmedia`, `inneranimalmedia-mcp-server`, `companionscpas-platform`
- Set as a Worker secret on each: `wrangler secret put AGENTSAM_BRIDGE_KEY --name <worker-name>`

**Who should NOT have it:** End users, Cursor clients, Connor. This never leaves the Cloudflare network.

---

## Token Summary Table

| Token | Header | Validates at | Scope | In Cursor config? |
|---|---|---|---|---|
| `MCP_AUTH_TOKEN` | `Authorization: Bearer` | MCP Worker (D1 hash lookup) | Per-workspace tool allowlist | Yes |
| `PTY_AUTH_TOKEN` | `?token=` query param | iam-pty server (direct comparison) | Terminal session auth | No |
| `AGENTSAM_BRIDGE_KEY` | `X-Bridge-Key` | Internal workers only | Worker-to-Worker calls | No |

---

## Multi-Tenant Design

### Tenant IDs
Each organization or user group gets a `tenant_id`:
| Tenant | ID | Primary user |
|---|---|---|
| Inner Animal Media (Sam) | `tenant_sam_primeaux` | `au_77a622faf006c9e4` |
| Connor McNeely | `tenant_connor_mcneely` | `au_5d17673408aaebc7` |

### Workspace IDs
Each project/client gets a `workspace_id`:
| Workspace | ID | Tenant |
|---|---|---|
| Inner Animal Media main | `ws_inneranimalmedia` | `tenant_sam_primeaux` |
| Connor's workspace | `ws_connor_mcneely` | `tenant_connor_mcneely` |
| DesignStudio | `ws_designstudio` | `tenant_sam_primeaux` |

### What tenant scoping controls
- **MCP tools:** `agentsam_mcp_tools.user_id` must match the authenticated user's `auth_users.id` (`au_*` format)
- **Terminal workspace:** `/workspace/{tenant_id}/{user_id}/` — filesystem isolation
- **D1 queries via MCP:** The `allowed_tools` on the workspace token limits which tools can run
- **Subagent profiles, skills, commands:** All filtered by `user_id` or `workspace_id`

### What Connor can access
- MCP tools: `d1_query`, `r2_read`, `r2_list`, `r2_search`, `knowledge_search`, `agent_memory_search`, `platform_info`, `telemetry_query`
- Terminal: his own `/workspace/tenant_connor_mcneely/au_5d17673408aaebc7/` directory only
- Cannot run: `terminal_execute` on Sam's workspace, `r2_write`, `d1_write`, `worker_deploy`

---

## Deployment Runbook

### Deploy iam-pty updates to GCP VM
```bash
# SSH into VM
gcloud compute ssh iam-tunnel --zone=us-central1-f --project=gen-lang-client-0684066529

# Pull latest
cd ~/iam-pty && git pull && npm install

# Restart
pm2 restart iam-pty

# Verify
pm2 logs iam-pty --lines 10 --nostream
lsof -i:3099 | head -3
```

### Rotate MCP_AUTH_TOKEN
```bash
# 1. Generate new token
export NEW_TOKEN="$(openssl rand -hex 32)"
export NEW_HASH=$(echo -n "$NEW_TOKEN" | openssl dgst -sha256 | awk '{print $2}')

# 2. Update D1
npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml \
  --command "UPDATE mcp_workspace_tokens SET is_active=0 WHERE id='tok_iam_main';"

npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml \
  --command "INSERT INTO mcp_workspace_tokens (id,workspace_id,tenant_id,label,token_hash,is_active) \
  VALUES ('tok_iam_main','ws_inneranimalmedia','tenant_sam_primeaux','IAM Main','$NEW_HASH',1);"

# 3. Update Worker secrets
echo "$NEW_TOKEN" | npx wrangler secret put MCP_AUTH_TOKEN
echo "$NEW_TOKEN" | npx wrangler secret put MCP_AUTH_TOKEN --name inneranimalmedia-mcp-server

# 4. Update .env.cloudflare
sed -i '' "s/^MCP_AUTH_TOKEN=.*/MCP_AUTH_TOKEN=$NEW_TOKEN/" .env.cloudflare

# 5. Update Cursor mcp.json with new token
```

### Check tunnel health
```bash
# From local Mac
curl -s https://terminal.inneranimalmedia.com/ping

# From GCP VM
pm2 list
lsof -i:3099
systemctl status cloudflared
```

### Verify MCP server tools
```bash
curl -s -X POST https://mcp.inneranimalmedia.com/mcp \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $(grep MCP_AUTH_TOKEN .env.cloudflare | cut -d= -f2)" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq '.result.tools | length'
```

---

## Common Issues & Fixes

| Symptom | Cause | Fix |
|---|---|---|
| Terminal shows "Backend unavailable" | iam-pty not running on VM | SSH to VM, `pm2 restart iam-pty` |
| Terminal shows "Connecting..." forever | Tunnel healthy but PTY crashed | `pm2 logs iam-pty --lines 20` on VM |
| MCP returns `{"error":"Unauthorized"}` | Token hash mismatch in D1 | Re-run token rotation runbook |
| MCP tools/list returns fewer than 33 tools | `user_id` mismatch in `agentsam_mcp_tools` | Update `user_id` to `au_77a622faf006c9e4` |
| VPC shows "Bad Upstream: Connection Refused" | Port 3099 not listening | PM2 process crashed, restart it |
| 502 on terminal.inneranimalmedia.com | cloudflared not running or wrong config | `systemctl restart cloudflared` on VM |
| Connor can access Sam's files | Tenant isolation not applied | Ensure `tenant_id` query param is passed from Worker to PTY |

---

## Agent Sam Context Rules

When Agent Sam reads this document and executes terminal or MCP tool calls:

1. **Never use `sam_primeaux` as a `user_id`** — always use `au_77a622faf006c9e4`
2. **Never write `PTY_AUTH_TOKEN` or `AGENTSAM_BRIDGE_KEY` to logs, D1, or R2**
3. **`terminal_execute` is Sam-only** — Connor's token does not include it
4. **`X-Bridge-Key` header, not `Authorization: Bearer`** for internal Worker-to-Worker calls
5. **All MCP D1 queries are scoped to the workspace** — do not query across tenants
6. **The canonical deploy command is `npm run deploy:full`** — never `cd dashboard && npm run deploy` alone
7. **The canonical working directory is `/Users/samprimeaux/inneranimalmedia`** — not Downloads, not nested paths

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE EDGE                              │
│                                                                  │
│  inneranimalmedia.com     mcp.inneranimalmedia.com              │
│  (main Worker)            (MCP Worker)                          │
│       │                        │                                 │
│       │  AGENTSAM_BRIDGE_KEY   │                                 │
│       │  (X-Bridge-Key header) │                                 │
│       └────────────────────────┘                                 │
│                    │                                             │
│            D1  R2  KV  Vectorize                                 │
│         (inneranimalmedia-business)                              │
└─────────────────────────┬───────────────────────────────────────┘
                          │ Cloudflare Tunnel
                          │ (encrypted, outbound-only from VM)
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│                   GCP VM: iam-tunnel                             │
│                   34.171.161.41 / us-central1-f                 │
│                                                                  │
│   cloudflared (systemd)                                          │
│        │                                                         │
│        ▼                                                         │
│   iam-pty (PM2, port 3099)                                       │
│        │                                                         │
│        ├── /workspace/tenant_sam_primeaux/au_77a.../            │
│        └── /workspace/tenant_connor_mcneely/au_5d17.../         │
└─────────────────────────────────────────────────────────────────┘

Auth flow for terminal_execute:
  User → Worker (session auth) → Worker (tenant check)
       → PTY (?token=PTY_AUTH_TOKEN&tenant_id=...&user_id=...)
       → Isolated shell in /workspace/{tenant_id}/{user_id}/

Auth flow for MCP tools:
  Cursor/Agent → MCP Worker (Authorization: Bearer <token>)
               → SHA-256 hash → mcp_workspace_tokens D1 lookup
               → allowed_tools filter → tool dispatch
```

---

*This document should be re-generated after any infrastructure change and committed to the `iam-pty` repo as `INFRASTRUCTURE.md` and to the main `inneranimalmedia` repo as `docs/infrastructure.md`.*
