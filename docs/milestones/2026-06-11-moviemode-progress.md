---
title: MovieMode progress — 2026-06-11
topic: moviemode
lane_key: docs_knowledge_search
doc_type: team_milestone
milestone_date: 2026-06-11
git_refs: migrations/617,618; docs/MOVIEMODE.md
tags:
  - moviemode
  - agent-sam-studio
  - stream
  - remotion
  - team-milestone
---

# MovieMode progress — 2026-06-11

## Summary

MovieMode is the Agent Sam Studio media orchestration lane: `drive_import → analysis → edit plan → timeline → render → variants → R2 publish → CMS attach`. June 11 work shipped templates, live Stream inputs, webhooks, and conversion job scaffolding — **not** a full codebase reindex target; this milestone doc is the RAG source of truth.

## Shipped

| Area | What |
|------|------|
| **Templates** | Migration `617` — starter pack `starter-broll` (3 public Stream clips); `GET /api/moviemode/templates`, `POST …/apply` |
| **Live inputs** | Migration `618` — `moviemode_live_inputs`; `GET/POST /api/stream/live-inputs` |
| **Stream webhooks** | VOD + live webhook registry (`wh_stream_vod`, `wh_stream_live`); install via `scripts/stream-install-webhooks.mjs` |
| **Conversions** | `moviemode_conversion_jobs` + `moviemode_conversions`; ffmpeg / CloudConvert / PTY path |
| **Export ingest** | PTY `moviemode-remotion-render.mjs` → `RENDER_DONE` → `POST /api/moviemode/ingest` → ARTIFACTS R2 + D1 |
| **Docs** | `docs/MOVIEMODE.md`, `services/moviemode-service/README.md` |

## Storage contract

| Layer | Role |
|-------|------|
| ARTIFACTS R2 | Canonical export bytes `artifacts/{scope}/{workspace_id}/export/{artifact_id}.webm` |
| D1 | `moviemode_projects`, `moviemode_timelines`, `moviemode_render_jobs`, `moviemode_exports`, `media_assets`, … |
| KV | Ephemeral job status + Veo polling |
| Supabase | Planning mirror only — **not** video bytes |

R2 prefix: `moviemode/{workspace_id}/{project_slug}/source|proxy|renders|exports/…`

## Render stack

- **Remotion** — branded motion, `@remotion/player` preview
- **ffmpeg / MoviePy** — clip assembly (heavy encode **not** in Worker)
- **Worker** — auth, metadata, multipart broker, job registry

## Open / next

- Enable worker observability on moviemode-service deploys before debug sessions
- Connor workspace isolation verified (`622`) — keep MovieMode scope per `workspace_id`
- Vector lane: `AGENTSAM_VECTORIZE_DOCUMENTS` via team milestone ingest (this file), not full `reindex_codebase_dashboard_agent`

## Agent Sam retrieval

| Question | Lane |
|----------|------|
| What shipped in MovieMode this week? | `docs_knowledge_search` (this milestone) |
| Handler / route implementation | `code_semantic_search` |
| D1 table shapes | `schema_semantic_search` |
