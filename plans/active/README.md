# Active tickets

Work **in this order**. Do not parallelize product remasters across these.

| Order | Ticket | D1 id | Outcome |
|-------|--------|-------|---------|
| 0 | [ROUTING-TOOL-SSOT-E2E.md](./ROUTING-TOOL-SSOT-E2E.md) | `tkt_routing_tool_ssot` | Gate green ×2 before any more tool-profile JS |
| 1 | [WORKSPACE-001-agent-repo-edit-loop.md](./WORKSPACE-001-agent-repo-edit-loop.md) | `tkt_workspace_001` | One safe repo edit via Agent Sam |
| 2 | [CMS-001-edit-publish-inneranimalmedia-home.md](./CMS-001-edit-publish-inneranimalmedia-home.md) | `tkt_cms_001` | Homepage edit + publish |
| 3 | [DESIGNSTUDIO-001-sam-sketch-persistent-artifact.md](./DESIGNSTUDIO-001-sam-sketch-persistent-artifact.md) | `tkt_designstudio_001` | Sketch → persistent model |
| 4 | [DESIGNSTUDIO-002-dream-home-artifact-engine.md](./DESIGNSTUDIO-002-dream-home-artifact-engine.md) | `tkt_designstudio_002` | OpenSCAD smoke + FreeCAD dream-home MVP (`proj_mrb5shkc_3kos2c`) |
| 5 | [DESIGNSTUDIO-003-architectural-plan-lane.md](./DESIGNSTUDIO-003-architectural-plan-lane.md) | `tkt_designstudio_003` | PlanGraph bridge → FreeCAD + viz lineage contracts for 004 |
| 6 | [DESIGNSTUDIO-004-freecad-blender-visualization.md](./DESIGNSTUDIO-004-freecad-blender-visualization.md) | `tkt_designstudio_004` | FreeCAD → VisualizationPackage → Blender (deferred; blocked by 003) |

## Verification law (LOCKED)

- **Deploy success ≠ pass.** A ticket may not move to `shipped` until `consecutive_pass_count >= required_pass_count` (default **2**) with rows in `agentsam_gate_runs` and a receipt under `tmp/gate-agent-routing/`.
- Commands:
  - `npm run gate:agent-routing` — mint session, live chat goldens, D1 decision proof
  - `npm run gate:agent-routing:twice` — two consecutive rounds
  - `npm run sync:active-plan-tickets` — every `plans/active/*.md` must have a D1 ticket (`--apply` to insert)
  - `npm run assert:ticket-shippable -- --ticket=tkt_…` — refuse ship without proof; `--set-shipped` only when green

Operating rule for Cursor: see each ticket and `plans/README.md`.

**Wait for approval before editing** after investigation stop-points.
