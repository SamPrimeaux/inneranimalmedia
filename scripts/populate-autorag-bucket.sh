#!/bin/bash
# Populate R2 bucket "autorag" with the Agent Sam tree (see docs/AUTORAG_BUCKET_STRUCTURE.md).
# Run from repo root: ./scripts/populate-autorag-bucket.sh
# Requires: ./scripts/with-cloudflare-env.sh, wrangler.production.toml, Cloudflare API token via with-cloudflare-env.

set -euo pipefail

BUCKET="autorag"
WRANGLER_CMD="./scripts/with-cloudflare-env.sh npx wrangler r2 object put"
REMOTE="-c wrangler.production.toml --remote"
TMPDIR="${TMPDIR:-/tmp}"
RUN_ID="autorag-$$"

put_object() {
  local REL_PATH="$1"
  local FILE="$2"
  echo "Put ${BUCKET}/${REL_PATH}"
  $WRANGLER_CMD "${BUCKET}/${REL_PATH}" --file="$FILE" --content-type=text/markdown $REMOTE
}

write_and_put() {
  local REL_PATH="$1"
  local FILE="${TMPDIR}/${RUN_ID}-${REL_PATH//\//-}"
  mkdir -p "$(dirname "$FILE")"
  cat > "$FILE"
  put_object "$REL_PATH" "$FILE"
}

cd "$(dirname "$0")/.."

echo "Populating autorag bucket (Agent Sam structure)..."

# --- knowledge/architecture ---
write_and_put knowledge/architecture/worker-core.md << 'EOF'
---
title: "Cloudflare Worker Core Architecture"
category: architecture
updated: 2026-03-22
importance: high
---

# Worker core

Single Worker (`worker.js`) serves public marketing routes, dashboard HTML and APIs, OAuth callbacks, and agent chat (SSE, tools).

## Request flow

1. URL dispatch: public vs dashboard vs `/api/*`.
2. Auth: session cookie; some routes internal or token-gated.
3. Handler returns HTML (R2-backed dashboard), JSON, or streamed SSE.

## Bindings (see wrangler.production.toml)

- `ASSETS`: public site assets.
- `DASHBOARD` / `agent-sam`: dashboard static files.
- `R2` / `iam-platform`: long-form memory, knowledge paths, docs (not the `autorag` bucket).
- `DB`: D1 `inneranimalmedia-business`.
- `AI`, `VECTORIZE` / `VECTORIZE_INDEX`: embeddings and retrieval.
- `AI_SEARCH`: AI Search instance name in config (used with Cloudflare AI products).

## RAG (summary)

Retrieval helpers query Vectorize and may resolve text from `R2` metadata. This `autorag` bucket is the curated AI Search corpus; keep it small and current.

## Deploy

Production: `./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml` (only when Sam approves deploy). Repo rule: use project deploy scripts, not ad-hoc wrangler at root without config.
EOF

write_and_put knowledge/architecture/database-schema.md << 'EOF'
---
title: "D1 database overview"
category: architecture
updated: 2026-03-22
importance: high
---

# D1 (inneranimalmedia-business)

Use `docs/memory/AGENT_MEMORY_SCHEMA_AND_RECORDS.md` and migrations in-repo for authoritative DDL. This file is a non-dump summary for RAG.

## Canonical tables (examples)

- **agent_memory_index**: keyed memory (`today_todo`, `active_priorities`, `build_progress`, etc.).
- **agent_telemetry**, **spend_ledger**: usage and cost signals.
- **project_time_entries**: time tracking.
- **agent_sessions**, **agent_messages**: chat persistence.
- **ai_models**, **cloudflare_deployments**, **projects**: catalog and deploy history.
- **roadmap_steps**: dashboard plan steps (e.g. `plan_iam_dashboard_v1`).
- **ai_knowledge_base**, **ai_compiled_context_cache**, **ai_rag_search_history**: knowledge and RAG logging.

## Rule

Prefer extending these tables over creating overlapping ones. No full SQL dumps in this bucket.
EOF

write_and_put knowledge/architecture/r2-storage.md << 'EOF'
---
title: "R2 storage layout"
category: architecture
updated: 2026-03-22
---

# R2 buckets (conceptual)

| Bucket | Role |
|--------|------|
| **agent-sam** | Dashboard static assets, worker source backup keys, screenshots pipeline. |
| **iam-platform** | Memory and knowledge: `memory/`, `knowledge/`, `docs/` for compiled context and tooling. |
| **autorag** | Curated markdown for AI Search indexing only (this tree). |
| **inneranimalmedia-assets** | Public marketing assets (ASSETS binding). |

## Practice

Worker + dashboard source of truth lives in git; R2 holds operational and served copies. Do not store secrets in buckets.
EOF

write_and_put knowledge/architecture/api-endpoints.md << 'EOF'
---
title: "API surface (overview)"
category: architecture
updated: 2026-03-22
---

# API groups (non-exhaustive)

Paths are implemented in `worker.js` (search for `pathname` / `pathLower`).

## Auth and OAuth

- Google and GitHub OAuth callbacks are locked; do not modify without explicit review.
- Session-backed routes use authenticated user resolution.

## Agent and RAG

- `/api/agent/chat`, streaming and modes (Ask / Plan / Agent / Debug).
- `/api/search`, `/api/agent/rag/query`, federated search where configured.
- MCP-related `/api/mcp/*` routes for tooling and audit.

## Platform

- Settings, themes, workspaces, billing hooks, internal post-deploy hooks as documented in-repo.

## Rule

For exact methods and payloads, read the handler in `worker.js` or OpenAPI docs if present. This file stays high level to limit token bloat.
EOF

# --- knowledge/features ---
write_and_put knowledge/features/agent-modes.md << 'EOF'
---
title: "Agent Sam mode system"
category: features
updated: 2026-03-22
---

# Modes

## Ask

Quick answers; smaller context budget; tools off in typical configuration.

## Plan

Architecture and multi-step reasoning; broader context; diagram/visualizer where enabled.

## Agent

Tool use, MCP, autonomous steps. RAG may inject when user message is long enough and backend returns useful chunks (see `worker.js` caps).

## Debug

Schema- and ops-focused tools (terminal, D1, R2 read/list). Use for investigation, not production user flows.

## Cost note

Actual token and dollar figures change with models and caps; treat numbers in old docs as approximate.
EOF

write_and_put knowledge/features/mcp-tools.md << 'EOF'
---
title: "MCP integration"
category: features
updated: 2026-03-22
---

# MCP

## Endpoint

Project MCP is configured in `.cursor/mcp.json`. Remote endpoint and health check are documented in `.cursor/rules/mcp-reference.mdc`.

## Worker

MCP API routes (allowlist, credentials, audit, stats) require auth. Chat path can invoke tools by name when the agent requests them.

## Registry

Do not duplicate the full tool list here; it changes with server versions. Prefer querying the MCP `tools/list` or dashboard UI for the live registry.
EOF

write_and_put knowledge/features/monaco-editor.md << 'EOF'
---
title: "Monaco editor (dashboard)"
category: features
updated: 2026-03-22
---

# Monaco

Used in the agent dashboard for code-style editing. Alignment with panels, themes, and preview is an active UX concern.

## Guidance

- Follow dashboard patterns for loading static assets from `agent-sam` / Vite build output.
- Large refactors go through the same deploy and R2 upload rules as other dashboard files.
EOF

write_and_put knowledge/features/visualizer.md << 'EOF'
---
title: "Diagrams and visualizer"
category: features
updated: 2026-03-22
---

# Visualizer

Plan mode and related flows may emit diagrams (Mermaid or similar) inline in chat.

## Constraints

Keep diagrams small; prefer linking to repo docs for large architecture. Update this stub when the concrete library and limits are finalized in UI.
EOF

# --- knowledge/workflows ---
write_and_put knowledge/workflows/deploy-process.md << 'EOF'
---
title: "Deploy process"
category: workflows
updated: 2026-03-22
---

# Deploy

## Main worker

From repo root, with env wrapper:

`./scripts/with-cloudflare-env.sh npx wrangler deploy -c wrangler.production.toml`

Only run when Sam types **deploy approved**. Never deploy unnamed workers or create new Cloudflare resources without confirmation.

## Dashboard HTML

If `dashboard/*.html` changes, upload to `agent-sam` under `static/dashboard/` before deploy (see `.cursor/rules/dashboard-r2-before-deploy.mdc`).

## MCP server

Separate package under `inneranimalmedia-mcp-server/` with its own `wrangler.toml`; never deploy it with the root worker config.

## Recording

Use project scripts to record deployments in D1 when applicable (`cloudflare_deployments` / team workflow).
EOF

write_and_put knowledge/workflows/r2-upload.md << 'EOF'
---
title: "R2 upload patterns"
category: workflows
updated: 2026-03-22
---

# R2 uploads

Always use `./scripts/with-cloudflare-env.sh` so the API token loads.

Example (dashboard file):

`./scripts/with-cloudflare-env.sh npx wrangler r2 object put agent-sam/static/dashboard/example.html --file=dashboard/example.html --content-type=text/html --remote -c wrangler.production.toml`

Example (this bucket):

`./scripts/with-cloudflare-env.sh npx wrangler r2 object put autorag/context/active-priorities.md --file=/path/to/file.md --content-type=text/markdown --remote -c wrangler.production.toml`

`--remote` targets production; without it, only local R2 emulator is affected.
EOF

write_and_put knowledge/workflows/testing.md << 'EOF'
---
title: "Testing practices"
category: workflows
updated: 2026-03-22
---

# Testing

- Prefer targeted API tests and manual dashboard checks after auth.
- OAuth and session flows: test in staging or controlled accounts; never paste tokens into docs.
- RAG: verify with short queries related to documents you just indexed; check latency and empty results.

Add project-specific automated test commands here when they are stable in CI.
EOF

# --- knowledge/decisions ---
write_and_put knowledge/decisions/why-cloudflare.md << 'EOF'
---
title: "ADR: Cloudflare as primary platform"
category: decisions
updated: 2026-03-22
---

# Why Cloudflare

Workers for edge compute, R2 for object storage, D1 for relational data, KV for session state, and AI bindings for embeddings and search align with a single-vendor operational story and low cold-start latency at the edge.

Details belong in business strategy docs; this ADR stub is for RAG context only.
EOF

write_and_put knowledge/decisions/single-worker.md << 'EOF'
---
title: "ADR: Single worker monolith"
category: decisions
updated: 2026-03-22
---

# Single worker

One primary Worker file routes all production traffic for Inner Animal Media dashboard and APIs to reduce cross-service auth complexity and deployment coordination.

Tradeoff: file size grows; mitigate with strict sections and internal helpers. Splitting services requires explicit architecture review.
EOF

write_and_put knowledge/decisions/token-optimization.md << 'EOF'
---
title: "ADR: Token and context optimization"
category: decisions
updated: 2026-03-22
---

# Token optimization

Mode-specific context builders and hard caps reduced average input size for Ask mode and related paths.

## Principle

Ship the smallest system prompt that preserves safety and task correctness; measure with telemetry and cost tables in D1.

## Links

See historical session entries for the token-efficiency initiative; keep this file summary-level.
EOF

# --- plans/templates ---
write_and_put plans/templates/feature-plan-template.md << 'EOF'
---
title: "Feature plan template"
category: planning
updated: 2026-03-22
---

# [Feature name]

## Goal

One sentence problem statement.

## Current state

What exists today (repos, routes, data).

## Proposed approach

High-level design and dependencies.

## Steps

### Phase 1

1. Step (owner, ETA).

### Phase 2

1. Step.

## Testing

- [ ] Case A
- [ ] Case B
- [ ] Rollback path

## Cost and risk

Brief note on tokens, dollars, and operational risk.
EOF

write_and_put plans/templates/refactor-plan-template.md << 'EOF'
---
title: "Refactor plan template"
category: planning
updated: 2026-03-22
---

# [Refactor name]

## Motivation

Why change working code.

## Scope

Files and behaviors in scope; explicit non-goals.

## Steps

1. Baseline tests or manual checks.
2. Mechanical rename or extraction.
3. Behavior verification.

## Risk

User impact, deploy ordering, feature flags.
EOF

write_and_put plans/templates/architecture-plan-template.md << 'EOF'
---
title: "Architecture plan template"
category: planning
updated: 2026-03-22
---

# [System area]

## Context

Users, data flows, and external systems.

## Target architecture

Components and boundaries (Worker, D1, R2, MCP, clients).

## Migration

Phased cutover; backward compatibility.

## Open questions

Decisions still needed.
EOF

# --- plans/executed ---
write_and_put plans/executed/token-efficiency-2026-03-18.md << 'EOF'
---
title: "Executed: token efficiency initiative"
category: executed
date: 2026-03-18
updated: 2026-03-22
---

# Token efficiency (2026-03-18)

## Summary

Reduced Ask-mode prompt size via mode-specific builders and caps.

## Outcomes

Large drop in average input tokens for short queries; verify current metrics in D1 and dashboards.

## Follow-up

Keep caps aligned with model changes; monitor regressions when adding new tools or RAG.
EOF

write_and_put plans/executed/phase-2-monaco-2026-03-16.md << 'EOF'
---
title: "Executed / planned: Monaco phase 2"
category: executed
date: 2026-03-16
updated: 2026-03-22
---

# Monaco phase 2

## Intent

Improve editor alignment, approvals, and agent execution UX in the dashboard.

## Status

Update this file when milestones ship. Link to roadmap steps in D1 (`roadmap_steps`) for canonical status.
EOF

# --- context ---
write_and_put context/active-priorities.md << 'EOF'
---
title: "Active priorities"
updated: 2026-03-22
---

# Active priorities

Source of truth: D1 `agent_memory_index` key `active_priorities` (tenant `system`) and `today_todo`.

## How to use this file

Snapshot for AI Search. Refresh after significant planning sessions. Do not duplicate long task lists from the session log verbatim.
EOF

write_and_put context/technical-debt.md << 'EOF'
---
title: "Technical debt tracker"
updated: 2026-03-22
---

# Technical debt

## Process

Track P0/P1 issues in roadmap and memory keys. This file summarizes themes for RAG (tests, legacy routes, RAG fallback behavior, dashboard debt).

## Examples (generic)

- Legacy tables or columns pending migration.
- Dashboard bundle size and cache busting.
- Documentation drift between worker and MCP versions.

Update monthly or when debt spikes.
EOF

write_and_put context/cost-tracking.md << 'EOF'
---
title: "Cost tracking"
updated: 2026-03-22
---

# Cost tracking

## Sources

- D1: `spend_ledger`, `agent_telemetry`, provider dashboards.
- AI Gateway and Anthropic usage as wired in production.

## Practice

Attribute deploys and experiments; avoid unbounded agent loops on expensive models. Numbers change; use this file for qualitative guardrails, not accounting.
EOF

echo ""
echo "Done. Uploaded curated tree to bucket: ${BUCKET}"
echo "Next: AI Search dashboard - point data source at this bucket and sync (see docs/AUTORAG_BUCKET_STRUCTURE.md)."
echo "Optional: ./scripts/populate-autorag.sh still uploads knowledge/skills from docs if those paths exist."
