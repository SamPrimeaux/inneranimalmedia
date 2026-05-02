# D1 audit — `inneranimalmedia-business` (remote)

**Database ID:** `cf87b717-d4e2-4cf8-bab0-a81268e32d49`  
**Binding:** `DB` in `wrangler.production.toml`  
**Read-only audit run:** 2026-03-22 (wrangler `d1 execute --remote`)

---

## Executive summary

| Area | State |
|------|--------|
| **`cms_themes` v2 trio** | **Present:** `kimbie-dark`, `solarized-dark`, `solarized-light` with `config` (~655–659 bytes), `theme_family` (`dark` / `light`), `sort_order` (10, 11, 20). |
| **`cms_themes` schema** | Full: `tenant_id`, `css_url`, `config`, `is_system`, `wcag_scores`, `contrast_flags`, **`theme_family`**, **`sort_order`**. Index **`idx_cms_themes_family_sort`** exists. |
| **`agentsam_*` tables** | **All 12** from the cursor-parity bundle exist in production with expected indexes. |
| **Data volume (spot check)** | `agentsam_user_policy`: **1** row; `agentsam_command_allowlist`: **49**; `agentsam_feature_flag`: **3**; `agentsam_agent_run`: **0** (not yet instrumented). |
| **Repo drift** | **Resolved:** `migrations/163_agentsam_cursor_parity.sql` added (copy of `scripts/d1-cursor-parity-schema-review.sql`). Production already had objects; file is for **new/staging** D1 and documentation. |
| **API gap** | **`GET /api/themes`** returns only `id, name, slug, config` — **omits** `theme_family`, `sort_order`, `css_url`, `tenant_id`, `wcag_scores`, `contrast_flags`. UI cannot group like Cursor without extending the query (worker change; needs Sam approval per line-level rule). |

---

## `cms_themes` — v2 themes (verified)

| slug | id | theme_family | sort_order | tenant_id | config len |
|------|----|--------------|------------|-----------|------------|
| solarized-dark | theme-solarized-dark | dark | 10 | null | 655 |
| solarized-light | theme-solarized-light | light | 11 | null | 656 |
| kimbie-dark | theme-kimbie-dark | dark | 20 | null | 659 |

**Update 2026-03-22:** Every theme row uses **`theme_family` `dark` or `light` only** (78 rows). **`meaux-solar`** is **`dark`** (`#001b2e`). Script: `scripts/d1-normalize-theme-family-light-dark.sql`.

**Total themes:** 78 rows.

---

## `agentsam_*` tables (verified present)

`agentsam_user_policy`, `agentsam_command_allowlist`, `agentsam_mcp_allowlist`, `agentsam_fetch_domain_allowlist`, `agentsam_browser_trusted_origin`, `agentsam_feature_flag`, `agentsam_user_feature_override`, `agentsam_agent_run`, `agentsam_code_index_job`, `agentsam_subagent_profile`, `agentsam_ignore_pattern`, `agentsam_rules_document`, `agentsam_rules_revision`.

Indexes present include: `idx_agentsam_user_policy_user`, allowlist user/workspace indexes, run user/created/conversation/idempotency, subagent user, ignore/rules indexes.

---

## Recommended improvements (priority)

### 1. Worker: extend `GET /api/themes` (high)

**File:** `worker.js` (approx. lines 1902–1904).

**Current:**

```sql
SELECT id, name, slug, config FROM cms_themes ORDER BY is_system DESC, name ASC
```

**Proposed:**

```sql
SELECT id, name, slug, config, theme_family, sort_order, css_url, tenant_id, wcag_scores, contrast_flags, is_system
FROM cms_themes
ORDER BY is_system DESC, theme_family, sort_order, name ASC
```

Dashboard/theme picker can then section by **`theme_family`** without parsing `config` JSON.

### 2. Instrument `agentsam_agent_run` (medium)

Zero rows means no lifecycle logging yet. On agent request start / finish in worker (or dashboard gateway), insert/update rows with `conversation_id`, `status`, tokens/cost when available. Ties to **Plan & Usage**-style reporting.

### 3. Migration in repo (done)

`migrations/163_agentsam_cursor_parity.sql` — run on **new/staging** D1; production already contains these objects (`CREATE IF NOT EXISTS` is a no-op).

### 4. Optional: `tenant_id` on system themes (low)

All three v2 themes have `tenant_id` **null** (global). Correct for IAM-wide gallery. If you add **per-tenant** themes later, use non-null `tenant_id` and filter in API by authenticated tenant.

### 5. Optional: `wcag_scores` / `contrast_flags` (low)

Columns exist but are unused for v2 themes. Populate when you run an automated contrast audit pipeline.

---

## SQL file for optional follow-ups

No required INSERTs for themes (already in DB). See:

- `scripts/d1-refinements-optional-post-audit.sql` — commented optional statements only.

---

## Commands used (repeat audit)

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --command "PRAGMA table_info(cms_themes);"
```
