-- MeauxChess public lobby CMS: hero section for /games
-- Uses existing page_inneranimalmedia_games (route /games already registered in cms_pages).

UPDATE cms_pages
SET
  title = 'MeauxChess',
  meta_description = 'Real-time 3D multiplayer chess on Cloudflare.',
  page_type = 'custom',
  status = 'published',
  r2_bucket = 'inneranimalmedia',
  r2_key = 'pages/games/index.html',
  is_active = 1,
  updated_at = unixepoch(),
  published_at = COALESCE(published_at, unixepoch())
WHERE id = 'page_inneranimalmedia_games';

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_games_hero',
  'page_inneranimalmedia_games',
  'hero',
  'meauxchess_hero',
  '{"eyebrow":"Inner Animal Media","headline":"MeauxChess","subheadline":"Real-time 3D multiplayer. Cloudflare-powered.","badge_online":"ONLINE & OFFLINE","primary_cta_label":"Play MeauxChess","hero_image_desktop":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/hero","hero_image_mobile":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/public"}',
  10,
  1
);
