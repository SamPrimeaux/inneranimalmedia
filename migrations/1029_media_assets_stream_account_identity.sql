-- Stream BYOK: durable identity is cloudflare_account_id + stream_uid (not workspace).
-- created_from_workspace_id is provenance only.

ALTER TABLE media_assets ADD COLUMN stream_uid TEXT;
ALTER TABLE media_assets ADD COLUMN cloudflare_account_id TEXT;
ALTER TABLE media_assets ADD COLUMN provider_credential_source TEXT;
ALTER TABLE media_assets ADD COLUMN created_by_user_id TEXT;
ALTER TABLE media_assets ADD COLUMN created_from_workspace_id TEXT;
ALTER TABLE media_assets ADD COLUMN provider_status TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_media_assets_stream_account_uid
  ON media_assets(cloudflare_account_id, stream_uid)
  WHERE stream_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_stream_uid
  ON media_assets(stream_uid)
  WHERE stream_uid IS NOT NULL;
