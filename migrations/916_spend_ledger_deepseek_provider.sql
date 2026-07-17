-- DeepSeek is directly billed by the platform and must retain first-class
-- provider attribution in spend_ledger.

CREATE TABLE spend_ledger__916 (
  id            TEXT    PRIMARY KEY DEFAULT ('sl_' || lower(hex(randomblob(8)))),
  tenant_id     TEXT    NOT NULL,
  workspace_id  TEXT    NOT NULL,
  brand_id      TEXT,
  provider      TEXT    NOT NULL CHECK (provider IN (
    'anthropic','openai','cursor','cloudflare_workers_ai','google','deepseek',
    'cloudflare','stripe','shopify','vercel','supabase','resend','other'
  )),
  source        TEXT    NOT NULL CHECK (source IN (
    'api_direct','cursor_usage','cursor_subscription','invoice',
    'subscription','neuron','manual','import'
  )),
  occurred_at   INTEGER NOT NULL,
  amount_usd    REAL    NOT NULL CHECK (amount_usd >= 0),
  model_key     TEXT,
  tokens_in     INTEGER CHECK (tokens_in IS NULL OR tokens_in >= 0),
  tokens_out    INTEGER CHECK (tokens_out IS NULL OR tokens_out >= 0),
  neurons_used  INTEGER CHECK (neurons_used IS NULL OR neurons_used >= 0),
  ref_table     TEXT,
  ref_id        TEXT,
  metadata_json TEXT    DEFAULT '{}',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  account_email TEXT,
  provider_slug TEXT,
  date          TEXT,
  service       TEXT,
  description   TEXT,
  category      TEXT,
  notes         TEXT,
  data_source   TEXT,
  confidence    TEXT,
  session_tag   TEXT,
  project_id    TEXT,
  neuron_cost_usd REAL DEFAULT 0,
  person_uuid   TEXT,
  UNIQUE (ref_table, ref_id)
);

INSERT INTO spend_ledger__916 (
  id, tenant_id, workspace_id, brand_id, provider, source, occurred_at,
  amount_usd, model_key, tokens_in, tokens_out, neurons_used, ref_table,
  ref_id, metadata_json, created_at, updated_at, account_email, provider_slug,
  date, service, description, category, notes, data_source, confidence,
  session_tag, project_id, neuron_cost_usd, person_uuid
)
SELECT
  id, tenant_id, workspace_id, brand_id, provider, source, occurred_at,
  amount_usd, model_key, tokens_in, tokens_out, neurons_used, ref_table,
  ref_id, metadata_json, created_at, updated_at, account_email, provider_slug,
  date, service, description, category, notes, data_source, confidence,
  session_tag, project_id, neuron_cost_usd, person_uuid
FROM spend_ledger;

DROP TABLE spend_ledger;
ALTER TABLE spend_ledger__916 RENAME TO spend_ledger;

CREATE INDEX idx_spend_ledger_brand
  ON spend_ledger (brand_id, occurred_at DESC);
CREATE INDEX idx_spend_ledger_provider_date
  ON spend_ledger (provider, occurred_at DESC);
CREATE INDEX idx_spend_ledger_tenant_date
  ON spend_ledger (tenant_id, workspace_id, occurred_at DESC);
