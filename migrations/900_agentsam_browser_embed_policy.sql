-- 900: agentsam_browser_embed_policy — D1-driven iframe embed policy
-- Hosts that block passive iframe embedding (X-Frame-Options / CSP frame-ancestors)
-- and must route through Browser Run live view in BrowserView.
--
-- The runtime lazy-ensures this table on first write (src/core/browser-embed-policy.js),
-- so this migration is idempotent with production state. Rows with source='probe' are
-- auto-upserted by GET /api/agentsam/browser/embed-policy header probes.
--
-- embed_mode: browser_run = Browser Run live view required
--             passive     = plain iframe allowed
--             blocked     = navigation refused by BrowserView

CREATE TABLE IF NOT EXISTS agentsam_browser_embed_policy (
  host_suffix TEXT PRIMARY KEY,
  embed_mode TEXT NOT NULL DEFAULT 'browser_run'
    CHECK (embed_mode IN ('browser_run','passive','blocked')),
  source TEXT NOT NULL DEFAULT 'manual',
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO agentsam_browser_embed_policy (host_suffix, embed_mode, source, note) VALUES
  ('stripe.com', 'browser_run', 'seed', 'hardcoded seed mirror'),
  ('dash.cloudflare.com', 'browser_run', 'seed', 'hardcoded seed mirror');
