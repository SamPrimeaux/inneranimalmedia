---
name: meshy-3d-designstudio
description: Design Studio production Meshy lane — text/image to 3D via Worker /api/cad/meshy, webhooks, R2, scene deploy. Use for /meshy, CAD generation, agentsam_cad_jobs, or when user asks to generate 3D in Design Studio. Do NOT use local meshy_output bash skills for production deliverables.
---

# Meshy 3D — Design Studio (Production)

Load the full playbook from R2/D1: **`agentsam_skill` id `skill_meshy_3d_designstudio`**, slash **`/meshy`**.

Canonical repo copy: `docs/skills-playbooks/meshy_3d_designstudio/SKILL.md`

## Rules

1. **Production path:** `POST /api/cad/meshy/generate` → webhook or `GET /api/cad/meshy/status/:jobId` → R2 GLB → Design Studio scene.
2. **Secrets:** Worker `MESHYAI_API_KEY` (not `MESHY_API_KEY` in Worker code). Local alias OK for Blender only.
3. **Text-to-3D:** Always **preview then refine** ([Meshy two-step](https://docs.meshy.ai/en/api/text-to-3d)).
4. **Image-to-3D:** `mode: "image"` + public `image_url` (prefer CF Images from workspace).
5. **Credits:** Preflight balance; text full path ~15 credits, image textured ~30 ([pricing](https://docs.meshy.ai/en/api/pricing)).
6. **Local meshy-3d-* skills** (`~/.agents/skills/`): R&D and Blender print only — not client-facing output.

## Tools

- `meshyai_text_to_3d`, `meshyai_image_to_3d`, `meshyai_get_task` → `/api/cad/meshy/*`
- `agentsam_r2_put` / scene APIs after job `done`

## Blender

Pinned plugin: `tools/blender/meshy-blender-plugin-v0.6.0.zip` — see `tools/blender/README.md`.

## Ingest playbook to Vectorize

```bash
npm run run:ingest_skill_playbooks
```
