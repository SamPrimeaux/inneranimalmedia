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

### 4. Reward ledger
- Table: `agentsam_reward_events` — multi-tenant, multi-task, no identity defaults
- Image thumbs write here with `dedup_key` (single-writer, no double-apply)
- Snapshots `model_key` / `provider` / `content_tier` / `cost_usd` at event time

## Domain
`agentsam_tickets` = platform engineering. Collaborate tasks stay separate.
