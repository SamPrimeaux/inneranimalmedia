-- Optional: create keyboard_shortcuts if not present (production may already have 25 rows).
-- Expected columns used by worker + dashboard:
--   id, action_key, label, description, keys_display, category, is_enabled, is_system, sort_order
CREATE TABLE IF NOT EXISTS keyboard_shortcuts (
  id TEXT PRIMARY KEY,
  action_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT,
  keys_display TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_keyboard_shortcuts_sort ON keyboard_shortcuts(sort_order, id);
