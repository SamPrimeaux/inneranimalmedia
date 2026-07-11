# Intent gate + reward events (2026-07-11)

## Problem
Image intent lived in a JS regex wordlist — same class of bug as hardcoded model strings: every new phrasing (`photo`, `shot`, …) required a code deploy. Misses failed silently into chat.

## Shape (locked)

### 1. Keyword fast-path (zero cost)
- Table: `agentsam_intent_keywords(task_type, keyword_type, pattern, active)`
- Nouns/verbs/escalate_hints are rows — add via D1, no deploy
- Bootstrap literals in `intent-keywords.js` only when D1 empty

### 2. Classifier escalate-on-miss
- When keywords miss but escalate cues fire (create verb, soft hint, descriptive `of a…`), call Thompson `intent_classification` arm (Workers AI / Gemini lite)
- Answers yes/no image generation with real language understanding

### 3. Decision log (never silent)
- Table: `agentsam_intent_decisions`
- `matched_by`: `keyword` | `classifier` | `neither` | `rejected_guard`
- Query gaps instead of waiting for users to notice

## 4. Reward ledger — single writer (LOCKED)

**Wrong:** INSERT `agentsam_reward_events` and separately UPDATE `agentsam_routing_arms` (fifth parallel writer — TELEMETRY-LEDGER-OWNERSHIP class).

**Right:** `applyRewardEvent` in `src/core/reward-events.js`:
1. `computeRewardDeltas(signalType, signalValue)` — pure
2. `env.DB.batch([ INSERT reward_events, UPDATE routing_arms ])` — atomic

Image lane call sites:
- `recordImageModelOutcome` → `auto_success` / `auto_error` (cost_mean + latency + alpha/beta)
- `rateImageGeneration` → `user_thumbs_up` / `user_thumbs_down` (alpha/beta + quality; **not** cost again)

Domain tables (`image_generation_drafts`, `image_generation_feedback`, `agentsam_tool_call_log`) may still store facts. They must **not** independently bump bandit columns.

Remaining non-image writers (routing.js, thompson.js, agent-run-routing.js, …) → ticket `tkt_consolidate_arm_writers`.
