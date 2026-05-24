-- Default shield rules for every existing tenant (idempotent).
INSERT INTO security_shield_rules (id, tenant_id, user_id, rule_type, severity, config_json, notify_channels)
SELECT
  'ssr_' || lower(hex(randomblob(8))),
  t.id,
  NULL,
  rules.rule_type,
  rules.severity,
  rules.config_json,
  rules.notify_channels
FROM tenants t
CROSS JOIN (
  SELECT 'key_expiry_warning' AS rule_type, 'high' AS severity, '{"days_before":14}' AS config_json, '["dashboard","email"]' AS notify_channels
  UNION ALL
  SELECT 'rotation_due', 'medium', '{"days":90}', '["dashboard"]'
  UNION ALL
  SELECT 'untested_key_age', 'medium', '{"days":30}', '["dashboard"]'
  UNION ALL
  SELECT 'null_value_registered', 'high', '{}', '["dashboard","email"]'
  UNION ALL
  SELECT 'test_failure', 'high', '{}', '["dashboard","email"]'
) rules
WHERE NOT EXISTS (
  SELECT 1 FROM security_shield_rules sr
  WHERE sr.tenant_id = t.id AND sr.rule_type = rules.rule_type AND sr.user_id IS NULL
);
