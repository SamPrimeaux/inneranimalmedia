-- 1005: Platform lockdown engineering law + heal invisible apply_mode=always rules.
-- Root cause: trigger_type DEFAULT 'manual' + loader filtered IN ('system','keyword') → LOCKED rules never injected.
-- Loader also healed in src/core/agent-skills-rules.js (apply_mode=always is authoritative).
-- SSOT file: AGENTS.md
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml \
--     --file=./migrations/1005_platform_lockdown_engineering_law.sql

-- 1) Heal: any active always-rule with a non-loader trigger_type → system (keyword stays keyword)
UPDATE agentsam_rules_document
SET
  trigger_type = 'system',
  updated_at_epoch = unixepoch(),
  notes = TRIM(COALESCE(notes, '') || ' | 2026-07-23: healed trigger_type→system (was invisible to fetchTriggeredRulesForSystemPrompt)')
WHERE COALESCE(is_active, 0) = 1
  AND lower(COALESCE(apply_mode, '')) = 'always'
  AND lower(COALESCE(trigger_type, '')) NOT IN ('system', 'keyword');

-- 2) Canonical engineering law (git AGENTS.md ↔ D1)
INSERT OR REPLACE INTO agentsam_rules_document (
  id,
  rule_key,
  user_id,
  workspace_id,
  title,
  body_markdown,
  version,
  is_active,
  created_at_epoch,
  updated_at_epoch,
  apply_mode,
  rule_type,
  trigger_type,
  sort_order,
  notes,
  source_stored
) VALUES (
  'rule_platform_lockdown_engineering_law',
  'rule_platform_lockdown_engineering_law',
  '',
  'ws_inneranimalmedia',
  'LOCKED: Platform lockdown engineering law (2026-07-23)',
  '# Platform lockdown engineering law (LOCKED)

Non-negotiable, applies regardless of which tool/account/agent is editing — Claude, Cursor, ChatGPT, in-app agents, any Claude Pro account.

**Git SSOT:** AGENTS.md (repo root). Keep this row in sync when the file changes.

## 1. Proof over narration
No claim of "fixed" without a re-runnable proof query/command pasted alongside it. A summary is a hypothesis. A raw D1 row, log line, or command output is a fact.

## 2. Timestamps are epoch integers, always
No TEXT timestamps, no datetime(''now''), no ISO strings in time-critical columns. INTEGER unixepoch seconds only. Hybrid TEXT columns require companion *_unix and all filters use it.

## 3. Identifiers are full-length or the write fails
Git SHAs and join-key hashes are never truncated. No short hashes in git_hash, git_commit, run_group_id, metadata_json, or derived fields. Unresolvable full value → fail loud, no INSERT.

## 4. Flags are computed or actively reconciled — never decorative
is_active, resolved, health/status flags must be computed at read time or actively reconciled on a schedule. Flag set once at INSERT and never revisited is forbidden.

## 5. Fail loud, never silent-empty
Writers that cannot produce correct data do not silently succeed with empty/wrong data (e.g. changed_files: []). Non-zero exit, no row — or an explicit failure row.

## 6. Independent verification required
Every fix is verified by an actor that did NOT write the fix, pulling primary data — not the implementer summary. Tiers: T1 implementer · T2 independent · T3 durable gate.

## 7. Durable enforcement over one-time tests
Prefer gates that keep checking after ship (deploy-trail-gate) over a one-time passing test.

## 8. No new tables/schema to solve what an existing table already captures
Sprawl is the default failure mode. Reuse or fix in place before creating.

## 9. Rules only load if the loader can see them
apply_mode=always alone was not enough historically: column DEFAULT trigger_type=manual + loader filter IN (system, keyword) silently dropped LOCKED rules (including ops-trail + OAuth-liveness). Always set trigger_type=system explicitly on LOCKED global inserts. Keyword rules use trigger_type=keyword. Guard: npm run guard:engineering-laws. Loader now treats apply_mode=always as authoritative (non-keyword = unconditional).
',
  2,
  1,
  unixepoch(),
  unixepoch(),
  'always',
  'platform',
  'system',
  1,
  'Consolidates 2026-07-23 D1 audit + trail lockdown. Git SSOT: AGENTS.md. Loader heal: agent-skills-rules.js.',
  'AGENTS.md'
);

-- 3) Ensure tonight's sibling LOCKED rules stay system + active
UPDATE agentsam_rules_document
SET
  trigger_type = 'system',
  apply_mode = 'always',
  is_active = 1,
  updated_at_epoch = unixepoch(),
  source_stored = COALESCE(NULLIF(TRIM(source_stored), ''), 'migrations/1005_platform_lockdown_engineering_law.sql')
WHERE id IN ('rule_ops_trail_timestamp', 'rule_oauth_token_liveness', 'rule_ticket_dual_pass_e2e');
