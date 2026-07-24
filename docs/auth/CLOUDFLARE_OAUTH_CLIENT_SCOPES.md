# Inner Animal Media Platform — Cloudflare OAuth client scopes

**Client name:** Inner Animal Media Platform  
**Where:** Cloudflare dashboard → Manage Account → OAuth clients  
**SSOT for “what the client offers”:** this file (paste from dash when scopes change)  
**What the Worker requests at authorize time:** subset in `src/api/oauth.js` → `CLOUDFLARE_OAUTH_SCOPES` (must be ⊆ this list or auth fails with `invalid_scope`)

**Last verified from dash:** 2026-07-23 — **60 scopes** (including `offline_access`)

---

## Rule

| Layer | Role |
|-------|------|
| **OAuth client (dash)** | Maximum scopes the app is *allowed* to request |
| **`CLOUDFLARE_OAUTH_SCOPES` (Worker)** | Scopes we *actually* request on `/api/oauth/cloudflare/start` |
| **User consent** | After client or request list changes, users must **reconnect** Cloudflare |

Never request a scope that is not in the client list below.

---

## Full client catalog (60)

### Developer Platform

| Dashboard label | Scope id |
|-----------------|----------|
| Agent Memory Write | `agent-memory.write` |
| CF Agents Write | `cf-agents.write` |
| D1 Read | `d1.read` |
| D1 Write | `d1.write` |
| Hyperdrive Read | `query-cache.read` |
| Hyperdrive Write | `query-cache.write` |
| MCP Portals Read | `mcp-portals.read` |
| MCP Portals Write | `mcp-portals.write` |
| Pages Read | `page.read` |
| Pages Write | `page.write` |
| Vectorize Read | `vectorize.read` |
| Vectorize Write | `vectorize.write` |
| Workers CI Read | `workers-ci.read` |
| Workers CI Write | `workers-ci.write` |
| Workers Containers Read | `containers.read` |
| Workers Containers Write | `containers.write` |
| Workers KV Storage Read | `workers-kv-storage.read` |
| Workers KV Storage Write | `workers-kv-storage.write` |
| Workers R2 Data Catalog Read | `r2-catalog.read` |
| Workers R2 Data Catalog Write | `r2-catalog.write` |
| Workers R2 SQL Read | `r2-catalog-sql.read` |
| Workers R2 Storage Bucket Item Read | `workers-r2-bucket-item.read` |
| Workers R2 Storage Bucket Item Write | `workers-r2-bucket-item.write` |
| Workers R2 Storage Read | `workers-r2.read` |
| Workers R2 Storage Write | `workers-r2.write` |
| Workers Routes Read | `workers-routes.read` |
| Workers Routes Write | `workers-routes.write` |
| Workers Scripts Read | `workers-scripts.read` |
| Workers Scripts Write | `workers-scripts.write` |
| Workers Tail Read | `workers-tail.read` |

### AI & Machine Learning

| Dashboard label | Scope id |
|-----------------|----------|
| AI Search Index Engine | `ai-search.index` |
| AI Search Read | `ai-search.read` |
| AI Search Run | `ai-search.run` |
| AI Search Write | `ai-search.write` |
| Agents Gateway Read | `agw.read` |
| Agents Gateway Run | `agw.run` |
| Agents Gateway Write | `agw.write` |
| Auto Rag Read | `rag.read` |
| Auto Rag Write | `rag.write` |
| Auto Rag Write Run Engine | `rag.run` |
| Websearch Run | `websearch.run` |
| Workers AI Read | `ai.read` |
| Workers AI Write | `ai.write` |

### DNS & Zones

| Dashboard label | Scope id |
|-----------------|----------|
| Zone Read | `zone.read` |

### Cloudflare One / Zero Trust

| Dashboard label | Scope id |
|-----------------|----------|
| Cloudflare One Connector: WARP Read | `teams-connector-warp.read` |
| Cloudflare One Connector: WARP Write | `teams-connector-warp.write` |
| Cloudflare One Connectors Read | `teams-connectors.read` |
| Cloudflare One Connectors Write | `teams-connectors.write` |

### Analytics & Logs

| Dashboard label | Scope id |
|-----------------|----------|
| Account Analytics Read | `account-analytics.read` |

### Media (Images / Stream)

| Dashboard label | Scope id |
|-----------------|----------|
| Images Read | `images.read` |
| Images Write | `images.write` |
| Stream Read | `stream.read` |
| Stream Write | `stream.write` |

### Cache & Performance

| Dashboard label | Scope id |
|-----------------|----------|
| Cache Settings Read | `cache-settings.read` |

### Account & Billing

| Dashboard label | Scope id |
|-----------------|----------|
| Account Settings Read | `account-settings.read` |
| Integration Write | `integration.write` |
| Notifications Read | `notifications.read` |
| Notifications Write | `notifications.write` |
| User Details Read | `user-details.read` |

### Other

| Dashboard label | Scope id |
|-----------------|----------|
| offline_access | `offline_access` |

---

## Media Library note

For `/dashboard/images` customer BYOK:

- Client **offers** `images.read` + `images.write` (confirmed in this catalog).
- Worker authorize list **must include** those two when requesting CF Images features.
- There is **no** `images.metadata_read` on this client — do not request it.
- R2 remains `workers-r2.*` + `workers-r2-bucket-item.*` (already offered).

Platform Sam may still use Wrangler secrets / platform Images token for platform-hosted assets; customer paths go through OAuth after reconnect.

---

## Related code

- Authorize URL builder: `src/api/oauth.js` (`CLOUDFLARE_OAUTH_SCOPES`, `resolveCloudflareOAuthScopes`)
- Images creds resolver: `src/core/cf-oauth-images.js`
- Sprint: `plans/active/cf-images-media-editor-2026-07.md`
