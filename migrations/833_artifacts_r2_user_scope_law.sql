-- 833: Document ARTIFACTS R2 user-scope law (no schema change).
-- Bucket: artifacts (Worker binding ARTIFACTS)
-- Canonical key: user/{au_*}/{kind}/{artifact_id}.{ext}
-- List/CRUD: agentsam_artifacts.user_id = caller (mutate owner-only);
--   shared project read via project_collaborators / projects.owner_user_id.
-- Legacy keys like artifacts/user/ws_* remain readable via D1 user_id only.

SELECT 'rule_artifacts_r2_user_scope' AS note;
