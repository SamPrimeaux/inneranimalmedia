# tkt_hardcoded_routing_audit — Phase 1 Findings

**Status:** enumeration complete, no code changes made  
**Date:** 2026-07-11  
**Auditor:** Claude (claude.ai session, via MCP tools)

---

## Summary

The ticket predicted we'd find hardcoded regex classifiers on both `/dashboard/agent` and `/dashboard/designstudio` surfaces. The actual picture is more nuanced — and better than expected in one direction, worse in another.

**Good news:** `image-intent-gate.js` was already migrated. The `IMAGE_NOUN_RE`/`IMAGE_CREATE_VERB_RE` pattern that opened this ticket has been replaced by `loadIntentKeywords()` → `agentsam_intent_keywords` D1 table with bootstrap fallback. The gate logs every decision to `agentsam_intent_decisions`. That fix is done.

**Bad news:** `classifyImageTier()` in `src/tools/image_generation.js` is *not* D1-backed, and it feeds Thompson sampling cost attribution directly. There are also hardcoded regex classifiers in Design Studio's CAD dispatch path and in semantic lane routing.

---

## Findings Table

| File:line | What it classifies | Feeds into | D1-backed? | Duplicate of another classifier? |
|---|---|---|---|---|
| `src/tools/image_generation.js:classifyImageTier()` | draft / quality / standard tier from prompt | `pickImageModelFromDb` tier filter, `TIER_QUALITY_DEFAULTS`, `contentTierFromImageTier`, Thompson cost attribution | ❌ No — hardcoded regex | Overlaps with `resolveImageLane()` in same file (both classify prompt signals for model selection) |
| `src/tools/image_generation.js:resolveImageLane()` | edit_reference / fast_draft / brand_mockup / high_quality | SSE emit label, model picker hint | ❌ No — hardcoded regex | Overlaps with `classifyImageTier()` — both classify "draft" vs "quality" signals from the same prompt string |
| `src/tools/image_generation.js:hasVideoGenerationIntent()` | video generation intent | Tool injection gate | ❌ No — hardcoded regex | Independent (no D1 video classifier exists yet) |
| `src/core/semantic-lane-classifier.js:classifySemanticLane()` | code / schema / memory / docs / client_project / deep_archive semantic retrieval lane | RAG retrieval dispatch, `semantic-retrieval-dispatch.js` | ❌ No — hardcoded regex | Standalone; no D1-backed equivalent |
| `src/core/semantic-lane-classifier.js:classifyDatabaseAssistantIntent()` | inspect_schema / run_readonly_sql / propose_migration / explain_table | Database assistant dispatch | ❌ No — hardcoded regex | See also `src/core/database-sql-classify.js` (separate file for SQL safety, likely overlapping) |
| `src/core/semantic-lane-classifier.js:messageRequestsOpenWebSearchLocal()` | web search intent (inline helper) | `classifySemanticLane()` gate | ❌ No — hardcoded regex | Duplicated logic also exists in `src/tools/builtin/web.js` (likely) |
| `src/core/semantic-lane-classifier.js:messageRequestsWorkspaceGrepLocal()` | grep/repo search intent | `classifySemanticLane()` gate | ❌ No — hardcoded regex | Overlaps with `isReadOnlyRepoSearchIntent` in `code-implementation-intent.js` |
| `src/core/semantic-lane-classifier.js:messageRequestsBrowserInspectLocal()` | browser inspection intent | `classifySemanticLane()` gate | ❌ No — hardcoded regex | Overlaps with `messageExplicitlyRequestsBrowserInspection` in `code-implementation-intent.js` |
| `src/core/image-intent-gate.js` | image generation intent (primary gate) | Agent chat fast path, tool injection | ✅ **D1-backed** via `agentsam_intent_keywords` with bootstrap fallback | Was the original bug; now fixed |
| `dashboard/components/designstudio/cad-studio/dispatchCadChat.ts` | CAD operator type → chat message format | `IAM_AGENT_CHAT_COMPOSE` event, Agent Sam chat | ❌ No structured classification — string template dispatch | Not a regex classifier; dispatches everything through Agent Sam chat, so misroute is loud (user sees prompt in chat) |

---

## Distinct Classifier Count

**`/dashboard/agent` backing code (`src/core/`, `src/tools/`, `src/api/agent/`):**
- `classifyImageTier()` — 1 hardcoded classifier  
- `resolveImageLane()` — 1 hardcoded classifier (overlapping with above)  
- `hasVideoGenerationIntent()` — 1 hardcoded classifier  
- `image-intent-gate.js` — ✅ D1-backed (no longer counts as a finding)  

**`/dashboard/designstudio` backing code (`src/core/cad-dispatch.js`, `src/api/designstudio/`, `dashboard/components/designstudio/`):**
- `dispatchCadChat.ts` — no regex classifier; string-template dispatch to agent chat (misroute is visible, not silent)
- `src/core/cad-dispatch.js` — env-flag routing only (`CAD_DISPATCH_TARGET`), no prompt classification
- No independently maintained regex tier/lane classifier found in Design Studio's own code

**Shared infrastructure (`src/core/semantic-lane-classifier.js`):**
- `classifySemanticLane()` — 1 hardcoded classifier (6 output lanes)
- `classifyDatabaseAssistantIntent()` — 1 hardcoded classifier (4 output intents)
- 3 inline helper functions that duplicate logic from `code-implementation-intent.js`

**Total hardcoded classifiers found: 7** (excluding the fixed `image-intent-gate.js`)

---

## Highest-Priority Consolidation Targets (Overlapping Wordlists)

### 1. `classifyImageTier()` vs `resolveImageLane()` — HIGHEST PRIORITY

Both functions test the same prompt string for overlapping signals:

- `classifyImageTier` maps `draft|rough|quick|sketch|blueprint|floor.?plan|layout|wireframe` → `'draft'` and `presentation|client|final|high.?res|photorealistic|render|production` → `'quality'`
- `resolveImageLane` maps `/draft|rough|quick|sketch|thumbnail|preview|cheap|fast/` → `'fast_draft'` and `/final|high.?res|ultra|best|quality|print|production/` → `'high_quality'`

These are semantically the same classification ("is this a cheap/quick image or an expensive/final one?") expressed as two separate regex trees that can drift independently. A prompt matching `tier='draft'` but `lane='brand_mockup'` would send conflicting signals to the Thompson arms and to the content tier tracker.

### 2. `classifySemanticLane()` inline helpers vs `code-implementation-intent.js`

`messageRequestsWorkspaceGrepLocal` and `messageRequestsBrowserInspectLocal` are local copies of functions that already exist in `code-implementation-intent.js` (`isReadOnlyRepoSearchIntent`, `messageExplicitlyRequestsBrowserInspection`). The locals were probably added to avoid circular imports. The canonical versions and the local copies can drift independently — a new grep pattern added to one won't land in the other.

---

## Design Studio Assessment (Phase 2)

Design Studio's dispatch shape is **not a regex classifier problem** — it's different from the image-gen case:

- `dispatchCadChat.ts` routes everything through Agent Sam chat regardless of operator type. The agent decides tool selection. Misroutes are **loud** (visible in chat), not silent.
- `cad-dispatch.js` uses env flags (`CAD_DISPATCH_TARGET=gcp|container|auto`), not prompt classification.
- The API layer (`src/api/designstudio/index.js`) is a pure REST CRUD handler — no intent classification at all.

The cost-contamination risk from `tkt_thompson_cost_tier_split` does **not** apply to Design Studio's current dispatch (it's not doing Thompson sampling on CAD tool selection per prompt). The 3D/2D/mesh routing decisions are made inside Agent Sam's tool loop, not at the intent gate layer.

**Conclusion:** Design Studio does not have an independently-maintained hardcoded regex classifier. Phase 3 consolidation work for this surface should be scoped much more narrowly than the ticket anticipated.

---

## Phase 3 Proposed Scope (for separate PR, after review)

Based on actual findings, not the anticipated shape:

### High priority
1. **Merge `classifyImageTier` and `resolveImageLane` into one D1-backed function** using a new `task_type='image_tier'` in `agentsam_intent_keywords`. The canonical output should be the `draft/standard/quality` tier; `resolveImageLane` becomes a derivative of tier (draft→fast_draft, quality→high_quality, standard→brand_mockup). This eliminates the drift risk and gives a single audit trail.

2. **Audit `image_generation_drafts.content_tier` for contamination** — the `classifyImageTier` function was running before this ticket was filed. Rows where `content_tier` was set by the hardcoded classifier vs rows where it was set by a D1 keyword hit should be compared. If the hardcoded regex underclassified "draft" tiers as "standard", the cost rollups for those rows are inflated.

### Medium priority
3. **Consolidate `messageRequestsWorkspaceGrepLocal` and `messageRequestsBrowserInspectLocal`** into proper imports from `code-implementation-intent.js` (or extract to a shared `intent-helpers.js` if circular imports are a real constraint).

4. **Decide if `classifySemanticLane` should be D1-backed.** The semantic lane classifier has ~6 output categories with 3–5 regex patterns each. It's a good candidate for D1 keywords once the image tier work validates the pattern. However, semantic lane misses are less cost-critical (wrong lane → suboptimal RAG retrieval, not wrong billing tier) so this is lower urgency.

### Not in scope
- Design Studio tool routing (no hardcoded regex classifier found)
- `hasVideoGenerationIntent` (no D1 equivalent exists; ship when video routing gets Thompson arms)
- Any work that overlaps with `tkt_consolidate_arm_writers` or `tkt_thompson_cost_tier_split`

---

## Files Read

- `src/core/image-intent-gate.js`
- `src/core/intent-keywords.js`  
- `src/core/semantic-lane-classifier.js`
- `src/core/cad-dispatch.js`
- `src/api/designstudio/index.js`
- `dashboard/components/designstudio/cad-studio/dispatchCadChat.ts`
- `src/core/agent-run-routing.js`
- `src/tools/image_generation.js`
