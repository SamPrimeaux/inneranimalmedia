-- Per-user notes pad + personal contacts (artifacts rail / collaborate quick apps)

CREATE TABLE IF NOT EXISTS user_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  color TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_notes_user_updated
  ON user_notes (user_id, pinned DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_contacts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  username TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_contacts_user_name
  ON user_contacts (user_id, display_name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_user_contacts_user_email
  ON user_contacts (user_id, email COLLATE NOCASE);
