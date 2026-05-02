ALTER TABLE quality_runs ADD COLUMN deployment_id TEXT;
ALTER TABLE quality_runs ADD COLUMN status TEXT DEFAULT 'running';
ALTER TABLE quality_runs ADD COLUMN started_at TEXT;
ALTER TABLE quality_runs ADD COLUMN completed_at TEXT;
ALTER TABLE quality_results ADD COLUMN check_name TEXT;
ALTER TABLE quality_results ADD COLUMN detail TEXT;
