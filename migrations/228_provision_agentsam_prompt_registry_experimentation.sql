-- Migration: 228_provision_agentsam_prompt_registry_experimentation.sql
-- Goal: Establish a versioned, weighted prompt library for SOTA fine-tuning.

-- 1. Prompt Registry Table
CREATE TABLE IF NOT EXISTS agentsam_prompt (
    id TEXT PRIMARY KEY,                       -- e.g. 'coding_frontend_sota_v1'
    group_key TEXT NOT NULL,                  -- e.g. 'coding'
    experiment_id TEXT NOT NULL DEFAULT '',    -- For tracking test cohorts
    
    version INTEGER NOT NULL DEFAULT 1,
    content TEXT NOT NULL,                     -- The actual XML-structured prompt
    
    weight INTEGER NOT NULL DEFAULT 100,      -- Selection weight for A/B testing (0-100)
    is_active INTEGER NOT NULL DEFAULT 1,     -- Boolean (0/1)
    
    model_hint TEXT DEFAULT 'claude-opus-4-6', -- Suggested model for this prompt
    metadata_json TEXT DEFAULT '{}',           -- For few-shot examples and configs
    
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_prompt_group ON agentsam_prompt(group_key, is_active);

-- 2. Enrich Test Runs for Relational Tracking
-- Using a separate block to ensure safety if columns exist
ALTER TABLE ai_api_test_runs ADD COLUMN prompt_id TEXT NOT NULL DEFAULT '';
ALTER TABLE ai_api_test_runs ADD COLUMN experiment_id TEXT NOT NULL DEFAULT '';

-- 3. Seed Initial SOTA Coding Prompts (Extracted from src/coding)
INSERT OR REPLACE INTO agentsam_prompt (id, group_key, version, content, model_hint, weight)
VALUES (
    'coding_expert_frontend_v1', 
    'coding', 
    1, 
    'You are an expert frontend engineer skilled at crafting beautiful, performant frontend applications. Use vanilla HTML, CSS, & Javascript. Use Tailwind CSS for your CSS variables.',
    'claude-opus-4-6',
    50
);

INSERT OR REPLACE INTO agentsam_prompt (id, group_key, version, content, model_hint, weight)
VALUES (
    'coding_aesthetics_sota_v1', 
    'coding', 
    1, 
    '<frontend_aesthetics> Focus on typography, color consistency, and motion. Avoid generic AI slop aesthetics. Use CSS variables and high-impact staggered reveals. </frontend_aesthetics>',
    'claude-sonnet-4-6',
    50
);
