DELETE FROM agentsam_webhook_weekly;

INSERT INTO agentsam_webhook_weekly (
  id,
  tenant_id,
  workspace_id,
  endpoint_id,
  provider,
  event_type,
  week_start_unix,
  total_received,
  total_processed,
  total_failed,
  total_input_tokens,
  total_output_tokens,
  total_cost_usd,
  last_processed_unix,
  updated_at
)
SELECT
  'whr_' || lower(hex(randomblob(8))),
  agg.tenant_id,
  agg.workspace_id,
  agg.endpoint_id,
  agg.provider,
  agg.event_type,
  agg.week_start_unix,
  agg.total_received,
  agg.total_processed,
  agg.total_failed,
  agg.total_input_tokens,
  agg.total_output_tokens,
  agg.total_cost_usd,
  agg.last_processed_unix,
  unixepoch()
FROM (
  SELECT
    tenant_id,
    COALESCE(workspace_id, '') AS workspace_id,
    COALESCE(NULLIF(trim(endpoint_id), ''), '__unknown__') AS endpoint_id,
    provider,
    event_type,
    week_start_unix,
    COUNT(*) AS total_received,
    SUM(CASE WHEN status = 'processed' THEN 1 ELSE 0 END) AS total_processed,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS total_failed,
    COALESCE(SUM(COALESCE(input_tokens, 0)), 0) AS total_input_tokens,
    COALESCE(SUM(COALESCE(output_tokens, 0)), 0) AS total_output_tokens,
    COALESCE(SUM(COALESCE(cost_usd, 0)), 0) AS total_cost_usd,
    MAX(COALESCE(processed_at_unix, received_at_unix)) AS last_processed_unix
  FROM (
    SELECT
      tenant_id,
      workspace_id,
      endpoint_id,
      provider,
      event_type,
      status,
      received_at_unix,
      processed_at_unix,
      input_tokens,
      output_tokens,
      cost_usd,
      (
        received_at_unix
        - ((CAST(strftime('%w', datetime(received_at_unix, 'unixepoch')) AS INTEGER) + 6) % 7) * 86400
        - CAST(strftime('%H', datetime(received_at_unix, 'unixepoch')) AS INTEGER) * 3600
        - CAST(strftime('%M', datetime(received_at_unix, 'unixepoch')) AS INTEGER) * 60
        - CAST(strftime('%S', datetime(received_at_unix, 'unixepoch')) AS INTEGER)
      ) AS week_start_unix
    FROM agentsam_webhook_events
    WHERE received_at_unix IS NOT NULL
      AND tenant_id IS NOT NULL
      AND trim(tenant_id) != ''
  ) e
  WHERE e.week_start_unix < (
    unixepoch()
    - ((CAST(strftime('%w', 'now') AS INTEGER) + 6) % 7) * 86400
    - CAST(strftime('%H', 'now') AS INTEGER) * 3600
    - CAST(strftime('%M', 'now') AS INTEGER) * 60
    - CAST(strftime('%S', 'now') AS INTEGER)
  )
  GROUP BY tenant_id, workspace_id, endpoint_id, provider, event_type, week_start_unix
) agg;
