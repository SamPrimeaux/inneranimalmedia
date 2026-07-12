-- 837: Enforce uniqueness on integration_registry(tenant_id, provider_key).
-- Live table was rebuilt without UNIQUE(tenant_id, provider_key); ON CONFLICT upserts
-- require this unique index. Dupes already cleared live — index-only migration.

CREATE UNIQUE INDEX IF NOT EXISTS uq_integration_registry_tenant_provider
  ON integration_registry (tenant_id, provider_key);
