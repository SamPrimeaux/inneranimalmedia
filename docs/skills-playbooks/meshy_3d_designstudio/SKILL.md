# Meshy 3D Design Studio Agent

**Skill key:** `meshy_3d_designstudio`  
**Slash trigger:** `/meshy`  
**Scope:** workspace  
**Task types:** `agent`, `plan`, `cad_generation`

## Purpose

Production Meshy lane for **Design Studio** — text/image → 3D preview → refine → R2 GLB → scene spawn. Uses **InnerAnimal Worker** APIs and D1 (`agentsam_cad_jobs`), **not** local `meshy_output/` scripts or `MESHY_API_KEY` bash skills.

Upstream reference skills (`~/.agents/skills/meshy-3d-*` from [meshy-dev/meshy-3d-agent](https://github.com/meshy-dev/meshy-3d-agent)) are for **local R&D only**. AgentSam always routes through `/api/cad/meshy/*`.

## Production vs local

| Concern | Production (this skill) | Local dev only |
|---------|----------------------|----------------|
| API key env | Worker secret `MESHYAI_API_KEY` | `MESHY_API_KEY` in shell |
| Output | R2 `cad/exports/…` + `cms_assets` | `./meshy_output/` |
| Job SSOT | `agentsam_cad_jobs` | JSON metadata files |
| Completion | Webhook `POST /api/webhooks/meshy` + poll | Python poll scripts |
| UI | `/dashboard/designstudio` | Blender Meshy panel |

## Orchestration sequence

1. **Parent run** — User invokes `/meshy` or Design Studio CAD intent. Create parent `agentsam_agent_run` + `agentsam_spawn_job`:
   - `master_agent_slug` = `meshy_3d_designstudio`
   - `subagent_slug` = `meshy_balance_preflight`
   - `merged_output` = `{ "prompt", "mode": "text"|"image", "image_url?", "workspace_id", "scene_id?" }`
   - `status` = `pending`

2. **meshy_balance_preflight** — Credit guard:
   - Call Worker balance proxy (or `meshyai_*` in-process once auth fixed)
   - Meshy [Balance API](https://docs.meshy.ai/en/api/balance): need ≥ **30 credits** for Meshy 6 preview+refine text path (20 preview + 10 refine); other models need ≥ **20** (10 + 10) ([pricing](https://docs.meshy.ai/en/api/pricing))
   - Patch `merged_output.credits_available`, `merged_output.preflight_ok`
   - On 402 / low balance → `status=failed`, user message with billing link

3. **meshy_cad_generate** — Create job:
   - **Text:** `meshyai_text_to_3d` → `POST /api/cad/meshy/generate` with `{ prompt, mode: "text" }`
   - **Image:** `meshyai_image_to_3d` → same route with `{ mode: "image", image_url }` (CF Images public/signed URL)
   - Worker creates `agentsam_cad_jobs` row; returns `job_id`, `external_task_id`
   - Patch `merged_output.cad_job_id`, `merged_output.meshy_preview_task_id`
   - **Must chain preview → refine** on Worker (Phase 0): second task stores `meshy_refine_task_id`

4. **meshy_cad_wait** — Completion (webhook-first, poll fallback):
   - Prefer webhook: job moves `pending` → `running` → `done` via `/api/webhooks/meshy`
   - Fallback: `meshyai_get_task` → `GET /api/cad/meshy/status/:jobId` every 5–15s (max 10 min)
   - On `SUCCEEDED`: Worker ingests GLB → R2, `finalizeCadJobComplete`, SSE `cad_glb_ready`
   - Patch `merged_output.r2_key`, `public_url`, `progress_pct`

5. **meshy_scene_deploy** — Design Studio linkage:
   - If `scene_id` present: attach GLB to scene snapshot via designstudio sync API
   - Else: return `public_url` for manual spawn in viewport
   - Insert usage row: `spend_ledger` with `consumed_credits` from webhook payload when present

6. **meshy_postprocess_router** (optional branch):
   - User asks remesh/convert/rig/animate → spawn child job with `parent_job_id`
   - Maps to Meshy v1 APIs: [remesh](https://docs.meshy.ai/en/api/remesh), [convert](https://docs.meshy.ai/en/api/convert), [rigging](https://docs.meshy.ai/en/api/rigging), [animation](https://docs.meshy.ai/en/api/animation)
   - Each child row in `agentsam_cad_jobs` with `meshy_task_type` column (Phase 2 migration)

## Loop state (`agentsam_spawn_job`)

| Field | Usage |
|-------|--------|
| `master_agent_slug` | `meshy_3d_designstudio` |
| `subagent_slug` | Current pipeline step |
| `merged_output` | See shape below |
| `status` | `pending` → `running` → `completed` / `failed` |
| `total_cost_usd` | Optional USD estimate from credits × plan rate |

### `merged_output` shape

```json
{
  "prompt": "low poly red fox",
  "mode": "text",
  "image_url": null,
  "cad_job_id": "cadj_abc123",
  "meshy_preview_task_id": "018a…",
  "meshy_refine_task_id": "018b…",
  "credits_available": 842,
  "preflight_ok": true,
  "r2_key": "cad/exports/tenant_sam_primeaux/ws_inneranimalmedia/cadj_abc123.glb",
  "public_url": "https://inneranimalmedia.com/assets/glb/…",
  "scene_id": "ds_scene_…",
  "postprocess": null
}
```

## Worker routes (SSOT)

| Route | Method | Role |
|-------|--------|------|
| `/api/cad/meshy/generate` | POST | Start text/image job |
| `/api/cad/meshy/status/:jobId` | GET | Poll + apply task state |
| `/api/webhooks/meshy` | POST | Meshy task webhooks |
| `/api/cad/meshy/balance` | GET | Credit preflight (Phase 0) |

Secrets: `MESHYAI_API_KEY`, `MESHYAI_WEBHOOK_SECRET` — sync via `./scripts/sync-meshy-api-key.sh` and `./scripts/sync-meshy-webhook-secret.sh`.

## Agent tools (`meshyai_*`)

| Tool | Worker route | Notes |
|------|--------------|-------|
| `meshyai_text_to_3d` | POST generate | Requires in-process auth (no bare HTTP to IAM_ORIGIN) |
| `meshyai_image_to_3d` | POST generate | Must set `mode: "image"` + `image_url` |
| `meshyai_get_task` | GET status/:id | Uses internal `cad_job_id`, not raw Meshy UUID |

Register in D1 `agentsam_tools`; allow on routes `design_studio`, `cad_generation`.

## Vector lanes (RAG / ingest)

| Step | Lane | Filter / source |
|------|------|-----------------|
| Playbook retrieval | DOCUMENTS | `source_type = 'skill_playbook'`, skill_key `meshy_3d_designstudio` |
| API param lookup | DOCUMENTS | Meshy docs chunks (optional ingest of `docs.meshy.ai/llms.txt` excerpts) |
| Implementation | CODE | `src/api/cad.js`, `meshy-cad-sync.js`, `dashboard/components/designstudio/**` |
| Accepted GLB metadata | MEDIA | Embed thumbnail + job summary after `done` (optional) |

**Ingest this playbook:**

```bash
npm run run:ingest_skill_playbooks
# or dry-run:
npm run run:ingest_skill_playbooks:dry-run
```

Flow: `docs/skills-playbooks/meshy_3d_designstudio/SKILL.md` → R2 `inneranimalmedia-autorag/skills/meshy_3d_designstudio/SKILL.md` → chunk → OpenAI embed → Supabase `agentsam_documents_oai3large_1536` → Vectorize `AGENTSAM_VECTORIZE_DOCUMENTS` (`source_type=skill_playbook`).

Runtime hydration: D1 `agentsam_skill.retrieval_strategy = 'r2'` → `hydrateSkillRowFromR2()` in Worker.

## R2 layout

| Prefix | Content |
|--------|---------|
| `skills/meshy_3d_designstudio/SKILL.md` | This playbook (AUTORAG bucket) |
| `cad/exports/{tenant}/{workspace}/{job_id}.glb` | Completed Meshy meshes (ASSETS bucket) |
| `tools/blender/meshy-blender-plugin-v0.6.0.zip` | Optional mirror; canonical copy in git `tools/blender/` |

## Blender handoff

1. Install plugin: `tools/blender/README.md`
2. **Bridge ON** → `localhost:5324`
3. Import GLB from Meshy panel or future Design Studio “Send to Blender”

Animated/rigged exports: [Blender animated models](https://docs.meshy.ai/en/blender-plugin/animated-models).

## Meshy API surface (Worker roadmap)

Aligned with [Meshy MCP tools](https://docs.meshy.ai/en/api/ai):

| Category | MCP tool names | Worker phase |
|----------|----------------|--------------|
| Generate | `meshy_text_to_3d`, `meshy_text_to_3d_refine`, `meshy_image_to_3d`, `meshy_multi_image_to_3d` | P0–P1 |
| Post-process | `meshy_remesh`, `meshy_retexture`, `meshy_rig`, `meshy_animate` | P2–P3 |
| 2D | `meshy_text_to_image`, `meshy_image_to_image` | P2 (or use `imgx_*`) |
| Ops | `meshy_get_task_status`, `meshy_list_tasks`, `meshy_cancel_task`, `meshy_check_balance` | P0–P2 |

## Config (`agentsam_skill.metadata_json`)

| Field | Default | Meaning |
|-------|---------|---------|
| `master_agent_slug` | `meshy_3d_designstudio` | Spawn router |
| `pipeline` | see migration 665 | Ordered sub-agent slugs |
| `min_credits_text_full` | `30` | Preview + refine (Meshy 6 worst case: 20 + 10) |
| `min_credits_image_textured` | `30` | Image-to-3D with texture (Meshy 6) |
| `poll_interval_sec` | `8` | Status poll backoff base |
| `auto_refine` | `true` | Chain refine after preview |
| `auto_scene_deploy` | `true` | Link GLB when scene context present |

## Sub-agent slugs

- `meshy_balance_preflight`
- `meshy_cad_generate`
- `meshy_cad_wait`
- `meshy_scene_deploy`
- `meshy_postprocess_router`

## Prerequisites

1. `MESHYAI_API_KEY` + `MESHYAI_WEBHOOK_SECRET` on Worker (production)
2. Meshy webhook URL: `https://inneranimalmedia.com/api/webhooks/meshy`
3. Migration `665_meshy_3d_designstudio_skill.sql` applied
4. `npm run run:ingest_skill_playbooks` after editing this file
5. Phase 0 Worker: preview→refine chain + agent tool in-process auth

## Verification

```bash
# API key on Worker (local file only)
./scripts/sync-meshy-api-key.sh --check

# Webhook smoke
curl -sS -X POST 'https://inneranimalmedia.com/api/webhooks/meshy' \
  -H 'Content-Type: application/json' \
  -d '{"id":"test-smoke","status":"IN_PROGRESS","progress":50}'

# D1 skill row
# ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
#   --remote -c wrangler.production.toml \
#   --command "SELECT id, slash_trigger, retrieval_strategy, file_path FROM agentsam_skill WHERE id='skill_meshy_3d_designstudio'"

# Latest CAD job
# --command "SELECT id, engine, status, external_task_id, r2_key FROM agentsam_cad_jobs WHERE engine='meshy' ORDER BY created_at DESC LIMIT 5"

# Vectorize chunks
# Supabase: SELECT COUNT(*) FROM agentsam.agentsam_documents_oai3large_1536
#   WHERE source_type='skill_playbook' AND metadata->>'skill_key'='meshy_3d_designstudio';
```

## External references

- [Text to 3D v2](https://docs.meshy.ai/en/api/text-to-3d) — preview + refine workflow
- [Image to 3D](https://docs.meshy.ai/en/api/image-to-3d)
- [Webhooks](https://docs.meshy.ai/en/api/webhooks)
- [AI Integration / MCP](https://docs.meshy.ai/en/api/ai)
- [Pricing (credits)](https://docs.meshy.ai/en/api/pricing)
