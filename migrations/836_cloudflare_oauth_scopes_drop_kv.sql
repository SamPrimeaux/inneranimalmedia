-- 836: Drop workers-kv-storage.* from Cloudflare catalog scopes.
-- Those scopes exist globally but are NOT enabled on the IAM OAuth client,
-- so authorize returns invalid_scope (no code) and reconnect fails.

UPDATE integration_catalog
   SET oauth_scopes_default = json('[
     "account-settings.read",
     "zone.read",
     "cf-agents.write",
     "d1.read",
     "d1.write",
     "query-cache.read",
     "query-cache.write",
     "mcp-portals.read",
     "mcp-portals.write",
     "page.read",
     "page.write",
     "vectorize.read",
     "vectorize.write",
     "workers-r2.read",
     "workers-r2.write",
     "workers-r2-bucket-item.read",
     "workers-r2-bucket-item.write",
     "workers-routes.read",
     "workers-routes.write",
     "workers-scripts.read",
     "workers-scripts.write",
     "offline_access"
   ]'),
       oauth_scopes_available = json('[
     "account-settings.read",
     "zone.read",
     "cf-agents.write",
     "d1.read",
     "d1.write",
     "query-cache.read",
     "query-cache.write",
     "mcp-portals.read",
     "mcp-portals.write",
     "page.read",
     "page.write",
     "vectorize.read",
     "vectorize.write",
     "workers-r2.read",
     "workers-r2.write",
     "workers-r2-bucket-item.read",
     "workers-r2-bucket-item.write",
     "workers-routes.read",
     "workers-routes.write",
     "workers-scripts.read",
     "workers-scripts.write",
     "offline_access"
   ]')
 WHERE lower(slug) = 'cloudflare';
