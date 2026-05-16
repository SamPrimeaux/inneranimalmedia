# Agent Sam Studio — MovieMode

MovieMode is the AI-assisted media production orchestration layer under Agent Sam Studio. It does not replace Premiere, Resolve, or CapCut; it orchestrates:

`drive_import → analysis → edit plan → timeline → render → variants → R2 publish → CMS attach`

## Storage

- **R2:** binary media and renders (canonical bytes)
- **D1:** `media_assets`, `media_scenes`, `moviemode_projects`, `moviemode_timelines`, `moviemode_render_jobs`, `moviemode_exports`
- **Supabase:** planning mirror / observability (not video bytes)

### R2 prefix convention

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
