-- Contact page CMS tuning: hero camera/copy + path card labels.

UPDATE cms_page_sections
SET section_data = json_set(
  section_data,
  '$.glb_asset_id',     'ds_stock_meshy_jet',
  '$.glb_url',          '/assets/glb/Meshy_AI_Jet_in_Flight_0104205113_texture.glb',
  '$.glb_mode',         'ambient',
  '$.glb_enabled',      1,
  '$.camera_orbit',     '205deg 82deg 90%',
  '$.rotation_speed',   '5deg',
  '$.exposure',         '0.88',
  '$.shadow_intensity', '0.2',
  '$.eyebrow',          'Inner Animal Media',
  '$.sub',              'Custom platforms, AI systems, and edge infrastructure — built with craft and intention.'
),
updated_at = datetime('now')
WHERE id = 'sec_contact_hero';

UPDATE cms_page_sections
SET section_data = json_set(
  section_data,
  '$.label', 'For clients'
),
updated_at = datetime('now')
WHERE id = 'sec_contact_path_client';

UPDATE cms_page_sections
SET section_data = json_set(
  section_data,
  '$.label', 'For collaborators'
),
updated_at = datetime('now')
WHERE id = 'sec_contact_path_join';
