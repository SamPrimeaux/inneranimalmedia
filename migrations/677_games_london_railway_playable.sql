-- /games playable London Dream Railway section
-- Adds the standalone Three.js railway demo as a CMS-backed section after the four marketing rows.

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_games_london_railway',
  'page_inneranimalmedia_games',
  'playable_game',
  'london_dream_railway',
  '{"theme": "dark", "kicker": "Flagship playable demo", "title": "London Dream Railway", "body": "A bright voxel train-table world where little red trains and Tube-inspired carriages weave through London landmarks.", "card_title": "London Dream Railway", "card_body": "Three.js toy-table city with rails, switches, camera tours, landmarks, tunnels, and smooth train loops.", "footer_note": "Playable flagship demo: city table, landmarks, train paths, branch switches, camera tours, instanced props, and optimized WebGL rendering."}',
  50,
  1
);

UPDATE cms_page_sections
SET
  section_type = 'playable_game',
  section_name = 'london_dream_railway',
  section_data = '{"theme": "dark", "kicker": "Flagship playable demo", "title": "London Dream Railway", "body": "A bright voxel train-table world where little red trains and Tube-inspired carriages weave through London landmarks.", "card_title": "London Dream Railway", "card_body": "Three.js toy-table city with rails, switches, camera tours, landmarks, tunnels, and smooth train loops.", "footer_note": "Playable flagship demo: city table, landmarks, train paths, branch switches, camera tours, instanced props, and optimized WebGL rendering."}',
  sort_order = 50,
  is_visible = 1
WHERE id = 'sec_games_london_railway';
