-- 743: Home/workspace connect tile visibility + product tile sizing (idempotent where possible).

-- integration_registry: which OAuth/services appear on Home vs Workspace settings
-- SQLite lacks IF NOT EXISTS on ADD COLUMN — skip in console if column exists.
ALTER TABLE integration_registry ADD COLUMN show_on_home INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_registry ADD COLUMN show_on_workspace INTEGER NOT NULL DEFAULT 0;

UPDATE integration_registry SET show_on_home = 1, show_on_workspace = 1
WHERE lower(provider_key) IN ('github', 'cloudflare_oauth', 'google_drive', 'supabase_oauth');

UPDATE integration_registry SET show_on_workspace = 1
WHERE lower(provider_key) IN ('openai', 'anthropic', 'resend', 'cloudflare_r2', 'local_tunnel', 'google_ai');

-- dashboard_home_tiles: user-adjustable icon size (sm | md | lg)
ALTER TABLE dashboard_home_tiles ADD COLUMN tile_size TEXT NOT NULL DEFAULT 'lg';
