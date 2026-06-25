-- 701: Mark inline CAD progress templates as live D1 sources (agentsam_cad_jobs.progress_pct)

UPDATE cms_component_templates
SET template_data = json_set(
  COALESCE(template_data, '{}'),
  '$.live_source', 'agentsam_cad_jobs',
  '$.component', 'InlineCadJobProgressLive'
)
WHERE slug IN ('inline-terminal-progress', 'inline-meshy-progress');
