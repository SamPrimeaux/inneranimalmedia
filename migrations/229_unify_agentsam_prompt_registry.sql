-- Migration: 229_unify_agentsam_prompt_registry.sql
-- Goal: Consolidate state-of-the-art weights and experimentation logic into the unified ai_prompts_library.

-- 1. Enrich existing ai_prompts_library with Phase 18 Experimentation Tier columns
ALTER TABLE ai_prompts_library ADD COLUMN weight INTEGER NOT NULL DEFAULT 100;
ALTER TABLE ai_prompts_library ADD COLUMN experiment_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_prompts_library ADD COLUMN model_hint TEXT NOT NULL DEFAULT 'claude-opus-4-6';
ALTER TABLE ai_prompts_library ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

-- 2. Migrate data from agentsam_prompt to ai_prompts_library
-- Mapping: group_key -> category, content -> prompt_template
INSERT OR REPLACE INTO ai_prompts_library (
    id, name, category, prompt_template, version, is_active, 
    created_at, updated_at, tenant_id,
    weight, experiment_id, model_hint, metadata_json
)
SELECT 
    id, id as name, group_key as category, content as prompt_template, CAST(version AS TEXT), is_active,
    unixepoch(), unixepoch(), 'tenant_sam_primeaux',
    weight, experiment_id, model_hint, metadata_json
FROM agentsam_prompt;

-- 3. Cleanup: Drop the redundant temporary table
DROP TABLE IF EXISTS agentsam_prompt;

-- 4. Re-Index for A/B Testing performance
CREATE INDEX IF NOT EXISTS idx_prompts_category_active ON ai_prompts_library(category, is_active);
