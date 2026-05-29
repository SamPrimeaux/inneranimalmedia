-- Allow check_run / check_suite / issue_comment through github-main registry
UPDATE agentsam_webhooks
SET allowed_events = '["workflow_run","push","pull_request","pull_request_review","create","delete","check_run","check_suite","issue_comment"]'
WHERE slug = 'github-main';
