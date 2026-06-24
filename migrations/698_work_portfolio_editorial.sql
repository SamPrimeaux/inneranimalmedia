-- Editorial portfolio: truthful IAM-owned + client work only (5 projects).
-- Archives placeholder / third-party case studies from the old gallery.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
--     --remote -c wrangler.production.toml --file=./migrations/698_work_portfolio_editorial.sql

UPDATE cms_page_sections
SET
  section_data = '{"eyebrow":"Portfolio","heading":"Selected work","subheading":"Real projects you can credibly show","cards":[{"slug":"companionscpas","title":"Companions of CPAS","type_label":"Client / nonprofit","group":"client","layout":"large","layout_offset":false,"excerpt":"Rescue-focused website and CMS system for adoptable animals, foster needs, donations, and community updates.","tags":["Website","CMS","Nonprofit","Donations","Animal profiles"],"accent_color":"#2f7bff","detail_route":"/work/companionscpas"},{"slug":"fuelnfreetime","title":"Fuel N Free Time","type_label":"Client / commerce brand","group":"client","layout":"half","layout_offset":false,"excerpt":"Lifestyle brand experience with product-forward pages, mobile-first polish, and brand storytelling.","tags":["Website","E-commerce","Brand system","Mobile UX"],"accent_color":"#ef4444","detail_route":"/work/fuelnfreetime"},{"slug":"meauxbility","title":"Meauxbility","type_label":"Nonprofit / owned initiative","group":"owned","layout":"half","layout_offset":true,"excerpt":"Accessibility-focused nonprofit platform built around fundraising, athlete support, storytelling, and community impact.","tags":["Nonprofit","Fundraising","Storytelling","CMS"],"accent_color":"#25c878","detail_route":"https://meauxbility.org"},{"slug":"inneranimalmedia","title":"InnerAnimalMedia Platform","type_label":"Internal product","group":"owned","layout":"large","layout_offset":false,"excerpt":"AI-native dashboard for managing content, client systems, tools, files, automations, and production workflows.","tags":["Product design","Dashboard","AI tools","Infrastructure"],"accent_color":"#67e8ff","detail_route":"/work/inneranimalmedia"},{"slug":"designstudio","title":"Design Studio","type_label":"Internal product / lab","group":"owned","layout":"large","layout_offset":false,"excerpt":"Mobile-first creative workspace for 3D assets, CAD generation, model editing, animation libraries, and agent-assisted production.","tags":["3D","CAD","UI/UX","Agent workflows"],"accent_color":"#8b5cf6","detail_route":"/work/designstudio"}]}',
  updated_at = unixepoch()
WHERE id = 'sec_work_portfolio_gallery';

UPDATE cms_pages
SET status = 'archived', is_active = 0, updated_at = unixepoch()
WHERE id IN (
  'page_work_workslayr',
  'page_work_sitesnapps',
  'page_work_trickcel',
  'page_work_meauxchess',
  'page_work_meauxcloud'
);
