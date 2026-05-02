-- Kimbie Dark: flip bg/surface and align key cssVars (SQLite json_set requires bracket paths for keys like --bg-canvas).
UPDATE cms_themes
SET config = json_set(
  config,
  '$.bg', '#4a3d2a',
  '$.surface', '#1e1200',
  '$.cssVars["--bg-canvas"]', '#1e1200',
  '$.cssVars["--bg-elevated"]', '#4a3d2a',
  '$.cssVars["--bg-surface"]', '#1e1200',
  '$.cssVars["--bg-panel"]', '#4a3d2a'
)
WHERE id = 'theme-kimbie-dark';
