# Design Studio — architecture

---

## Frontend

| Component | Path |
|-----------|------|
| Page | `dashboard/components/DesignStudioPage.tsx` |
| Shell | `dashboard/components/designstudio/cad-studio/CadStudioShell.tsx` |
| Engine | `dashboard/services/AgentSamEngine.ts` (Three.js) |
| APIs client | `dashboard/components/designstudio/api.ts` |
| Hooks | `useDesignStudioCad.ts`, `useCadJobPoll.ts` |

---

## Backend

| API | Path |
|-----|------|
| CAD jobs | `src/api/cad.js` |
| Meshy | `src/api/cad-meshy.js` |
| Blueprints | `src/api/designstudio/index.js` |
| Router | `src/core/iam-illustration-router.js` |
| Dispatch | `src/core/cad-dispatch.js` |
| Complete | `src/core/cad-job-complete.js` |

---

## Execution

**Production (LOCKED):** Cloudflare Container `iam-cad-worker` only  
(`CAD_DISPATCH_TARGET=container`). GCP `iam-tunnel` is not CAD-capable — see
[`docs/platform/iam-tunnel-vm-role-2026-07.md`](../../platform/iam-tunnel-vm-role-2026-07.md).

```
Job POST → agentsam_cad_jobs (D1)
  → iam-cad-worker (CF container: OpenSCAD / Blender / FreeCAD)
  → R2 cad bucket → cad.inneranimalmedia.com/{key}.glb
  → SSE cad_glb_ready → viewport spawn
```

Legacy `cad-job-runner.mjs` / ExecOS one-shots are **not** used for production Design Studio CAD.
---

## Data

| Table | Role |
|-------|------|
| `designstudio_design_blueprints` | Intent, phases, sketch JSON |
| `agentsam_cad_jobs` | Job queue and status |
| `cms_assets` | Stock GLB (`3d_studio`) |
| `agentsam_openscad_libraries` | Library resolver |

---

## Agent integration

- `route_key: design_studio` — `dashboardRouteContext.ts`
- Default `task_type: design_studio_base`
- Typed operators select bounded profiles:
  - `cad_generation`
  - `meshy_generate`
  - `meshy_transform`
  - `meshy_animation`
  - `meshy_manage`
- `agentsam_tool_profile_bindings` + `agentsam_tool_profiles` own model tool menus and caps
- `agentsam_prompt_routes` owns prompt/model routing only; its tool menu fields are retired
- Surface events — `designStudioEvents.ts`
- Default subagent: `cadcreator`

---

## Related

- [../../platform/design-cad-draw-inventory-2026-07.md](../../platform/design-cad-draw-inventory-2026-07.md)
