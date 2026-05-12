
CREATE UNIQUE INDEX IF NOT EXISTS idx_agentsam_prompt_cache_keys_unique
ON agentsam_prompt_cache_keys (
  tenant_id,
  provider,
  model_key,
  cache_key_hash
);

CREATE INDEX IF NOT EXISTS idx_agentsam_prompt_cache_keys_route
ON agentsam_prompt_cache_keys (
  tenant_id,
  route_key,
  provider,
  model_key
);

CREATE INDEX IF NOT EXISTS idx_agentsam_prompt_cache_keys_source
ON agentsam_prompt_cache_keys (
  tenant_id,
  source_type,
  source_id
);
