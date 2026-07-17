# Design Studio — Agent Sam compass

**Full technical compass:** [../../inneranimalmedia/product/designstudio/AGENTSAM.md](../../inneranimalmedia/product/designstudio/AGENTSAM.md)

---

## Summary

- Default profile: `design_studio_base`
- Broad CAD intake: `cad_generation` (`cad_generate`)
- Meshy profiles: `meshy_generate`, `meshy_transform`, `meshy_animation`, `meshy_manage`
- Route: `/dashboard/designstudio` — `route_key: design_studio`
- Subagent: `cadcreator`
- Sam Sketch project: `proj_mrb5shkc_3kos2c`

`illustration_create` is a high-level Create/CAD intake envelope, not the API for
Meshy generation, transformation, rigging, animation, or task administration.
Only canonical `meshy_*` keys are model-visible; legacy `meshyai_*` names resolve
through compatibility aliases.

Browser-local scene selection, transforms, materials, and exports remain typed
Studio actions. Do not register fake server tools for operations that require the
live Three.js scene.

---

## Proposed agent portfolio

| Agent slug | Lane | Primary | Purpose |
|---|---|---|---|
| `cadcreator` | L2 | Codex | Existing subagent — repo + terminal |
| `design_director` | L4 | Sol | Multi-engine projects |
| `visual_inspector` | L5 | Gemini 3.5 Flash | Rendered output QA |
| `job_operator` | L1 | Terra | CAD job status, R2 paths |

Full roster: [`plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md`](../../plans/active/AGENTSAM-PORTFOLIO-PROPOSALS-2026-07.md)

---

## Related

- [../create/AGENTSAM.md](../create/AGENTSAM.md)
