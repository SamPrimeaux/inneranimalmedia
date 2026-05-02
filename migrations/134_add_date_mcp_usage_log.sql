-- 134 add: mcp_usage_log may lack date column; add it so CREATE INDEX in 134 succeeds.

ALTER TABLE mcp_usage_log ADD COLUMN date TEXT;
