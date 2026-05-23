# Inner Animal Media — Infrastructure & Terminal Architecture

> **Audience:** Sam Primeaux, Connor McNeely, Agent Sam  
> **Last updated:** May 2026  
> **Status:** Production

---

## Canonical User IDs — source of truth

| Person | user_id | email | tenant_id | workspace_id |
|---|---|---|---|---|
| Sam Primeaux | `au_871d920d1233cbd1` | info@inneranimals.com | tenant_sam_primeaux | ws_inneranimalmedia |
| Connor McNeely | `au_5d17673408aaebc7` | connordmcneely@leadershiplegacydigital.com | tenant_connor_mcneely | ws_connor_mcneely |

**Stale ID `au_77a622faf006c9e4` does not exist in D1 — never use it.**

---

## PTY Working Directories

```
/workspace/
  tenant_sam_primeaux/
    au_871d920d1233cbd1/    ← Sam's shell (chmod 700)
  tenant_connor_mcneely/
    au_5d17673408aaebc7/    ← Connor's shell (chmod 700)
```

Each user's directory is created on first connection, chmod 700.
Neither user can access the other's directory.

---

## Stack overview

```
User / Agent Sam
     │
     ▼
Cloudflare Worker  (inneranimalmedia.com)
     │  auth, routing, tenant scope, iam_db_action DDL, workspace context
     ▼
Cloudflare Tunnel  (inneranimalmedia / aa79ecd4-d8c6-4c40-bc17-09f9ae230508)
     │  encrypted, no open GCP firewall ports
     ▼
GCP VM: iam-tunnel  (34.171.161.41, us-central1-f)
     │  Debian 12, e2-micro → e2-small for production load
     ▼
iam-pty  (Node.js / PM2, port 3099)
     │  per-tenant workspace isolation
     ▼
/workspace/{tenant_id}/{user_id}/
```

---

## GCP VM

| Property | Value |
|---|---|
| Name | iam-tunnel |
| External IP | 34.171.161.41 |
| Zone | us-central1-f |
| Project | gen-lang-client-0684066529 |
| OS | Debian 12 |
| SSH | `gcloud compute ssh iam-tunnel --zone=us-central1-f --project=gen-lang-client-0684066529` |

**Runs on VM:** `cloudflared` (systemd), `iam-pty` (PM2 port 3099)  
**Does NOT run on VM:** Cloudflare Workers, D1, R2, Vectorize

---

## Cloudflare Tunnel

```yaml
# ~/.cloudflared/config.yml on iam-tunnel
tunnel: aa79ecd4-d8c6-4c40-bc17-09f9ae230508
ingress:
  - hostname: terminal.inneranimalmedia.com
    service: http://127.0.0.1:3099
  - hostname: ollama.inneranimalmedia.com
    service: http://localhost:11434
  - service: http://127.0.0.1:3099
```

Two replicas: `darwin_arm64` (Sam's Mac, dev only) and `linux_amd64` (GCP, production).
Only the GCP replica serves production terminal traffic.

---

## Token reference

| Token | Header / param | Validates at | Who holds it |
|---|---|---|---|
| `PTY_AUTH_TOKEN` | `?token=` query param | iam-pty (direct compare) | Worker secret + VM ecosystem.config |
| `MCP_AUTH_TOKEN` | `Authorization: Bearer` | MCP Worker → D1 hash lookup | Worker secret + Cursor mcp.json |
| `AGENTSAM_BRIDGE_KEY` | `X-Bridge-Key` header | Internal Workers only | All internal Workers |

**NEVER:** use `Authorization: Bearer` for `AGENTSAM_BRIDGE_KEY` — it's `X-Bridge-Key`.  
**NEVER:** log or write any of these tokens to D1, R2, or console.

---

## ecosystem.config.cjs environment variables

| Variable | Purpose |
|---|---|
| `PTY_AUTH_TOKEN` | Must match `TERMINAL_SECRET` in Cloudflare Worker |
| `IAM_WORKSPACES_ROOT` | Root for per-tenant dirs (default: `/workspace`) |
| `ALLOWED_TENANTS` | `tenant_sam_primeaux,tenant_connor_mcneely` |
| `WORKER_URL` | `https://inneranimalmedia.com` |
| `PORT` | `3099` |

---

## What Connor can access

| Capability | Allowed |
|---|---|
| Terminal | ✅ `/workspace/tenant_connor_mcneely/au_5d17673408aaebc7/` only |
| MCP: d1_query, r2_read, knowledge_search | ✅ |
| MCP: d1_write, r2_write, terminal_execute | ❌ |
| Sam's workspace or files | ❌ |

---

## Agent Sam Context Rules

- **Never** use `sam_primeaux` as a user_id — always `au_871d920d1233cbd1`
- **Never** write `PTY_AUTH_TOKEN` or `AGENTSAM_BRIDGE_KEY` to logs/D1/R2
- `terminal_execute` is Sam-only — Connor's MCP token does not include it
- `X-Bridge-Key` header, not `Authorization: Bearer`, for Worker-to-Worker calls
- All D1 queries scoped to `workspace_id + user_id` — never cross-tenant
- Deploy command: `npm run deploy:full` — never `npm run deploy` alone
- Canonical repo root: `/Users/samprimeaux/inneranimalmedia`

---

## Common fixes

| Symptom | Cause | Fix |
|---|---|---|
| "Backend unavailable" | iam-pty not running | `pm2 restart iam-pty` on VM |
| "Connecting..." forever | PTY crashed | `pm2 logs iam-pty --lines 20` |
| MCP Unauthorized | Token hash mismatch | Re-run token rotation runbook |
| VPC "Bad Upstream" | Port 3099 not listening | PM2 crashed — restart |
| Wrong working dir | tenant_id/user_id not passed | Check WS URL query params |

---

## Deploy iam-pty updates

```bash
gcloud compute ssh iam-tunnel --zone=us-central1-f --project=gen-lang-client-0684066529
cd ~/iam-pty && git pull && npm install
pm2 restart iam-pty
pm2 logs iam-pty --lines 10 --nostream
lsof -i:3099 | head -3
```

---

*Re-generate this file after any infrastructure change.  
Commit to both `/Users/samprimeaux/inneranimalmedia/docs/INFRASTRUCTURE.md`  
and `~/iam-pty/INFRASTRUCTURE.md`.*
