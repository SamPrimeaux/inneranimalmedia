-- GitHub OAuth scopes in integration_catalog used invalid names (user:read, repo:read)
-- that are not real GitHub OAuth scopes, breaking GET /api/integrations/github/connect.
UPDATE integration_catalog
SET
  oauth_scopes_default = '["repo","read:user","user:email"]',
  oauth_scopes_available = '["repo","read:user","user:email","read:org","workflow","public_repo"]'
WHERE LOWER(slug) = 'github';
