# Dashboard Agent Audit Series

This documentation series maps the **LIVE production** `/dashboard/agent` system powering **https://inneranimalmedia.com/dashboard/agent**.

The goal is **not** to redesign from scratch.

The goal is to:

- understand the existing engineered system in **`dashboard/`** (the only served UI source)
- identify incomplete or broken execution paths
- stabilize the live workbench
- improve reliability and mobile usability
- evolve the current platform into a dependable agent operating environment

### Quality bar (operator UX target)

Cursor-level **autonomous orchestration** is the baseline, not a stretch goal:

| Target | Meaning for `/dashboard/agent` |
|--------|--------------------------------|
| **I ask, system executes** | Chat drives tools without manual terminal for basic repo inspection |
| **Read-only inspection auto-runs** | Grep, read, search, audit, trace, summarize — **no approval modal** when risk is read-only |
| **No Monaco for read-only audits** | Diff/preview cards on mobile; full IDE opt-in |
| **Clean loading + progress** | Structured feed (files read, search, duration), stop button, visible model/cost |
| **Mobile-first operator** | Session-first; one active surface; Chat / Diff / Preview / Logs |
| **Concurrent sessions** | Multiple agent runs visible with cost awareness |
| **Intentional browser automation** | iframe default; MYBROWSER only when explicit (chunk 01) |

---

## Primary rule

Every chunk traces **real live code** for:

`inneranimalmedia.com/dashboard/agent`

**In scope:** `dashboard/` → `dashboard/dist/` → R2 `static/dashboard/app/` → Worker routes that SPA calls.

**Out of scope (unless labeled LEGACY / STALE / NOT USED BY LIVE /dashboard/agent):**

- `agent-dashboard/` (not in repo, not served)
- Abandoned prototypes, alternate shells, stale dashboards
- Whole-repo audits unrelated to agent network tab

Canonical deploy doc: **`docs/AGENT_DASHBOARD.md`**

---

## How to read chunks

1. Read **Purpose** and **Live production scope**.
2. Confirm paths in **Existing live code paths** with `rg`.
3. Use **Repair backlog IDs** (`BNN-NNN`) in sprint planning — master list in chunk **25**.
4. Implement **Immediate next implementation step** before inventing new subsystems.

### Status labels

| Label | Meaning |
|-------|---------|
| **Draft** | Structure only; not fully verified |
| **Live-code verified** | Paths and flows confirmed in repo |
| **Sam validated** | Verified on production or approved sandbox |
| **Repair in progress** | Active fix branch |
| **Repaired** | Fix merged + validation recorded |
| **Embedded into production workflow** | Runbook / deploy / E2E updated |
| **R2 mirrored** | Copy uploaded to `inneranimalmedia-autorag` under `knowledge/agentsam/dashboard-agent-audit/` |

---

## R2 knowledge mirror

| Field | Value |
|-------|--------|
| Bucket | `inneranimalmedia-autorag` |
| Prefix | `knowledge/agentsam/dashboard-agent-audit/` |
| Repo source | `docs/dashboard-agent-audit/` |
| Upload script | `scripts/upload-dashboard-agent-audit-to-autorag.sh` |
| Manifest | [r2-upload-manifest.json](./r2-upload-manifest.json) |
| Upload status | [r2-upload-notes.md](./r2-upload-notes.md) — **pending** (2026-05-28: cloud agent token 401) |

After upload succeeds, mark relevant chunks **R2 mirrored** and re-index per chunk 22.

---

## Sprint order

### Sprint 0 — critical stabilization

| Chunk | File | Status |
|-------|------|--------|
| 00 | [00-series-conventions.md](./00-series-conventions.md) | Live-code verified |
| 01 | [01-dashboard-agent-shell.md](./01-dashboard-agent-shell.md) | Live-code verified |
| 02 | [02-dashboard-agent-deploy-and-r2-assets.md](./02-dashboard-agent-deploy-and-r2-assets.md) | Draft |
| 03 | [03-dashboard-agent-mobile-operator-ux.md](./03-dashboard-agent-mobile-operator-ux.md) | Live-code verified |
| 09 | [09-dashboard-agent-chat-sse-stream.md](./09-dashboard-agent-chat-sse-stream.md) | Draft |
| 10 | [10-dashboard-agent-surface-routing.md](./10-dashboard-agent-surface-routing.md) | Draft |
| 07 | [07-dashboard-agent-monaco-and-save-matrix.md](./07-dashboard-agent-monaco-and-save-matrix.md) | Draft |

### Sprint 1 — execution backbone

| 13 | [13-dashboard-agent-browser-tools-backend.md](./13-dashboard-agent-browser-tools-backend.md) | Draft |
| 14 | [14-dashboard-agent-terminal-and-pty.md](./14-dashboard-agent-terminal-and-pty.md) | Draft |
| 11 | [11-dashboard-agent-workspace-context.md](./11-dashboard-agent-workspace-context.md) | Draft |
| 12 | [12-dashboard-agent-approvals-and-tool-runs.md](./12-dashboard-agent-approvals-and-tool-runs.md) | Draft |

### Sprint 2 — file planes

| 05 | [05-dashboard-agent-r2-file-plane.md](./05-dashboard-agent-r2-file-plane.md) | Draft |
| 06 | [06-dashboard-agent-github-plane.md](./06-dashboard-agent-github-plane.md) | Draft |
| 08 | [08-dashboard-agent-google-drive.md](./08-dashboard-agent-google-drive.md) | Draft |
| 16 | [16-dashboard-agent-mcp-and-integrations.md](./16-dashboard-agent-mcp-and-integrations.md) | Draft |

### Sprint 3 — intelligence + automation

| 22 | [22-dashboard-agent-memory-and-indexing.md](./22-dashboard-agent-memory-and-indexing.md) | Live-code verified |
| 21 | [21-dashboard-agent-model-routing-and-costs.md](./21-dashboard-agent-model-routing-and-costs.md) | Draft (planned items labeled) |
| 17 | [17-dashboard-agent-knowledge-and-search.md](./17-dashboard-agent-knowledge-and-search.md) | Draft |
| 23 | [23-dashboard-agent-automation-workflows.md](./23-dashboard-agent-automation-workflows.md) | Draft |
| 24 | [24-dashboard-agent-e2e-validation.md](./24-dashboard-agent-e2e-validation.md) | Draft |
| 25 | [25-dashboard-agent-master-backlog.md](./25-dashboard-agent-master-backlog.md) | Live-code verified |

---

## Ownership table (suggested)

| Area | Primary chunk | Typical owner |
|------|---------------|---------------|
| Shell / tabs / surfaces | 01, 10 | Frontend |
| Deploy / R2 404 | 02 | Platform |
| Mobile operator UX | 03 | Frontend + design |
| Monaco / saves | 07 | Frontend |
| Chat SSE / progress UX | 09 | Frontend + Worker |
| Browser MYBROWSER | 01, 13 | Worker + frontend |
| Terminal / PTY | 14 | Worker + infra |
| R2 / GitHub / Drive files | 05–08 | Frontend + Worker |
| Model / cost / `/agentsam` cmds | 21 | Worker + product |
| Memory / indexing | 22 | Worker + data |
| E2E proof | 24 | QA |

---

## Backlog ID conventions

Format: **`B<chunk>-<seq>`** (e.g. `B03-001`)

- Chunk number = subsystem (03 = mobile)
- Seq = ordered item within chunk
- Master roll-up: chunk **25**

---

## Validation expectations

Before marking a chunk **Live-code verified**:

```bash
# Served UI only
test -d dashboard && test ! -d agent-dashboard

# Agent route
rg -n "AGENT_HOME_PATH|isAgentShellPath" dashboard/lib/agentRoutes.ts dashboard/App.tsx

# Production deploy path
rg -n '^DIST=|^PREFIX=' scripts/deploy-frontend.sh

# E2E entry
test -f tests/e2e/dashboard-agent-workbench.spec.ts
```

Production spot-check (with session): `curl -sI https://inneranimalmedia.com/dashboard/agent`

---

## Series index (all chunks)

| # | File |
|---|------|
| 00 | [00-series-conventions.md](./00-series-conventions.md) |
| 01 | [01-dashboard-agent-shell.md](./01-dashboard-agent-shell.md) |
| 02 | [02-dashboard-agent-deploy-and-r2-assets.md](./02-dashboard-agent-deploy-and-r2-assets.md) |
| 03 | [03-dashboard-agent-mobile-operator-ux.md](./03-dashboard-agent-mobile-operator-ux.md) |
| 04 | [04-dashboard-agent-local-filesystem.md](./04-dashboard-agent-local-filesystem.md) |
| 05 | [05-dashboard-agent-r2-file-plane.md](./05-dashboard-agent-r2-file-plane.md) |
| 06 | [06-dashboard-agent-github-plane.md](./06-dashboard-agent-github-plane.md) |
| 07 | [07-dashboard-agent-monaco-and-save-matrix.md](./07-dashboard-agent-monaco-and-save-matrix.md) |
| 08 | [08-dashboard-agent-google-drive.md](./08-dashboard-agent-google-drive.md) |
| 09 | [09-dashboard-agent-chat-sse-stream.md](./09-dashboard-agent-chat-sse-stream.md) |
| 10 | [10-dashboard-agent-surface-routing.md](./10-dashboard-agent-surface-routing.md) |
| 11 | [11-dashboard-agent-workspace-context.md](./11-dashboard-agent-workspace-context.md) |
| 12 | [12-dashboard-agent-approvals-and-tool-runs.md](./12-dashboard-agent-approvals-and-tool-runs.md) |
| 13 | [13-dashboard-agent-browser-tools-backend.md](./13-dashboard-agent-browser-tools-backend.md) |
| 14 | [14-dashboard-agent-terminal-and-pty.md](./14-dashboard-agent-terminal-and-pty.md) |
| 15 | [15-dashboard-agent-local-git-source-panel.md](./15-dashboard-agent-local-git-source-panel.md) |
| 16 | [16-dashboard-agent-mcp-and-integrations.md](./16-dashboard-agent-mcp-and-integrations.md) |
| 17 | [17-dashboard-agent-knowledge-and-search.md](./17-dashboard-agent-knowledge-and-search.md) |
| 18 | [18-dashboard-agent-home-and-recents.md](./18-dashboard-agent-home-and-recents.md) |
| 19 | [19-dashboard-agent-draw-and-media-tabs.md](./19-dashboard-agent-draw-and-media-tabs.md) |
| 20 | [20-dashboard-agent-command-palette.md](./20-dashboard-agent-command-palette.md) |
| 21 | [21-dashboard-agent-model-routing-and-costs.md](./21-dashboard-agent-model-routing-and-costs.md) |
| 22 | [22-dashboard-agent-memory-and-indexing.md](./22-dashboard-agent-memory-and-indexing.md) |
| 23 | [23-dashboard-agent-automation-workflows.md](./23-dashboard-agent-automation-workflows.md) |
| 24 | [24-dashboard-agent-e2e-validation.md](./24-dashboard-agent-e2e-validation.md) |
| 25 | [25-dashboard-agent-master-backlog.md](./25-dashboard-agent-master-backlog.md) |

**Last verified against repo:** 2026-05-28

**Next chunk recommended for full write:** [02-dashboard-agent-deploy-and-r2-assets.md](./02-dashboard-agent-deploy-and-r2-assets.md) (B02-001 stale bundles) or [09-dashboard-agent-chat-sse-stream.md](./09-dashboard-agent-chat-sse-stream.md) (B09-001 progress feed).
