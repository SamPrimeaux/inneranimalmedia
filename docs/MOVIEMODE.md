# Agent Sam Studio — MovieMode

MovieMode is the AI-assisted media production orchestration layer under Agent Sam Studio. It does not replace Premiere, Resolve, or CapCut; it orchestrates:

`drive_import → analysis → edit plan → timeline → render → variants → R2 publish → CMS attach`

## Storage

- **ARTIFACTS R2:** canonical MovieMode export bytes (`artifacts/{scope}/{workspace_id}/export/{artifact_id}.webm`)
- **D1:** `agentsam_artifacts`, `media_assets`, `moviemode_projects`, `moviemode_timelines`, `moviemode_render_jobs`, `moviemode_exports`, `moviemode_edit_sessions`
- **KV:** ephemeral export job status + Veo job polling cache
- **Supabase:** planning mirror / observability (not video bytes)

### Export ingest flow

1. PTY runs `scripts/moviemode-remotion-render.mjs` → `RENDER_DONE`
2. Script POSTs bytes to `/api/moviemode/ingest` (X-Bridge-Key) → `finalizeMoviemodeOutput` writes ARTIFACTS + D1 rows
3. Job KV status moves `rendering` → `uploading` → `done`

### R2 prefix convention (project-scoped media)

```
moviemode/{workspace_id}/{project_slug}/source/{asset_id}/{filename}
moviemode/{workspace_id}/{project_slug}/proxy/{asset_id}/{filename}
moviemode/{workspace_id}/{project_slug}/renders/{render_id}/{filename}
moviemode/{workspace_id}/{project_slug}/exports/{variant_type}/{filename}
```

Legacy compatibility: `moviemode/{project_slug}/{variant_type}/{filename}`

## Render stack

| Layer | Role |
|-------|------|
| Remotion | Branded motion, React timelines, `@remotion/player` preview |
| ffmpeg / MoviePy | Clip assembly, loops, practical transcodes |
| Worker | Auth, metadata, multipart upload broker, job registry — **no heavy encode in Worker** |

## Dashboard media (prerequisite)

- File kind routing: text → Monaco; image/video/audio/pdf/binary → `FilePreview`
- R2 GET supports `Range` for video/audio seeking
- Uploads &gt; 100MB use `/api/r2/multipart/*`

## Timeline JSON

See `dashboard/src/types/moviemode.ts` — version `1`, tracks/clips with optional `r2: { bucket, key }` references.

## Active plan (Supabase)

`plan_agentsam_studio_moviemode` — Agent Sam Studio — MovieMode Architecture & ATC Pilot
