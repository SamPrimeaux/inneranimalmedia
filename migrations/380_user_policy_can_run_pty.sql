-- plan_iam_multi_user_auth_infra: per-user PTY gate via agentsam_user_policy.can_run_pty
ALTER TABLE agentsam_user_policy ADD COLUMN can_run_pty INTEGER NOT NULL DEFAULT 0;
UPDATE agentsam_user_policy SET can_run_pty = 1 WHERE superadmin_uuid IS NOT NULL;
