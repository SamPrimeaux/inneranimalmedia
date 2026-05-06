-- Optional audit column for webhook HTTP headers (payload purge cron NULLs this column).
ALTER TABLE agentsam_webhook_events ADD COLUMN headers_json TEXT;
