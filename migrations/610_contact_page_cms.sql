-- Contact page CMS registry: editable hero, paths, and collaborate section.
-- Worker hydrates pages/contact/index.html from cms_page_sections at request time.

INSERT OR IGNORE INTO cms_pages (
  id,
  project_id,
  project_slug,
  tenant_id,
  workspace_id,
  slug,
  path,
  route_path,
  page_type,
  title,
  meta_description,
  status,
  r2_bucket,
  r2_key,
  is_active,
  created_at,
  updated_at,
  published_at
)
SELECT
  'page_contact',
  project_id,
  project_slug,
  tenant_id,
  workspace_id,
  'contact',
  '/contact',
  '/contact',
  'contact',
  'Contact',
  'Get connected with Inner Animal Media.',
  'published',
  'inneranimalmedia',
  'pages/contact/index.html',
  1,
  unixepoch(),
  unixepoch(),
  unixepoch()
FROM cms_pages
WHERE id = 'page_home'
LIMIT 1;

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_contact_hero',
  'page_contact',
  'hero',
  'contact_hero',
  '{"headline":"Get Connected","glb_asset_id":"ds_stock_kinetic_symmetry","glb_url":"https://pub-e733f82cb31c4f34b6a719e749d0416d.r2.dev/Kinetic_Symmetry_0831084700_generate%20(1).glb","glb_alt":"Abstract form","glb_enabled":true}',
  10,
  1
);

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_contact_path_client',
  'page_contact',
  'contact_path',
  'client',
  '{"title":"Become a Client","copy":"Websites, platforms, dashboards, AI tools, automation, and custom digital systems.","email":"hey@inneranimalmedia.com","cta_label":"Start a Project","cta_href":"mailto:hey@inneranimalmedia.com"}',
  20,
  1
);

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_contact_path_join',
  'page_contact',
  'contact_path',
  'join',
  '{"title":"Join Us","copy":"Designers, developers, creators, operators, and collaborators interested in building with IAM.","cta_label":"See Opportunities","cta_href":"/work"}',
  30,
  1
);

INSERT OR IGNORE INTO cms_page_sections (
  id, page_id, section_type, section_name, section_data, sort_order, is_visible
) VALUES (
  'sec_contact_build',
  'page_contact',
  'collaborate',
  'build_with_us',
  '{"title":"Build with us.","copy":"We partner with people who care about craft, systems, and long-term product quality.","cta_label":"See Opportunities","cta_href":"/work"}',
  40,
  1
);
