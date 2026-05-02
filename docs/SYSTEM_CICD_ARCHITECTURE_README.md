# Inner Animal Media — system architecture (2-zone CICD + repos + D1)

**Purpose:** One visual + structured map so any agent (or human) knows **which Worker, bucket, repo, and DB tables** apply at each phase — reducing ambiguous edits and production accidents.

**Related handoffs:**  
`docs/CURSOR_HANDOFF_D1_CICD_ORCHESTRATION.md` · `docs/CURSOR_HANDOFF_SANDBOX_UI_TO_PRODUCTION.md` · `docs/memory/D1_CANONICAL_AGENT_KEYS.md`

---

## 1. ASCII wireframe — two zones (production vs CICD sandbox)

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                         ZONE A — PRODUCTION (customer-facing)                            │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Browser ──► inneranimalmedia.com                                                        │
│       │                                                                                  │
│       └──► Worker: inneranimalmedia  (repo: THIS repo worker.js + wrangler.production)   │
│                 │                                                                        │
│                 ├── ASSETS (R2)     inneranimalmedia-assets  → /  , /about, marketing    │
│                 ├── DASHBOARD (R2)  agent-sam                → /dashboard/* , /auth/*    │
│                 ├── DB (D1)         inneranimalmedia-business  → sessions, APIs, tables  │
│                 ├── KV, AI, Browser, other bindings per wrangler.production.toml         │
│                 └── Routes     inneranimalmedia.com , www.*                                │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    ZONE B — CICD SANDBOX (UI / safe iteration)                             │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  Browser ──► inneranimal-dashboard.meauxbility.workers.dev                                 │
│       │                                                                                  │
│       └──► Worker: inneranimal-dashboard  (separate CF project; same patterns)          │
│                 │                                                                        │
│                 ├── ASSETS + DASHBOARD (R2)  agent-sam-sandbox-cicd  (mirror keys)       │
│                 ├── DB (often same D1) inneranimalmedia-business  ⚠ shared prod data     │
│                 └── No custom domain required; workers.dev URL                           │
└─────────────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                    STANDALONE WORKERS / SERVICES (not the main site Worker)               │
├─────────────────────────────────────────────────────────────────────────────────────────┤
│  MCP   mcp.inneranimalmedia.com  ──► Worker inneranimalmedia-mcp-server                   │
│        Repo: github.com/SamPrimeaux/inneranimalmedia-mcp-server  (also vendor in monorepo)│
│                                                                                          │
│  PTY   terminal.inneranimalmedia.com  ──► tunnel / isolate process                       │
│        Repo: github.com/SamPrimeaux/iam-pty  (backup / isolated PTY + tunnel story)       │
│        Dashboard may open terminal features; wiring is Worker + WS + tunnel, not R2 HTML  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**CICD (2-step) UI lane (conceptual):**

```
  [ Edit in repo ] ──► [ Build Vite if needed ] ──► [ Upload to ZONE B R2 ] ──► verify sandbox URL
                                                              │
                                                              ▼ (human + PROMOTE_OK + deploy approved)
                                                      [ Upload to ZONE A R2 agent-sam ]
                                                              │
                                                              ▼
                                                      [ Deploy inneranimalmedia Worker if worker.js changed ]
```

Scripts: `scripts/upload-repo-to-r2-sandbox.sh` → `scripts/promote-agent-dashboard-to-production.sh`  
MCP workflow row: `mcp_workflows.id = wf_cicd_agent_ui_sandbox_to_prod`

---

## 2. Mermaid — high-level components

```mermaid
flowchart TB
  subgraph users [Users]
    U[Browser]
  end

  subgraph zoneA [Zone A - Production]
    WA[Worker inneranimalmedia]
    RA[ASSETS R2 inneranimalmedia-assets]
    DA[DASHBOARD R2 agent-sam]
    D1[(D1 inneranimalmedia-business)]
  end

  subgraph zoneB [Zone B - Sandbox CICD]
    WB[Worker inneranimal-dashboard]
    DB2[DASHBOARD R2 agent-sam-sandbox-cicd]
  end

  subgraph standalone [Standalone services]
    MCP[Worker inneranimalmedia-mcp-server]
    PTY[iam-pty + tunnel terminal.inneranimalmedia.com]
  end

  U -->|inneranimalmedia.com| WA
  WA --> RA
  WA --> DA
  WA --> D1

  U -->|workers.dev sandbox| WB
  WB --> DB2
  WB -.->|optional same binding| D1

  U -.->|Cursor / tools| MCP
  U -.->|terminal UI| PTY
```

---

## 3. Mermaid — repos ↔ deploy units

```mermaid
flowchart LR
  subgraph monorepo [This repo SamPrimeaux/inneranimalmedia-agentsam-dashboard]
    W[worker.js]
    dash[dashboard/ agent-dashboard/ ...]
    scripts[scripts/]
    mcp_src[inneranimalmedia-mcp-server/ vendored]
  end

  subgraph deploy_prod [Production deploy]
    CF1[inneranimalmedia Worker]
    R2A[agent-sam + inneranimalmedia-assets]
  end

  subgraph deploy_sbx [Sandbox]
    CF2[inneranimal-dashboard Worker]
    R2B[agent-sam-sandbox-cicd]
  end

  subgraph external_repos [Sibling repos]
    MCP_R[inneranimalmedia-mcp-server.git]
    PTY_R[iam-pty.git]
  end

  W --> CF1
  dash --> R2A
  dash --> R2B
  scripts --> R2A
  scripts --> R2B

  MCP_R --> MCP_W[inneranimalmedia-mcp-server Worker]
  mcp_src -.->|mirror / copy| MCP_R

  PTY_R --> TUN[terminal.inneranimalmedia.com]
```

**Note:** MCP may be developed in the **sibling GitHub repo**; this monorepo can contain a **copy** under `inneranimalmedia-mcp-server/` for convenience. Deploy rules: only `inneranimalmedia-mcp-server` Worker name from that folder’s `wrangler.toml`.

---

## 4. Mermaid — D1 table clusters (what agents touch when)

```mermaid
flowchart TB
  D1[(inneranimalmedia-business)]

  D1 --> core[Core product]
  core --> T1[agent_sessions agent_messages agent_telemetry]
  core --> T2[clients workspaces projects workspace_projects]

  D1 --> ship[Ship / deploy audit]
  ship --> T3[deployments deployment_tracking deployment_changes]
  ship --> T4[cloudflare_deployments worker_registry]

  D1 --> hooks[Webhooks]
  hooks --> T5[webhook_endpoints webhook_events hook_subscriptions hook_executions webhook_event_stats]

  D1 --> roadmap[Roadmap / memory]
  roadmap --> T6[roadmap_plans roadmap_steps agent_memory_index]

  D1 --> kb[Knowledge / RAG]
  kb --> T7[ai_knowledge_base ai_knowledge_chunks infrastructure_documentation]

  D1 --> wf[Workflows MCP]
  wf --> T8[mcp_workflows workflow_runs workflow_executions workflow_locks]

  D1 --> qual[Quality]
  qual --> T9[quality_runs quality_results quality_gates quality_checks]

  D1 --> r2meta[R2 metadata]
  r2meta --> T10[r2_buckets r2_intended_paths r2_object_inventory]

  D1 --> gh[Git / CI context]
  gh --> T11[github_repositories]
```

**Session-start keys (canonical tenant = `system`):**  
`agent_memory_index`: `active_priorities`, `build_progress`, `today_todo` — see `docs/memory/D1_CANONICAL_AGENT_KEYS.md`.

---

## 5. Quick reference — URLs and Worker names

| Role | URL or host | Worker / resource |
|------|-------------|-------------------|
| Production app | https://inneranimalmedia.com | **inneranimalmedia** |
| Sandbox dashboard | https://inneranimal-dashboard.meauxbility.workers.dev | **inneranimal-dashboard** |
| MCP | https://mcp.inneranimalmedia.com/mcp | **inneranimalmedia-mcp-server** |
| MCP health | https://mcp.inneranimalmedia.com/ | JSON `status: ok` ([service root](https://mcp.inneranimalmedia.com/)) |
| Terminal (PTY) | https://terminal.inneranimalmedia.com | **iam-pty** + tunnel (separate from main Worker) |
| Production dashboard R2 | — | **agent-sam** `static/dashboard/...` |
| Sandbox dashboard R2 | — | **agent-sam-sandbox-cicd** same key layout |

---

## 6. Rules agents must not break

- **OAuth:** Do not change `handleGoogleOAuthCallback` / `handleGitHubOAuthCallback` in `worker.js` without explicit approval.
- **Production deploy:** Only after Sam types **`deploy approved`** and correct `wrangler.production.toml` command.
- **MCP deploy:** Only from `inneranimalmedia-mcp-server/` with `npx wrangler deploy -c wrangler.toml`, Worker name **inneranimalmedia-mcp-server** exactly.
- **Dashboard HTML on R2:** Upload changed `dashboard/*.html` to **agent-sam** before relying on production; sandbox uses **agent-sam-sandbox-cicd** via `scripts/upload-repo-to-r2-sandbox.sh`.

---

## 7. Files in this repo that encode this system

| File | What it encodes |
|------|-----------------|
| `wrangler.production.toml` | Zone A Worker bindings (locked — do not change casually) |
| `worker.js` | Routing, APIs, webhooks → D1 tables |
| `scripts/d1-bootstrap-sandbox-workflow-20260322.sql` | `r2_buckets` sandbox row, `mcp_workflows` CICD, `worker_registry` touch-up |
| `scripts/upload-repo-to-r2-sandbox.sh` | Zone B R2 sync |
| `scripts/promote-agent-dashboard-to-production.sh` | Zone A agent bundle R2 promotion gate |
| `docs/CURSOR_HANDOFF_D1_CICD_ORCHESTRATION.md` | D1 write discipline + webhooks + locks |
| `docs/CURSOR_HANDOFF_SANDBOX_UI_TO_PRODUCTION.md` | UI lane sandbox → prod |

---

*Last updated: 2026-03-22 — align with D1 bootstrap and handoff docs.*
