-- Home hero image as a dashboard_home_tiles row (tile_key = home_hero).
-- Filtered out of the Creation tools grid; DashboardHome reads image_url for the full-bleed hero.
-- Update the image anytime by changing this row's image_url (or via home tile editor if exposed).

INSERT OR IGNORE INTO dashboard_home_tiles (
  id, workspace_id, tile_key, title, cta_label, path, image_url, tile_size, icon_scale, sort_order, is_enabled
) VALUES (
  'dht_platform_home_hero',
  'platform_default',
  'home_hero',
  'Home hero',
  'Hero',
  '/dashboard/designstudio',
  'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/cb28eb31-cdf8-4e80-7969-1952d96d9600/public',
  'lg',
  1.0,
  0,
  1
);

-- Keep workspace copies in sync when they already cloned platform tiles without a hero row.
INSERT OR IGNORE INTO dashboard_home_tiles (
  id, workspace_id, tile_key, title, cta_label, path, image_url, tile_size, icon_scale, sort_order, is_enabled
)
SELECT
  'dht_' || workspace_id || '_home_hero',
  workspace_id,
  'home_hero',
  'Home hero',
  'Hero',
  '/dashboard/designstudio',
  'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/cb28eb31-cdf8-4e80-7969-1952d96d9600/public',
  'lg',
  1.0,
  0,
  1
FROM (
  SELECT DISTINCT workspace_id
  FROM dashboard_home_tiles
  WHERE workspace_id IS NOT NULL
    AND workspace_id != ''
    AND workspace_id != 'platform_default'
)
WHERE workspace_id NOT IN (
  SELECT workspace_id FROM dashboard_home_tiles WHERE tile_key = 'home_hero'
);

-- Point existing home_hero rows at the workshop render (idempotent content update).
UPDATE dashboard_home_tiles
SET image_url = 'https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/cb28eb31-cdf8-4e80-7969-1952d96d9600/public',
    title = COALESCE(NULLIF(TRIM(title), ''), 'Home hero'),
    path = COALESCE(NULLIF(TRIM(path), ''), '/dashboard/designstudio')
WHERE tile_key = 'home_hero';
