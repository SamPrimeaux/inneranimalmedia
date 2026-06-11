-- Contact hero: Meshy Jet as ambient scene (not interactive card).
UPDATE cms_page_sections
SET
  section_data = '{"headline":"Get Connected","glb_asset_id":"ds_stock_meshy_jet","glb_url":"/assets/glb/Meshy_AI_Jet_in_Flight_0104205113_texture.glb","glb_alt":"Meshy jet in flight","glb_mode":"ambient","glb_enabled":true}',
  updated_at = datetime('now')
WHERE id = 'sec_contact_hero';
