# tkt_hardcoded_routing_audit — Phase 1 Findings (expanded)

**Status:** enumeration complete — no unification code yet  
**Updated:** 2026-07-11  
**Law:** every turn decision (lane / tools / model / surface) must resolve via D1 (`agentsam_classification_keywords` → `agentsam_intent_decisions` → consumers). No silent JS veto after a D1 match. No parallel “hidden reroute.”

Related tickets: `tkt_route_contract_tool_scoping`, `tkt_classification_keywords_unify`, `plan_cf_codemode_mcp_2026` (MCP tool exposure — same goal, different layer).

---

## Request path (early → late)

```
composer flags / Design Studio pin
  → casual greeting short-circuit
  → surface workflow preflight (Monaco/browser)
  → force_image / image-intent-gate
  → runtime_lane user_app vs tenant_saas
  → inferIntentHeuristically → taskType → prompt_routes
  → route_requirements (+ modeSlug collapse) + OAuth parity catalog
  → RAG lane context
  → tool-capability-filter + agent-tool-loader
  → image tier / video / illustration (tool time)
```

---

## Ranked independent reroute layers

### P0 — fires first / poisons the whole turn

| # | Layer | Files | Decides | Mechanism | Logged to `agentsam_intent_decisions`? | Consumes classification keywords? |
|---|--------|-------|---------|-----------|----------------------------------------|-----------------------------------|
| 1 | **`inferIntentHeuristically`** | `src/api/agent/classify-intent.js` | `taskType` → prompt routes / models | ~30 hardcoded regex | No (console only) | No (uses sync image bootstrap) |
| 2 | **`code-implementation-intent` hub** | `src/core/code-implementation-intent.js` | Code vs browser vs readonly vs repo | Pure regex | No | No |
| 3 | **Image-gate JS guards** | `src/core/image-intent-gate.js` | Veto image fast path | `isCodeImplementationIntent`, `COMBINED_WORK`, planning | Yes (`rejected_guard`) | Keywords yes, **after** planning; guards can still override escalate path |
| 4 | **`user_app` lane** | `src/core/user-app-runtime.js` | Skip `compileModeProfile` | `runtime_lane === 'user_app'` | No | No — hardcodes `prompt_route_id` / `route_requirements_id` null |
| 5 | **OAuth MCP parity default-allow** | `src/core/in-app-mcp-oauth-parity.js` | Full tool catalog (~100) | `oauth_visible` + empty allowlist → all | No | No |
| 6 | **Design Studio pin** | `src/core/design-studio-context.js` | Force `design_studio` route / skip RWS | Surface flag + CAD regex | No | No |

### P1 — tool / surface blast radius

| # | Layer | Files | Decides | Mechanism | Audit? |
|---|--------|-------|---------|-----------|--------|
| 7 | Surface workflow preflight | `agent-surface-workflow.js` | Divert Monaco/browser workflow | JS heuristics; D1 only for workflow_key | Console only |
| 8 | `route_requirements` modeSlug collapse | `agentsam-route-tool-resolver.js`, `runtime-profile.js` | Caps / max_tools | Lookup forced to mode `agent`; missing → JS `DEFAULT_ROUTE_TOOL` | No |
| 9 | Ask evidence augment | `ask-evidence-tools.js` | Pin/strip tools after D1 load | Regex | No |
| 10 | Tool capability filter (Layer B) | `tool-capability-filter.js` | Final tool menu families | Message heuristics (`capabilityDecision` null on hot path) | Optional debug |
| 11 | Agent tool-loader families | `agent-tool-loader.js` | Attach image/video/browser/… | Same heuristic cluster | No |
| 12 | Composer `force_image` / `create_image` | `agent-chat-spine.js`, `ChatAssistant.tsx` | Bypass gate → direct image stream | Body flags; `matchedBy: composer_action` | **Not** written to D1 |

### P2 — context / cost / secondary

| # | Layer | Notes |
|---|--------|--------|
| 13 | Semantic lane + agent-lane-router + rag-intent-router | Intent key hardcoded; D1 `agentsam_rag_intent_routes` only for **order** |
| 14 | Image tier sync bootstrap | `resolveImageTier` is D1+logged; sync bootstrap still JS |
| 15 | `hasVideoGenerationIntent` | Regex only; no D1 video keywords yet |
| 16 | `isSimpleAskMessage` | Casual short-circuit skips policy/surface |
| 17 | Illustration / CAD / Meshy engine sets | Post-tool lane pick |
| 18 | `capability-router` | Gemini + heuristic — **dormant** (`capabilityDecision = null`) but duplicate logic lives |
| 19 | Misc | Tavily blockers, nano escalate taskType sets, SQL safety classify |

---

## Already D1-driven (consumers — keep; do not re-classify in JS)

| Concern | Table / mechanism |
|---------|-------------------|
| Image intent keywords | `agentsam_classification_keywords` (+ legacy `agentsam_intent_keywords`) |
| Image intent + tier decisions | `agentsam_intent_decisions` (image paths only today) |
| Prompt / mode compile | `agentsam_prompt_routes` (**skipped on `user_app`**) |
| Tool catalog | `agentsam_tools` |
| Route requirements | `agentsam_route_requirements` (partial — modeSlug collapse) |
| RAG lane order | `agentsam_rag_intent_routes` |
| Surface → workflow key | `agentsam_workflows.metadata_json.surface_routes` |
| Model Thompson | `agentsam_routing_arms` + `agentsam_model_catalog` |

---

## Unification law (LOCKED — no ticket may drift)

**message → D1 keywords / escalate → `agentsam_intent_decisions` → consumers only.**  
No re-regexing the message in consumers. No silent veto after a match.

1. **One classifier front-door** — writes `matched_by`, `task_type`, `reason` (and later routing_arm_id).
2. **Consumers only** — prompt routes, route_requirements, tool allowlists, surface divert, RAG lane, image/video fast path **read** that decision.
3. **Default-deny tools** when no route/intent match (`tkt_route_contract_tool_scoping` / `tkt_p0_oauth_parity_default_deny`).
4. **No veto after keyword match** without an explicit D1 policy row.
5. **Kill or wire** dormant duplicates; delete sync/bootstrap paths once D1 coverage is proven.

## Sequence (adjusted 2026-07-11)

1. **api_platform full-catalog validity** — `tkt_api_platform_catalog_validity` (gate before more routing work).
2. **P0#1** `tkt_p0_infer_intent_heuristically` — **pulled forward** (daily code-task model selection; unlogged).
3. **P0#2 / #3** `tkt_p0_code_implementation_intent` + `tkt_p0_image_gate_js_guards` (image veto hub).
4. **P0#4 / #5** `tkt_p0_user_app_lane_bypass` + `tkt_p0_oauth_parity_default_deny` (with `tkt_route_contract_tool_scoping`).
5. **P0#6** `tkt_p0_design_studio_pin`.

## Arm contamination (straight answer)

**Unrecoverable historically** at the aggregate level. `agentsam_routing_arms` holds cumulative `success_alpha` / `success_beta` / `cost_n` only — no per-pull provenance. `agentsam_reward_events.agent_run_id` is almost never filled; no join path to `agentsam_intent_decisions` for past chat/code turns. You cannot distinguish “good” updates from misclassified-turn contamination after the fact.

**Options:** fix forward (default) · reset **named** high-suspicion arms to seed priors · going-forward require reward ↔ agent_run ↔ intent_decision linkage.

---

## Prior undercount

Earlier pass counted ~7 regex sites and treated image-intent-gate as “done.” Expanded pass: **~19 independent layers**, including `classify-intent`, `user_app`, OAuth parity, modeSlug collapse, and the code-implementation hub (the `create…site` / site-plan failure mode).
