-- Per-integration icon fit on home/workspace surfaces (scale, background, custom artwork).
ALTER TABLE integration_registry ADD COLUMN icon_scale REAL NOT NULL DEFAULT 1.0;
ALTER TABLE integration_registry ADD COLUMN icon_bg TEXT;
ALTER TABLE integration_registry ADD COLUMN custom_icon_url TEXT;
