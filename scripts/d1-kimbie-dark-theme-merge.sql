-- Merge status bar / repo switcher + bg/surface on Kimbie Dark (preserves rest of config JSON)
UPDATE cms_themes
SET config = json_set(
  json_set(
    json_set(
      json_set(
        json_set(config, '$.bg', '#1e1200'),
        '$.surface', '#4a3d2a'
      ),
      '$.statusBar', '#3a3020'
    ),
    '$.statusBarText', '#f0ead8'
  ),
  '$.repoSwitcher', '#7a5c35'
)
WHERE id = 'theme-kimbie-dark';
