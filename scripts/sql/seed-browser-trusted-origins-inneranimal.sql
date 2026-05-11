INSERT OR IGNORE INTO agentsam_browser_trusted_origin (
  workspace_id,
  user_id,
  origin,
  cert_fingerprint_sha256,
  trust_scope,
  created_at,
  updated_at,
  person_uuid
)
VALUES
  ('ws_inneranimalmedia', '{USER_ID}', 'https://inneranimalmedia.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL),
  ('ws_inneranimalmedia', '{USER_ID}', 'https://assets.inneranimalmedia.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL),
  ('ws_inneranimalmedia', '{USER_ID}', 'https://sandbox.inneranimalmedia.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL);

UPDATE agentsam_browser_trusted_origin
SET updated_at = datetime('now')
WHERE workspace_id = 'ws_inneranimalmedia'
  AND user_id = '{USER_ID}'
  AND origin IN (
    'https://inneranimalmedia.com',
    'https://assets.inneranimalmedia.com',
    'https://sandbox.inneranimalmedia.com'
  );
