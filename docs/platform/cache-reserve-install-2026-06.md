# Cache Reserve — programmatic install (inneranimalmedia.com)

Automates Smart Tiered Cache pairing, Cache Rules with **Cache Reserve eligibility**, and cache warming for IAM static assets.

## Prerequisites

1. **Cache Reserve** already enabled (Speed → Smart Shield, or Caching → Cache Reserve). The installer attempts the API but dashboard enable is fine.
2. **API token** — create a **zone-scoped** custom token (not break-glass):

   Dashboard → [API Tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Custom Token**

   | Field | Value |
   |-------|--------|
   | Token name | `IAM Cache Reserve` |
   | Permissions | **Cache Rules** → Edit |
   | | **Zone Settings** → Edit |
   | | **Zone** → Read |
   | Zone Resources | Include → **Specific zone** → `inneranimalmedia.com` |

   Save as `CLOUDFLARE_CACHE_RESERVE_TOKEN` in `.env.cloudflare`.

   **Why not break-glass?** `CLOUDFLARE_BREAK_GLASS_ADMIN_TOKEN` has Account Rulesets, Workers, Realtime Admin, etc., but lacks zone **Cache Rules** and **Zone Settings** — install will fail with `request is not authorized`.

3. **`.env.cloudflare`** (from `.env.cloudflare.example`):

```bash
CLOUDFLARE_ACCOUNT_ID=ede6590ac0d2fb7daf155b35653457b2
CLOUDFLARE_CACHE_RESERVE_TOKEN=your_zone_scoped_token
CLOUDFLARE_ZONE_ID=0bab48636c1bea4be4ea61c0c7787c3e   # optional; auto-resolved
```

## One-command install

```bash
npm run cf:install-cache-reserve
npm run cf:warm-cache-reserve
```

Dry run (prints API calls without mutating):

```bash
npm run cf:install-cache-reserve:dry-run
```

Install + warm in one shot:

```bash
./scripts/with-cloudflare-env.sh ./scripts/cloudflare/install-cache-reserve.sh --warm
```

## What gets installed

Rules live in `scripts/cloudflare/cache-reserve-rules.inneranimalmedia.json` and are merged into the zone entrypoint for phase `http_request_cache_settings`:

| Priority | Rule | Action |
|----------|------|--------|
| 1 | Bypass `/api/*`, `/dashboard*`, `/mcp*`, `mcp.*`, `autorag.*`, SW scripts | Bypass cache |
| 2 | `/static/dashboard/app/*` | Cache + Reserve, edge TTL 30d |
| 3 | `/pages/*`, `/cms/themes/*`, marketing slugs | Cache + Reserve, respect origin |
| 4 | Host `assets.inneranimalmedia.com` | Cache + Reserve, edge TTL 1y |
| 5 | Default static extensions (js, css, glb, …) | Cache + Reserve, respect origin |

Existing non-IAM cache rules are preserved (merged after IAM rules).

## Raw API commands (copy-paste)

Set shell vars:

```bash
export CLOUDFLARE_API_TOKEN="your_token"
export ZONE_ID="0bab48636c1bea4be4ea61c0c7787c3e"
export CF_API="https://api.cloudflare.com/client/v4"
```

### 1. Enable Smart Tiered Cache

```bash
curl -sS -X PATCH "$CF_API/zones/$ZONE_ID/cache/tiered_cache_smart_topology_enable" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"value":"on"}' | jq .
```

### 2. Enable Tiered Caching (legacy Argo flag)

```bash
curl -sS -X PATCH "$CF_API/zones/$ZONE_ID/argo/tiered_caching" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"value":"on"}' | jq .
```

### 3. Enable Cache Reserve sync (if not already on)

```bash
curl -sS -X PATCH "$CF_API/zones/$ZONE_ID/cache/cache_reserve" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"value":"on"}' | jq .
```

### 4. Install Cache Rules (full entrypoint)

```bash
curl -sS -X PUT "$CF_API/zones/$ZONE_ID/rulesets/phases/http_request_cache_settings/entrypoint" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @scripts/cloudflare/cache-reserve-rules.inneranimalmedia.json | jq .
```

Note: the JSON file uses `{ "description", "rules" }` shape required by the entrypoint PUT.

### 5. Verify

```bash
curl -sS "$CF_API/zones/$ZONE_ID/rulesets/phases/http_request_cache_settings/entrypoint" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result.rules[] | {description, enabled}'
```

### 6. Warm cache-eligible URLs

```bash
curl -sSI "https://inneranimalmedia.com/static/dashboard/app/dashboard.js" | tr -d '\r' | egrep -i 'HTTP/|cf-cache-status|cache-control'
curl -sSI "https://assets.inneranimalmedia.com/cms/themes/meaux-ocean-soft-dark/theme.css" | tr -d '\r' | egrep -i 'HTTP/|cf-cache-status|cache-control'
```

Run each URL twice; second request should show `cf-cache-status: HIT` once rules + origin headers align.

## Worker origin header (deployed separately)

Long-TTL R2 dashboard static now includes `immutable`:

```http
Cache-Control: public, max-age=31536000, immutable
```

Deploy Worker after pulling: `npm run deploy`

## Analytics

- **Caching → Overview** — zone hit ratio (will stay low due to API traffic; normal)
- **Caching → Cache Reserve → Analytics** — stored bytes + egress savings (24–48h after traffic)

## Uninstall IAM rules only

Re-PUT entrypoint without rules whose description starts with `IAM Cache Reserve:` — or delete individual rules in the dashboard under Caching → Cache Rules.
