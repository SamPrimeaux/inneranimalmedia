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
  ('ws_inneranimalmedia', 'au_8a5b76b737a9f14c', 'https://inneranimalmedia.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL),
  ('ws_inneranimalmedia', 'au_8a5b76b737a9f14c', 'https://assets.inneranimalmedia.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL),
  ('ws_inneranimalmedia', 'au_8a5b76b737a9f14c', 'https://sandbox.inneranimalmedia.com', NULL, 'persistent', datetime('now'), datetime('now'), NULL);

UPDATE agentsam_browser_trusted_origin
SET updated_at = datetime('now')
WHERE workspace_id = 'ws_inneranimalmedia'
  AND user_id = 'au_8a5b76b737a9f14c'
  AND origin IN (
    'https://inneranimalmedia.com',
    'https://assets.inneranimalmedia.com',
    'https://sandbox.inneranimalmedia.com'
  );
