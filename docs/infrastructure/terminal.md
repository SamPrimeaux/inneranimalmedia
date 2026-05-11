# Inner Animal Media — Infrastructure & Terminal Architecture

**Audience:** Platform engineers, onboarding team members, Agent Sam (AI agents reading this as context)  
**Last updated:** May 2026  
**Status:** Production

> ⚠️ **Security note:** This document contains no real IPs, tunnel IDs, project IDs, user IDs, or secret values.  
> All sensitive identifiers are stored in `.env.cloudflare` (gitignored), Cloudflare Worker secrets (set via `wrangler secret put`), and the GCP VM's `ecosystem.config.cjs` (gitignored).  
> Never commit real values to any repository.

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
GCP VM: iam-tunnel  (see .env.cloudflare for IP / project / zone)
     │  Debian 12, e2-micro → upgrade to e2-small for production load
     ▼
iam-pty  (Node.js / PM2, port 3099)
     │  per-tenant workspace isolation
     ▼
/workspace/{tenant_id}/{user_id}/
```

Nothing in this stack has open firewall ports exposed to the public internet. All traffic enters through Cloudflare.

### Operational components (at-a-glance)

| Component | Expect |
|---|---|
| Cloudflare Tunnel | Healthy replicas; routes for `terminal.*` and optional `ollama.*` |
| GCP VM (`linux_amd64`) | Production PTY host; tunnel daemon + PM2 `iam-pty` |
| Mac replica (`darwin_arm64`) | Dev-only; do not rely on for prod traffic |
| PTY local | `http://localhost:3099/health` → liveness |
| PTY via tunnel | `https://terminal.inneranimalmedia.com/health` |
| MCP Worker | `tools/list` / JSON-RPC at `mcp.inneranimalmedia.com` |
| Main Worker | D1, R2, browser, queues, AI, Hyperdrive as configured |
| Ollama (optional) | Local models; tunnel hostname often CF Access–protected |
| `gcloud` CLI | Keep updated (security patches) |

Engineering backlog and verified sprint notes: [`docs/SPRINT_PTY_SOLIDIFIED.md`](../SPRINT_PTY_SOLIDIFIED.md).

---

## Layer 1 — GCP VM (iam-tunnel)

### What it is

A Google Cloud Compute Engine virtual machine running Debian 12. It exists for one reason: to host services that need persistent processes (PTY terminals, tunnels) which Cloudflare Workers cannot run natively.

### Key facts

| Property | Where to find it |
|---|---|
| VM name | `iam-tunnel` |
| External IP | `.env.cloudflare` → `GCP_VM_EXTERNAL_IP` |
| Internal IP | `.env.cloudflare` → `GCP_VM_INTERNAL_IP` |
| Zone | `.env.cloudflare` → `GCP_ZONE` |
| GCP Project ID | `.env.cloudflare` → `GCP_PROJECT_ID` |
| OS | Debian 12 (bookworm) |
| Machine type | e2-micro (2 vCPU, 1 GB RAM) |
| Disk | 30 GB standard persistent |
| SSH user | See `.env.cloudflare` → `GCP_SSH_USER` |

### How to SSH in

```bash
gcloud compute ssh iam-tunnel \
  --zone=$GCP_ZONE \
  --project=$GCP_PROJECT_ID
```

Source `.env.cloudflare` first or export those vars before running.

### What runs on the VM

- `cloudflared` — the Cloudflare Tunnel daemon (systemd service)
- `iam-pty` — the PTY terminal server (PM2 process, port 3099)

### What does NOT run on the VM

- The main Cloudflare Worker (`inneranimalmedia.com`) — runs on Cloudflare's edge globally
- The MCP server (`mcp.inneranimalmedia.com`) — also a Cloudflare Worker
- D1, R2, KV, Vectorize — all Cloudflare-managed, not on this VM

---

## Layer 2 — Cloudflare Tunnel

### What it is

`cloudflared` creates an outbound-only encrypted connection from the GCP VM to Cloudflare's network:

- The VM has **no open inbound firewall ports** (HTTP: Off, HTTPS: Off in GCP firewall)
- Traffic reaches the VM only through the tunnel
- Cloudflare terminates TLS and routes requests

### Tunnel details

| Property | Where to find it |
|---|---|
| Tunnel name | `inneranimalmedia` |
| Tunnel ID | `.env.cloudflare` → `CF_TUNNEL_ID` |
| Config file | `~/.cloudflared/config.yml` on the VM |

### Config template (`~/.cloudflared/config.yml`)

```yaml
# Do not commit this file with real values
tunnel: <CF_TUNNEL_ID>   # from .env.cloudflare

ingress:
  - hostname: terminal.inneranimalmedia.com
    service: http://127.0.0.1:3099      # → iam-pty
  - hostname: ollama.inneranimalmedia.com
    service: http://localhost:11434      # → Ollama (if running)
  - service: http://127.0.0.1:3099      # catch-all fallback
```

### Why the tunnel matters for security

Without the tunnel you would need to open GCP firewall ports 80/443/3099 to the internet. With the tunnel the VM's firewall is fully closed — the only way to reach `terminal.inneranimalmedia.com` is through Cloudflare, which enforces the Worker's auth logic first.

### Two replicas

The tunnel dashboard shows two replicas:

- `darwin_arm64` — local Mac (for development only)
- `linux_amd64` — GCP VM (production / multi-user)

Cloudflare load-balances between them. **Only the GCP VM should serve production terminal traffic.**

---

## Layer 3 — Cloudflare Workers VPC Connector

The `iam-vpc` connector allows the main Worker to make internal requests to the GCP VM over the private network without going through the public tunnel.

Used for low-latency internal calls from the Worker to the PTY service. If you see `"Bad Upstream: Connection Refused"` errors in the VPC metrics, it means `iam-pty` is not running on port 3099 on the VM.

---

## Layer 4 — iam-pty Terminal Server

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
  {tenant_id}/
    {user_id}/    ← shell lands here, cwd on session open
```

The PTY server reads `tenant_id` and `user_id` from the WebSocket URL query params, creates the directory if it doesn't exist, and spawns the shell with `cwd` set to that path. Users cannot navigate to another tenant's workspace by default.

### Environment variables

Set in `ecosystem.config.cjs` — sourced from `.env` on the VM, **never hardcoded**.

| Variable | Purpose |
|---|---|
| `PTY_AUTH_TOKEN` | Shared secret — Worker sends this to prove it's allowed to open sessions |
| `IAM_WORKSPACES_ROOT` | Root directory for per-tenant workspaces (default: `/workspace`) |
| `ALLOWED_TENANTS` | Comma-separated list of tenant IDs allowed to use the terminal |
| `WORKER_URL` | Main Worker URL for theme/config lookups |
| `PORT` | PTY server port (default: `3099`) |

**Never hardcode these values.** They are injected at runtime from the PM2 ecosystem config.

### `ecosystem.config.cjs` template (safe to commit)

```js
module.exports = {
  apps: [{
    name: 'iam-pty',
    script: './server.js',
    env: {
      PORT:                 process.env.PORT || 3099,
      PTY_AUTH_TOKEN:       process.env.PTY_AUTH_TOKEN,    // never hardcode
      IAM_WORKSPACES_ROOT:  process.env.IAM_WORKSPACES_ROOT || '/workspace',
      ALLOWED_TENANTS:      process.env.ALLOWED_TENANTS,
      WORKER_URL:           process.env.WORKER_URL
    }
  }]
};
```

Real values live in `~/iam-pty/.env` on the VM (gitignored).

---

## The Auth Tokens

### PTY_AUTH_TOKEN / TERMINAL_SECRET

A shared secret between the Cloudflare Worker and the PTY server.

**Flow:**

```
1. User opens terminal in the dashboard
2. Worker validates the user's session (cookie/JWT)
3. Worker checks identity.tenantId is in the allowed list
4. Worker opens WebSocket to terminal.inneranimalmedia.com
   with ?token=<PTY_AUTH_TOKEN>&tenant_id=...&user_id=...
5. PTY server validates the token, scopes session to /workspace/{tenant_id}/{user_id}/
```

**Who holds it:**

| Location | Secret name |
|---|---|
| Cloudflare Worker secret | `TERMINAL_SECRET` (set via `wrangler secret put TERMINAL_SECRET`) |
| GCP VM env | `PTY_AUTH_TOKEN` (set in `~/iam-pty/.env`, loaded by PM2) |

These two values **must match exactly**.

**Who should NOT have it:** End users, external clients. This is an internal service-to-service secret only.

---

### MCP_AUTH_TOKEN

A Bearer token that authenticates requests to the MCP server at `mcp.inneranimalmedia.com`.

**Flow:**

```
1. MCP client sends JSON-RPC to https://mcp.inneranimalmedia.com/mcp
   with Authorization: Bearer <token>
2. MCP Worker SHA-256 hashes the token
3. Looks up hash in mcp_workspace_tokens D1 table
4. If found and is_active=1 → request allowed, scoped to workspace's allowed_tools
```

**Where it's stored:**

| Location | What's stored |
|---|---|
| `.env.cloudflare` | Raw token (gitignored) |
| Cloudflare Worker secret (main worker) | Raw token — used for health checks |
| Cloudflare Worker secret (mcp-server worker) | Raw token — used to validate incoming requests |
| D1 `mcp_workspace_tokens` | SHA-256 hash only — never the raw value |
| MCP client config | Raw token in `Authorization: Bearer` header |

**Per-workspace tokens:** Each workspace gets its own token with its own `allowed_tools` list. Token IDs and hash values are stored in D1 only — never in this document.

---

### AGENTSAM_BRIDGE_KEY

A secret for internal Worker-to-Worker communication. When the main Worker needs to call another Worker, it sends this key in the `X-Bridge-Key` header.

> ⚠️ **Common bug:** The header is `X-Bridge-Key`, NOT `Authorization: Bearer`.

**Who holds it:** All workers that communicate internally. Set via `wrangler secret put AGENTSAM_BRIDGE_KEY --name <worker-name>`.

**Who should NOT have it:** End users, MCP clients. This never leaves the Cloudflare network.

---

### Token Summary

| Token | Header | Validates at | Scope | In client config? |
|---|---|---|---|---|
| `MCP_AUTH_TOKEN` | `Authorization: Bearer` | MCP Worker (D1 hash lookup) | Per-workspace tool allowlist | Yes |
| `PTY_AUTH_TOKEN` | `?token=` query param | iam-pty server (direct comparison) | Terminal session auth | No |
| `AGENTSAM_BRIDGE_KEY` | `X-Bridge-Key` | Internal workers only | Worker-to-Worker calls | No |

---

## Multi-Tenant Design

### Tenant and Workspace IDs

Real IDs are stored in D1 and `.env.cloudflare` only. The pattern is:

```
tenant_id:    tenant_{slug}       e.g. tenant_acme_corp
workspace_id: ws_{slug}           e.g. ws_acme_main
user_id:      au_{hex}            e.g. au_<random hex>  (OAuth)
              usr_{hex}           e.g. usr_<random hex> (login)
```

### What tenant scoping controls

- **MCP tools** — `agentsam_mcp_tools.user_id` must match authenticated user's `auth_users.id`
- **Terminal workspace** — `/workspace/{tenant_id}/{user_id}/` filesystem isolation
- **D1 queries via MCP** — `allowed_tools` on the workspace token limits which tools run
- **Subagent profiles, skills, commands** — all filtered by `user_id` or `workspace_id`

### terminal_connections resolution order

When the Worker resolves which PTY connection to use for a given user:

```
1. WHERE user_id = ? AND workspace_id = ? AND is_active = 1       (user-scoped)
2. WHERE workspace_id = ? AND user_id IS NULL AND is_active = 1   (workspace default)
3. WHERE is_default = 1 AND is_active = 1                         (global fallback)
```

---

## Deployment Runbook

### Deploy iam-pty updates to GCP VM

```bash
gcloud compute ssh iam-tunnel \
  --zone=$GCP_ZONE \
  --project=$GCP_PROJECT_ID \
  --command "cd ~/iam-pty && git pull && npm install && pm2 restart iam-pty"

# Verify
gcloud compute ssh iam-tunnel \
  --zone=$GCP_ZONE \
  --project=$GCP_PROJECT_ID \
  --command "pm2 logs iam-pty --lines 10 --nostream && lsof -i:3099 | head -3"
```

### Rotate MCP_AUTH_TOKEN

```bash
# 1. Generate new token
export NEW_TOKEN="$(openssl rand -hex 32)"
export NEW_HASH=$(echo -n "$NEW_TOKEN" | openssl dgst -sha256 | awk '{print $2}')

# 2. Deactivate old token in D1 (use actual token ID from D1)
npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml \
  --command "UPDATE mcp_workspace_tokens SET is_active=0 WHERE id='<TOKEN_ID>';"

# 3. Insert new hash
npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml \
  --command "INSERT INTO mcp_workspace_tokens
    (id, workspace_id, tenant_id, label, token_hash, is_active)
    VALUES ('<NEW_TOKEN_ID>', '<WORKSPACE_ID>', '<TENANT_ID>', '<LABEL>', '$NEW_HASH', 1);"

# 4. Update Worker secrets
echo "$NEW_TOKEN" | npx wrangler secret put MCP_AUTH_TOKEN
echo "$NEW_TOKEN" | npx wrangler secret put MCP_AUTH_TOKEN --name inneranimalmedia-mcp-server

# 5. Update .env.cloudflare (gitignored)
sed -i '' "s/^MCP_AUTH_TOKEN=.*/MCP_AUTH_TOKEN=$NEW_TOKEN/" .env.cloudflare

# 6. Update MCP client configs with new token
```

### Check tunnel health

```bash
# From local Mac
curl -s https://terminal.inneranimalmedia.com/ping

# From GCP VM
gcloud compute ssh iam-tunnel --zone=$GCP_ZONE --project=$GCP_PROJECT_ID \
  --command "pm2 list && lsof -i:3099 && systemctl status cloudflared"
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
| MCP `tools/list` returns fewer tools than expected | `user_id` mismatch in `agentsam_mcp_tools` | Verify `user_id` matches `auth_users.id` in D1 |
| VPC shows "Bad Upstream: Connection Refused" | Port 3099 not listening | PM2 process crashed — restart it |
| 502 on `terminal.inneranimalmedia.com` | `cloudflared` not running or wrong config | `systemctl restart cloudflared` on VM |
| User lands in wrong workspace | `tenant_id` not passed from Worker to PTY | Verify Worker passes `tenant_id` + `user_id` in WebSocket query params |

---

## Agent Sam Context Rules

When Agent Sam reads this document and executes terminal or MCP tool calls:

- **Never** use a display name or slug as a `user_id` — always use the `au_*` format from `auth_users.id`
- **Never** write `PTY_AUTH_TOKEN`, `AGENTSAM_BRIDGE_KEY`, or any raw secret to logs, D1, or R2
- `terminal_execute` is restricted by workspace token — check `allowed_tools` before attempting
- Use `X-Bridge-Key` header for internal Worker-to-Worker calls, **not** `Authorization: Bearer`
- All MCP D1 queries are scoped to the authenticated workspace — do not query across tenants
- Canonical deploy command: `npm run deploy:full` — never `npm run deploy` alone
- Canonical working directory: `/Users/samprimeaux/inneranimalmedia`

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE EDGE                              │
│                                                                  │
│  inneranimalmedia.com          mcp.inneranimalmedia.com         │
│  (main Worker)                 (MCP Worker)                     │
│       │                              │                           │
│       │   AGENTSAM_BRIDGE_KEY        │                           │
│       │   (X-Bridge-Key header)      │                           │
│       └──────────────────────────────┘                           │
│                       │                                          │
│              D1  R2  KV  Vectorize                               │
│           (inneranimalmedia-business)                            │
└───────────────────────┬─────────────────────────────────────────┘
                        │ Cloudflare Tunnel (encrypted, outbound-only from VM)
                        │
┌───────────────────────▼─────────────────────────────────────────┐
│                   GCP VM: iam-tunnel                             │
│                   (IP / project in .env.cloudflare)             │
│                                                                  │
│   cloudflared (systemd)                                          │
│        │                                                         │
│        ▼                                                         │
│   iam-pty (PM2, port 3099)                                       │
│        │                                                         │
│        ├── /workspace/{tenant_a}/{user_a}/                      │
│        └── /workspace/{tenant_b}/{user_b}/                      │
└─────────────────────────────────────────────────────────────────┘

Auth flow — terminal:
  User → Worker (session auth) → Worker (tenant check)
       → PTY (?token=PTY_AUTH_TOKEN&tenant_id=...&user_id=...)
       → Isolated shell in /workspace/{tenant_id}/{user_id}/

Auth flow — MCP tools:
  Client → MCP Worker (Authorization: Bearer <token>)
         → SHA-256 hash → mcp_workspace_tokens D1 lookup
         → allowed_tools filter → tool dispatch
```

---

## `.env.cloudflare` — what belongs here (gitignored, never committed)

```
GCP_PROJECT_ID=
GCP_ZONE=
GCP_VM_EXTERNAL_IP=
GCP_VM_INTERNAL_IP=
GCP_SSH_USER=
CF_TUNNEL_ID=
MCP_AUTH_TOKEN=
PTY_AUTH_TOKEN=
AGENTSAM_BRIDGE_KEY=
```

This file is the single source of truth for values that must never appear in this document or any committed file.

---

*Re-generate this document after any infrastructure change and commit to:*

- `iam-pty` repo → `INFRASTRUCTURE.md`
- Main `inneranimalmedia` repo → `docs/infrastructure/terminal.md` (this file)
