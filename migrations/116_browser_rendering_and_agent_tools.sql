-- 116: Browser rendering (playwright_jobs) + agent workspace state for reliable /api/browser/* and queue consumer
-- Run: npx wrangler d1 execute inneranimalmedia-business --remote --config wrangler.production.toml --file=./migrations/116_browser_rendering_and_agent_tools.sql
-- Purpose: Queue consumer and GET /api/agent/playwright/:id expect playwright_jobs; workspace state expects agent_workspace_state.

-- Browser / Puppeteer jobs (screenshot, render) — consumed by queue handler; results in R2 screenshots/ and renders/
CREATE TABLE IF NOT EXISTS playwright_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL DEFAULT 'screenshot',
  url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  metadata TEXT,
  result_url TEXT,
  completed_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_playwright_jobs_status_created ON playwright_jobs(status, created_at DESC);

-- Agent workspace state (per-session UI state; optional R2 mirror at sessions/:id/state.json)
CREATE TABLE IF NOT EXISTS agent_workspace_state (
  id TEXT PRIMARY KEY,
  state_json TEXT DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Note: agent_ai_sam, ai_models, mcp_services, iam_agent_sam_prompts, cidi are used by /api/agent/boot and chat.
-- If missing in your DB, add them separately or ensure they exist from prior migrations/seeds.
-- Minimal seeds for ai_models (so /api/agent/chat has at least one model) — only if table exists and is empty:
-- INSERT OR IGNORE INTO ai_models (id, provider, model_key, display_name, is_active) VALUES
--   ('default_anthropic', 'anthropic', 'claude-sonnet-4-20250514', 'Claude Sonnet 4', 1),
--   ('default_workers_ai', 'cloudflare_workers_ai', '@cf/meta/llama-3.1-8b-instruct', 'Llama 3.1 8B', 1);
