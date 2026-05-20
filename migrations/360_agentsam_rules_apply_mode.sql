-- Rules apply mode + globs (Cursor-style: always | glob | manual)
-- Idempotent ALTERs for agentsam_rules_document

ALTER TABLE agentsam_rules_document ADD COLUMN apply_mode TEXT NOT NULL DEFAULT 'always';
ALTER TABLE agentsam_rules_document ADD COLUMN globs TEXT;
ALTER TABLE agentsam_rules_document ADD COLUMN source TEXT NOT NULL DEFAULT 'dashboard';
ALTER TABLE agentsam_rules_document ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
