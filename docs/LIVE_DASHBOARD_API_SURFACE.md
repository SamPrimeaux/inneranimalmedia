# Live dashboard API surface (from agent-sam R2)

Historical note: the table below was first sourced from R2 keys `dashboard/agent.html`, `finance.js`, `cloud.js` (2026-03-02). **Agent / model / settings routes below are reconciled with the modular Worker (`src/core/router.js`, `src/api/*.js`) and monolithic `worker.js` as of 2026-04-24.**

---

## Source of truth (D1) — models & picker

| Concern | Table / column | Notes |
|--------|------------------|--------|
| Model catalog (keys, names, rates, routing) | **`ai_models`** | Single catalog for picker + provider routing (`api_platform`, `secret_key_name`, etc.). |
| Shown in Agent chat / boot model lists | **`ai_models.show_in_picker`** (0/1) | Filter when `GET /api/agent/models?show_in_picker=1`. Updated via **`POST /api/settings/model-preference`**. |
| Eligible for customer-facing pickers at all | **`ai_models.picker_eligible`** (0/1) | Product-wide gate; defaults **1**. Set **0** for rows that must never appear (e.g. image/audio/embedding after migration **237**). Replaces old Worker SQL allowlists on `api_platform` / `size_class`. |
| Picker section / group label | **`ai_models.picker_group`** (text) | UI groups models under this string (verbatim). Seeded from **`provider`** in migration **237**; edit in D1 for display names. |
| Default model for a user | **`agentsam_bootstrap.ui_preferences_json`** → **`default_model`** | **`GET` / `POST /api/settings/default-model`**. |
| User-owned LLM API keys (encrypted) | **`user_secrets`** (`project_label = iam_user_llm_keys`, `user_id` = auth user) | **`POST /api/vault/store`**, **`GET /api/vault/llm-keys`**, **`DELETE /api/vault/llm-keys/:id`**. |

**Schema migration:** `migrations/237_ai_models_picker_eligible_picker_group.sql` — adds **`picker_eligible`**, **`picker_group`**. Apply to D1 **before** deploying Worker builds that select these columns:

```bash
./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business \
  --remote -c wrangler.production.toml \
  --file=./migrations/237_ai_models_picker_eligible_picker_group.sql
```

**Remote D1 — `migrations apply` is intentionally unused:** `wrangler d1 migrations apply … --remote` attempts a **full linear replay** from the oldest pending migration; replay fails (e.g. **107** / **`cloudflare_deployments`** missing). **Do not waste time on `apply` for this DB** until the ledger is repaired (unlikely). Use **`d1 execute --file=./migrations/…sql`** per change — see **`docs/DEPLOY_AND_AGENT_GUIDE.md` §3**.

---

## Finance (`finance.js`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/colors/all` | Provider/account/tenant/paymentSource colors for badges |
| GET | `/api/finance/summary?month=` | Income, expenses, net, tx_count for KPIs |
| GET | `/api/finance/transactions?month=&limit=&offset=&direction=&category=&account=&search=` | Paginated transaction list |
| GET | `/api/finance/breakdown?month=` | Category breakdown (debit/credit) |
| GET | `/api/finance/categories` | Category list for filters |
| GET | `/api/finance/accounts` | Account list for filters |
| GET | `/api/finance/health` | Financial health metrics |
| GET | `/api/finance/mrr` | MRR data |
| GET | `/api/finance/ai-spend` | AI/tools spend summary |
| POST | `/api/finance/transactions` | Create transaction |
| PUT | `/api/finance/transactions/:id` | Update transaction |
| DELETE | `/api/finance/transactions/:id` | Delete transaction |
| POST | `/api/finance/import` | Bulk import |
| POST | `/api/finance/import-preview` | Import preview |
| POST | `/api/finance/import-spend` | Import spend rows |
| POST | `/api/finance/import-spend-preview` | Spend import preview |
| POST | `/api/finance/enrich-csv` | Enrich CSV rows |
| POST | `/api/finance/agent-session` | Agent session prompt |
| PUT | `/api/finance/health/agency` | Update health agency notes |

**Response shapes (finance.js expects):**
- `summary`: `{ data?: { income, expenses, net, tx_count } }` or root `{ income, expenses, net, tx_count }`
- `transactions`: `{ data: array, total, offset?, limit? }`; each item: `id`, `direction`|`transaction_type`, `amount_cents`, `transaction_date`|`date`, `merchant`|`description`, `category`, `category_name`, `category_color`, `category_icon`, `account_id`, `account_name`, `bank_name`
- `health`: object with health metrics
- `colors/all`: `{ success, providers[], accounts[], tenants[], paymentSources[] }` with `slug`, `primary_color`, `text_on_color`, `display_name`, etc.

---

## Agent (`agent.html` / dashboard shell)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/agent/models` | All **active**, **picker_eligible** rows from **`ai_models`**. JSON **array** of objects (`id`, `name`, `provider`, `model_key`, `api_platform`, `show_in_picker`, `picker_eligible`, `picker_group`, rates, `sort_order`, `context_max_tokens`, `size_class`, tool/vision flags). **No `?provider=` filter** — use D1 data or a dedicated filtered route if added later. |
| GET | `/api/agent/models?show_in_picker=1` | Same as above plus **`AND show_in_picker = 1`**. Used by Agent Sam model picker. |
| GET | `/api/agent/context-refs` | Context references |
| GET | `/api/agent/preview?change_set_id=` | Preview change set |
| GET | `/api/agent/audit-log` | Audit log |
| POST | `/api/agent/apply-change-set` | Apply change set |
| POST | `/api/agent/change-set` | Create/update change set |
| POST | `/api/agent/save-draft` | Save draft |
| POST | `/api/agent/upload-attachment` | Upload attachment (FormData) |
| GET | `/api/agent/conversations` | List conversations |
| GET | `/api/agent/conversations/:id` | Get one conversation |
| POST | `/api/agent/chat` | Send message (streaming or JSON) |
| GET | `/api/finance/ai-spend?scope=agent` | Budget pie / usage for agent |
| GET | `/api/settings/theme` | Theme preference |
| POST | `/api/auth/logout` | Logout |

### Settings & vault (dashboard Settings / Agent)

Authenticated (**session**). Routed via **`src/api/settings.js`** / **`src/api/vault.js`** (and mirrored paths on **`worker.js`** where applicable).

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/ai/models` | Full **`ai_models`** rows for Settings → AI Models (`{ models: [...] }`). |
| POST | `/api/settings/model-preference` | Body: `{ model_key, enabled }` → **`UPDATE ai_models SET show_in_picker`** for that `model_key`. |
| GET | `/api/settings/default-model` | `{ default_model }` from **`agentsam_bootstrap.ui_preferences_json`**. |
| POST | `/api/settings/default-model` | Body: `{ model_key }` → sets **`default_model`** in **`ui_preferences_json`**. |
| POST | `/api/vault/store` | Body: `{ key_name, value }` — allowed names: **`OPENAI_API_KEY`**, **`ANTHROPIC_API_KEY`**, **`GEMINI_API_KEY`**. Encrypts into **`user_secrets`**. |
| GET | `/api/vault/llm-keys` | Lists current user’s vault rows for that project (`{ keys: [{ id, key_name, masked, last4 }] }`). |
| DELETE | `/api/vault/llm-keys/:id` | Revokes one stored key (`is_active = 0`). |

### Client layout (not HTTP)

| Key | Where | Purpose |
|-----|--------|--------|
| `iam_sidebar_expanded` | `localStorage` | `1` / `0` — left icon rail expanded (~180px) vs collapsed (~48px). |

---

## Cloud (`cloud.js`)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/cloud/r2/buckets` | List R2 buckets |
| GET | `/api/cloud/r2/buckets/:bucketName/objects` | List objects in bucket |
| GET | `/api/cloud/r2/preview?bucket=&key=` | Preview object (e.g. iframe src) |
| GET | `/api/dashboard/overview` | Overview stats (alternate to /api/overview/stats?) |
| GET | `/api/cloud/repositories` | Repositories list |
| POST | `/api/cloud/r2/refresh` | Refresh R2 metadata |
| GET | `/api/cloud/r2/buckets/:bucketName/inventory` | Bucket inventory |

---

## Worker routing (current)

- `/dashboard/:page` → DASHBOARD R2 key `static/dashboard/:page.html` or `dashboard/:page.html`
- `/api/settings/*`, `/api/user/*`, **`/api/ai/*`** → modular **`handleSettingsApi`** (`src/api/settings.js`)
- **`/api/agent/*`** (among others) → modular **`handleAgentApi`** (`src/api/agent.js`) when registered before legacy fallback
- So `/dashboard/finance` serves `dashboard/finance.html` from agent-sam (confirmed).
