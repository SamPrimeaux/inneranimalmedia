-- /games four-section CMS layout (interactive_systems hero + 3 feature rows)
-- Retargets sec_games_hero and adds stagger sections for MeauxChess experiences.

UPDATE cms_page_sections
SET
  section_name = 'interactive_systems',
  section_data = '{"headline":"Interactive systems","subheadline":"MeauxGame engine preview.","overlay_title":"3D Multiplayer Chess","overlay_subtitle":"Powered by WebSockets & Durable Objects","cta_label":"Play Full Game","hero_image_desktop":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/hero","hero_image_mobile":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/public"}'
WHERE id = 'sec_games_hero';

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_games_meauxchess_live',
  'page_inneranimalmedia_games',
  'feature_row',
  'meauxchess_live',
  '{"theme":"dark","layout":"text_left","title":"MeauxChess","body":"Real-time 3D multiplayer with private rooms, Resend email invites, and live board sync on Cloudflare Durable Objects.","badge_label":"Live multiplayer","badge_tone":"teal","image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/17381bd3-ef22-4668-dd97-78fa7211b700/avatar","image_alt":"MeauxGame"}',
  20,
  1
);

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_games_meauxgame_engine',
  'page_inneranimalmedia_games',
  'feature_row',
  'meauxgame_engine',
  '{"theme":"light","layout":"text_right","title":"MeauxGame Engine","body":"Premium glass-and-amber pieces, SparkChess-style legal-move illumination, and a locked cinematic camera — built for the browser.","badge_label":"3D interactive","badge_tone":"blue","image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/1b7ecfe9-550c-4ef7-966c-9e1972e29800/thumbnail","image_alt":"MeauxChess board preview"}',
  30,
  1
);

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_games_agent_sam',
  'page_inneranimalmedia_games',
  'feature_row',
  'agent_sam_practice',
  '{"theme":"dark","layout":"text_left","title":"Agent Sam","body":"Practice anytime on the full board. Agent Sam is your orange opponent — capture rails, timers, and a clean SparkChess-style HUD.","badge_label":"AI practice","badge_tone":"teal","image_url":"https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/f8bfc7dd-7234-4336-1029-6f31a5bd7d00/avatar","image_alt":"Agent Sam"}',
  40,
  1
);
