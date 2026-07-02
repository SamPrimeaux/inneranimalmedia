-- Per-tile icon fit: artwork scale + optional background (home quick-start tiles).
ALTER TABLE dashboard_home_tiles ADD COLUMN icon_scale REAL NOT NULL DEFAULT 1.0;
ALTER TABLE dashboard_home_tiles ADD COLUMN icon_bg TEXT;
