-- Replace $.cssVars on Kimbie Dark so injected theme matches top-level bg/surface/statusBar/repoSwitcher (no stale hex).
-- Paths use json_set with json() for the whole object (SQLite).
UPDATE cms_themes
SET config = json_set(config, '$.cssVars', json(
'{"--bg-canvas":"#1e1200","--bg-elevated":"#4a3d2a","--bg-nav":"#3a3020","--bg-surface":"#1e1200","--bg-panel":"#4a3d2a","--color-text":"#f5ecd7","--text-primary":"#f5ecd7","--text-secondary":"#c4a882","--text-muted":"#8a7055","--color-border":"rgba(232,213,176,0.15)","--border":"#3d2e1e","--color-primary":"#e8d5b0","--color-primary-hover":"#d4bc94","--color-accent":"#98c379","--color-warning":"#e5c07b","--color-error":"#e06c75","--color-info":"#89b4d4","--radius":"8px","--bg-chat-user":"#3a3020","--bg-chat-agent":"#4a3d2a","--color-chat-user-text":"#f5ecd7","--color-code-bg":"#140c00","--color-code-border":"rgba(232,213,176,0.15)","--color-code-text":"#e6d4b0","--status-bar-bg":"#3a3020","--status-bar-text":"#f0ead8","--repo-switcher-bg":"#7a5c35"}'
))
WHERE id = 'theme-kimbie-dark';
