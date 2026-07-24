# Active tickets

Work **in this order**. Do not parallelize product remasters across these.

| Order | Ticket | D1 id | Outcome |
|-------|--------|-------|---------|
| **P0** | [AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md](./AGENTSAM-SPINE-E2E-CURSOR-PARITY-2026-07.md) | `tkt_agentsam_spine_e2e_20260716` | Vision + thread memory + real tools (D1/CF/GitHub/FSA) — Cursor replacement gate |
| **P0b** | [AGENTSAM-MODE-PROFILE-SPRINTS-2026-07.md](./AGENTSAM-MODE-PROFILE-SPRINTS-2026-07.md) · SSOT [`agentsamrefine.md`](../../agentsamrefine.md) | *(sync tickets)* | Mode→profile Cursor parity sprints S1–S5 (Ask/Plan hard contracts, Multitask fan-out) |
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
| [IAM-BARE-MINIMUM-COMPUTE-2026-07.md](./IAM-BARE-MINIMUM-COMPUTE-2026-07.md) | *(gates 0–5 — create D1 tickets as started)* | **Compute scorecard LOCK** — workspace green; hosted shell → MCP → MY_CONTAINER → bridge decision → remote. No SandboxAgent until Gates 0–3 green. |
| [AGENT-SURFACE-PROTOCOL-2026-07.md](./AGENT-SURFACE-PROTOCOL-2026-07.md) | `tkt_agent_surface_protocol` | shared surface-context protocol (resume later) |
| [DRAW-EXPORT-ARTIFACTS-2026-07.md](./DRAW-EXPORT-ARTIFACTS-2026-07.md) | `tkt_draw_export_artifacts` | Draw PNG/SVG/scene → ARTIFACTS + agentsam_artifacts |
| [CLOSED-LOOP-FEEDBACK-BLINDSPOTS-2026-07-14.md](./CLOSED-LOOP-FEEDBACK-BLINDSPOTS-2026-07-14.md) | `tkt_closed_loop_feedback_blindspots_2026_07_14` | `inneranimalmedia` |
| [SDK-SCAFFOLD-WINDOWS-POWERSHELL-2026-07-14.md](./SDK-SCAFFOLD-WINDOWS-POWERSHELL-2026-07-14.md) | `tkt_agentsam_sdk_scaffold_windows_2026_07_14` | `proj_agentsam_sdk` |
| [CLOSED-LOOP-CODE-RAG-2026-07-14.md](./CLOSED-LOOP-CODE-RAG-2026-07-14.md) | `tkt_closed_loop_code_rag_2026_07_14` | overnight reindex / morning proof |
| [CLOSED-LOOP-AUTO-COMPACT-MEMORY-2026-07-14.md](./CLOSED-LOOP-AUTO-COMPACT-MEMORY-2026-07-14.md) | `tkt_closed_loop_auto_compact_memory_2026_07_14` | live compact + durable summarize |
| [COMPANIONS-CPAS-DEMO-HANDOFF-2026-07-20.md](./COMPANIONS-CPAS-DEMO-HANDOFF-2026-07-20.md) | `tkt_companions_cpas_demo_handoff_20260720` | **PAUSED / blocked** — site live; resume only after Lori written request form |
| [COMPANIONS-CPAS-OPS-SURFACE-V2-2026-07-20.md](./COMPANIONS-CPAS-OPS-SURFACE-V2-2026-07-20.md) | `tkt_companions_cpas_ops_surface_v2` | **PAUSED / blocked** — calendar+reminders, events feed, video standards, foster paths (await written request) |
| [COMPANIONS-CONTEXT-AST-RAG-2026-07-21.md](./COMPANIONS-CONTEXT-AST-RAG-2026-07-21.md) | `tkt_companions_activerepo_lock_20260721` · `tkt_companions_ast_rag_index_20260721` · `tkt_project_codebase_index_rail_20260721` | **Companions compartment** — activeRepo lock, AST-RAG index, project-page Codebase Index rail (not platform remaster) |
| [CMS-TOOL-CONTRACT-COMPANIONS-IAM-2026-07.md](./CMS-TOOL-CONTRACT-COMPANIONS-IAM-2026-07.md) | *(proposal — ticket TBD)* | Shared CMS tool verbs/I-O: Companions SSOT lanes + IAM aspired parity; no optional wrong-lane writes |
| [AGENTSAM-CMS-STUDIO-CREAM-REALDATA-2026-07.md](./AGENTSAM-CMS-STUDIO-CREAM-REALDATA-2026-07.md) | *(handoff — ticket TBD)* | Studio exit→hub, cream shell, real CMS/CRM logic; keep iframe isolation |
| [GEMINI-INTERACTIONS-TRANSPORT-ADAPTER-2026-07.md](./GEMINI-INTERACTIONS-TRANSPORT-ADAPTER-2026-07.md) | `tkt_gemini_interactions_transport` | **Later sprint / backlog** — `gemini_transport=interactions\|generate_content`, default generateContent until green |
| [MAC-LOCALPTY-EXEC-IDENTITY-2026-07.md](./MAC-LOCALPTY-EXEC-IDENTITY-2026-07.md) | `tkt_mac_localpty_exec_identity_20260722` | Mac `agentsam_terminal_local` Exec-Identity + no sandbox launder — dual-pass E2E |
| [MEDIA-VIDEOS-STREAM-LIBRARY-2026-07.md](./MEDIA-VIDEOS-STREAM-LIBRARY-2026-07.md) | *(create D1 ticket when started)* | Videos sibling library (Stream·R2·Drive) + CF Stream detail parity + Veo→Stream; Claude=B/D, Cursor=A/C/E/F — see [CLAUDE-LANE-B-D-VIDEOS-HANDOFF-2026-07.md](./CLAUDE-LANE-B-D-VIDEOS-HANDOFF-2026-07.md) |
| [STREAM-BYOK-ACCOUNT-SCOPED-2026-07.md](./STREAM-BYOK-ACCOUNT-SCOPED-2026-07.md) | *(in media RC)* | Account-scoped Stream BYOK — `cloudflare_account_id` ownership, OAuth stream scopes, no customer→platform fallback |
| [INTEGRATIONS-OAUTH-PERMISSIONS-SLIDEUP-2026-07.md](./INTEGRATIONS-OAUTH-PERMISSIONS-SLIDEUP-2026-07.md) | `tkt_integrations_oauth_permissions_slideup_2_848b676c0c30` | CF Integrations permissions 1:1 (25 not 5 chips) + slide-up UX; evidence in R2 `ticket-evidence/2026-07-24-media-qa/` |
| [AGENT-IMAGE-DESCRIBE-STAY-IN-CONTEXT-2026-07.md](./AGENT-IMAGE-DESCRIBE-STAY-IN-CONTEXT-2026-07.md) | `tkt_agent_image_describe_stay_in_context_202_926887cebe09` | Image-detail describe stays on route; vision not Python-first; Monaco text preview — conv `586795be-…` |

## Verification law (LOCKED — named E2E tiers)

- **Deploy success ≠ pass.** A ticket may **not** move to `shipped` on implementer word alone.
- **Three tiers** (same `record` / `assert` scripts — not new infrastructure):

| Tier | Actor | Proof |
|------|--------|-------|
| **1 Implementation** | Fix author | Live exercise + durable IDs. Claim = hypothesis until Tier 2. |
| **2 Independent** | Different actor | Raw D1/log pull — not the implementer’s summary. May say **not verified yet**. |
| **3 Durable** | Gate / later real run | Path fails itself after humans leave (`deploy-trail-gate`, routing gate, assert). |

- Counts: default `required_pass_count = 2` (Tier 1+2). Control-plane / deploy-trail / identity / ledger tickets use **`required_pass_count = 3`**.
- Ship gate: `consecutive_pass_count >= required_pass_count` **and** either ≥N green `agentsam_gate_runs` **or** ≥N `agentsam_ticket_events` (`event_type = 'e2e_pass'`) with proof IDs in `detail`.
- **`in_review` gate (2026-07-24):** do not flip to `in_review` on vibes. Run `npm run audit:p0-closeout -- --ticket=tkt_…` first — verdict must not be `CONFLICT` / `MISSING_ROW`. Record Tier 1 in the same change set. `in_review` with zero `e2e_pass` events is drift → downgrade to `active`.
- Cross-session: re-check from raw data every time — never “fine last chat.”
- Commands:
  - `npm run audit:p0-closeout` / `npm run audit:p0-closeout:all`
  - `npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=1 --detail='…'`
  - `npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=2 --detail='…'`
  - `npm run record:ticket-e2e-pass -- --ticket=tkt_… --tier=3 --detail='…'` (control-plane)
  - `npm run assert:ticket-shippable -- --ticket=tkt_…` — refuse ship without proof
  - `npm run assert:ticket-shippable -- --ticket=tkt_… --set-shipped` — only when green
  - `npm run gate:agent-routing` / `gate:agent-routing:twice` — mint session goldens when applicable
  - `npm run sync:active-plan-tickets` — every `plans/active/*.md` must have a D1 ticket (`--apply` to insert)

Cursor: `.cursor/rules/iam-ticket-dual-pass-e2e.mdc` · D1 `rule_ticket_dual_pass_e2e` · `scripts/audit_p0_in_review_closeout.py`

Operating rule for Cursor: see each ticket and `plans/README.md`.

**Wait for approval before editing** after investigation stop-points.
