-- DB-driven loading / status lines for agent dashboard (GET /api/loading-states).
CREATE TABLE IF NOT EXISTS ui_loading_states (
  id TEXT PRIMARY KEY,
  context TEXT NOT NULL,
  personality_tone TEXT,
  message TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ui_loading_states_ctx
  ON ui_loading_states(context, is_active, sort_order);

-- Seed: default + phase contexts; personality_tone NULL = applies to all tones.
INSERT OR IGNORE INTO ui_loading_states (id, context, personality_tone, message, sort_order, is_active) VALUES
  ('uls_default_1', 'default', NULL, 'Checking the D1 connection...', 10, 1),
  ('uls_default_2', 'default', NULL, 'Asking the models nicely...', 20, 1),
  ('uls_default_3', 'default', NULL, 'Counting tokens so you do not have to...', 30, 1),
  ('uls_default_4', 'default', NULL, 'Warming up the hamster wheel...', 40, 1),
  ('uls_default_5', 'default', NULL, 'Polishing the response...', 50, 1),
  ('uls_think_1', 'thinking', NULL, 'Analyzing request...', 10, 1),
  ('uls_think_2', 'thinking', NULL, 'Processing context...', 20, 1),
  ('uls_think_3', 'thinking', NULL, 'Formulating approach...', 30, 1),
  ('uls_stream_1', 'streaming', NULL, 'Receiving tokens...', 10, 1),
  ('uls_stream_2', 'streaming', NULL, 'Streaming response...', 20, 1),
  ('uls_stream_3', 'streaming', NULL, 'Almost there...', 30, 1),
  ('uls_tool_1', 'tool_call', NULL, 'Calling tools...', 10, 1),
  ('uls_tool_2', 'tool_call', NULL, 'Fetching data...', 20, 1),
  ('uls_draw_1', 'drawing', NULL, 'Updating the canvas...', 10, 1),
  ('uls_draw_2', 'drawing', NULL, 'Laying out shapes...', 20, 1),
  ('uls_lib_1', 'library_loading', NULL, 'Loading library assets...', 10, 1),
  ('uls_q_1', 'querying', NULL, 'Querying the database...', 10, 1),
  ('uls_q_2', 'querying', NULL, 'Running SQL...', 20, 1),
  ('uls_search_1', 'searching', NULL, 'Searching knowledge...', 10, 1),
  ('uls_search_2', 'searching', NULL, 'Retrieving context...', 20, 1);
