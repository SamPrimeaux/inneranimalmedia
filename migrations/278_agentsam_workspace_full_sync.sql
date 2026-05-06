PRAGMA foreign_keys = OFF;

-- Fix existing rows
UPDATE agentsam_workspace SET tenant_id='tenant_sam_primeaux', display_name='Inner Animal Media — Main' WHERE id='ws_inneranimalmedia';
UPDATE agentsam_workspace SET tenant_id='tenant_sam_primeaux', display_name='DesignStudio / MeauxCAD'  WHERE id='ws_designstudio';
UPDATE agentsam_workspace SET display_name='Agent Sam Workspace' WHERE id='ws_sam_primeaux';

-- Insert all missing active tenant workspaces
INSERT OR IGNORE INTO agentsam_workspace (id, workspace_slug, tenant_id, name, display_name, status) VALUES
  ('ws_anythingfloorsandmore',  'anything-floors-and-more',    'tenant_anything_floors_2026',   'Anything Floors and More',                   'Anything Floors',          'active'),
  ('ws_demoworkspace',          'demo-workspace',              'tenant_demo_sandbox',            'Demo Workspace',                             'Demo',                     'active'),
  ('ws_dylanhollier',           'dylan-hollier',               'tenant_dylan_hollier',           'Dylan Hollier',                              'Dylan Hollier',            'active'),
  ('ws_platform',               'platform',                    'tenant_platform',                'InnerAnimal Media Platform',                 'IAM Platform',             'active'),
  ('ws_saas',                   'saas',                        'tenant_saas',                    'InnerAnimal Media SaaS',                     'IAM SaaS',                 'active'),
  ('ws_justinmolaison',         'justin-molaison',             'tenant_justin_molaison',         'Justin Molaison',                            'Justin Molaison',          'active'),
  ('ws_ncnh',                   'ncnh',                        'tenant_kearn_dooley_ncnh',       'New Creation Natural Health',                'NC Natural Health',        'active'),
  ('ws_ncp',                    'ncp',                         'tenant_kearn_dooley_ncp',        'New Creation Peptides',                      'NC Peptides',              'active'),
  ('ws_knowledgeplatform',      'knowledge-platform',          'tenant_knowledge_platform',      'Knowledge Platform / iAutodidact',           'iAutodidact',              'active'),
  ('ws_nonprofitorganization',  'nonprofit-organization',      'tenant_nonprofit_organization',  'Meauxbility Foundation (Nonprofit)',         'Meauxbility Foundation',   'active'),
  ('ws_natashacloteaux',        'natasha-cloteaux',            'tenant_natasha_cloteaux',        'Natasha Cloteaux',                           'Natasha Cloteaux',         'active'),
  ('ws_newiberiachurchofchrist','newiberiachurchofchrist',     'tenant_newiberia_20260110',      'New Iberia Church of Christ',                'NICOC',                    'active'),
  ('ws_pawlove',                'paw-love',                    'tenant_pawlove',                 'Paw Love Rescue',                            'Paw Love',                 'active'),
  ('ws_pelicanpeptides',        'pelican-peptides',            'tenant_pelican_peptides',        'Pelican Peptides',                           'Pelican Peptides',         'active'),
  ('ws_sandbox',                'sandbox',                     'tenant_sandbox',                 'Sandbox / Experiments',                      'Sandbox',                  'active'),
  ('ws_swampblood',             'swampbloodgatorguides',       'tenant_swampblood',              'Swamp Blood Gator Guides',                   'Swamp Blood',              'active'),
  ('ws_system',                 'system',                      'system',                         'System',                                     'System',                   'active'),
  ('ws_nicoc',                  'nicoc',                       'tenant_nicoc',                   'New Iberia Church of Christ (Legacy)',        'NICOC Legacy',             'paused');

-- Fix Swamp Blood's old bad workspace_id reference in tenants table
UPDATE tenants SET workspace_id='ws_swampblood' WHERE id='tenant_swampblood';

PRAGMA foreign_keys = ON;
