# Active tickets

Work **in this order**. Do not parallelize product remasters across these.

| Order | Ticket | D1 id | Outcome |
|-------|--------|-------|---------|
| **P0** | [AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md](./AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md) | `tkt_agentsam_spine_e2e_20260716` | Vision + thread memory + real tools (D1/CF/GitHub/FSA) — Cursor replacement gate |
| 0 | [ROUTING-TOOL-SSOT-E2E.md](./ROUTING-TOOL-SSOT-E2E.md) | `tkt_routing_tool_ssot` | Gate green ×2 before any more tool-profile JS |
| 1 | [WORKSPACE-001-agent-repo-edit-loop.md](./WORKSPACE-001-agent-repo-edit-loop.md) | `tkt_workspace_001` | One safe repo edit via Agent Sam |
| 2 | [CMS-001-edit-publish-inneranimalmedia-home.md](./CMS-001-edit-publish-inneranimalmedia-home.md) | `tkt_cms_001` | Homepage edit + publish |
| 3 | [DESIGNSTUDIO-001-sam-sketch-persistent-artifact.md](./DESIGNSTUDIO-001-sam-sketch-persistent-artifact.md) | `tkt_designstudio_001` | Sketch → persistent model |
| 4 | [DESIGNSTUDIO-002-dream-home-artifact-engine.md](./DESIGNSTUDIO-002-dream-home-artifact-engine.md) | `tkt_designstudio_002` | OpenSCAD smoke + FreeCAD dream-home MVP (`proj_mrb5shkc_3kos2c`) |
| 5 | [DESIGNSTUDIO-003-architectural-plan-lane.md](./DESIGNSTUDIO-003-architectural-plan-lane.md) | `tkt_designstudio_003` | PlanGraph bridge → FreeCAD + viz lineage contracts for 004 |
| 6 | [DESIGNSTUDIO-004-freecad-blender-visualization.md](./DESIGNSTUDIO-004-freecad-blender-visualization.md) | `tkt_designstudio_004` | FreeCAD → VisualizationPackage → Blender (deferred; blocked by 003) |

## Parallel P0 (ops / SDK — not remaster queue)

| Ticket | D1 id | Project |
|--------|-------|---------|
| [CLOSED-LOOP-FEEDBACK-BLINDSPOTS-2026-07-14.md](./CLOSED-LOOP-FEEDBACK-BLINDSPOTS-2026-07-14.md) | `tkt_closed_loop_feedback_blindspots_2026_07_14` | `inneranimalmedia` |
| [SDK-SCAFFOLD-WINDOWS-POWERSHELL-2026-07-14.md](./SDK-SCAFFOLD-WINDOWS-POWERSHELL-2026-07-14.md) | `tkt_agentsam_sdk_scaffold_windows_2026_07_14` | `proj_agentsam_sdk` |
| [CLOSED-LOOP-CODE-RAG-2026-07-14.md](./CLOSED-LOOP-CODE-RAG-2026-07-14.md) | `tkt_closed_loop_code_rag_2026_07_14` | overnight reindex / morning proof |
| [CLOSED-LOOP-AUTO-COMPACT-MEMORY-2026-07-14.md](./CLOSED-LOOP-AUTO-COMPACT-MEMORY-2026-07-14.md) | `tkt_closed_loop_auto_compact_memory_2026_07_14` | live compact + durable summarize |

## Verification law (LOCKED — dual-pass E2E)

- **Deploy success ≠ pass.** A ticket may **not** move to `shipped` until it has **two independent end-to-end validations**.
- Default: `consecutive_pass_count >= required_pass_count` (**2**) **and** either:
  - ≥2 green rows in `agentsam_gate_runs`, **or**
  - ≥2 `agentsam_ticket_events` with `event_type = 'e2e_pass'` (each with durable proof IDs in `detail`).
- One visual success mid-session without a second later retest = keep `in_review` / `active`.
- Commands:
  - `npm run record:ticket-e2e-pass -- --ticket=tkt_… --detail='PASS1: …'`
  - `npm run record:ticket-e2e-pass -- --ticket=tkt_… --detail='PASS2: …'`
  - `npm run assert:ticket-shippable -- --ticket=tkt_…` — refuse ship without proof
  - `npm run assert:ticket-shippable -- --ticket=tkt_… --set-shipped` — only when green
  - `npm run gate:agent-routing` / `gate:agent-routing:twice` — mint session goldens when applicable
  - `npm run sync:active-plan-tickets` — every `plans/active/*.md` must have a D1 ticket (`--apply` to insert)

Cursor: `.cursor/rules/iam-ticket-dual-pass-e2e.mdc` · D1 `rule_ticket_dual_pass_e2e`

Operating rule for Cursor: see each ticket and `plans/README.md`.

**Wait for approval before editing** after investigation stop-points.
