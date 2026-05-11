-- Agent Sam tools input_schema cleanup
-- Converts shorthand agentsam_tools.input_schema into OpenAI-compatible JSON Schema.
-- Safe pattern:
-- 1. Backup rows that may be touched.
-- 2. Convert invalid/empty schemas to empty object schema.
-- 3. Convert shorthand root schemas.
-- 4. Normalize schemas with properties but missing root defaults.
-- 5. Verify remaining invalid rows.

CREATE TABLE IF NOT EXISTS agentsam_tools_input_schema_backup (
  backup_id TEXT PRIMARY KEY DEFAULT ('ast_schema_bak_' || lower(hex(randomblob(8)))),
  tool_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  old_input_schema TEXT,
  reason TEXT NOT NULL,
  backed_up_at INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO agentsam_tools_input_schema_backup (
  tool_id,
  tool_name,
  old_input_schema,
  reason
)
SELECT
  id,
  tool_name,
  input_schema,
  CASE
    WHEN input_schema IS NULL OR trim(input_schema) = '' THEN 'empty_or_null'
    WHEN COALESCE(json_valid(input_schema), 0) = 0 THEN 'invalid_json'
    WHEN json_valid(input_schema) = 1
      AND json_type(input_schema) = 'object'
      AND json_extract(input_schema, '$.type') IS NULL
      AND json_extract(input_schema, '$.properties') IS NULL THEN 'shorthand_root'
    WHEN json_valid(input_schema) = 1
      AND json_type(input_schema) = 'object'
      AND json_type(input_schema, '$.properties') = 'object' THEN 'normalize_properties_root'
    ELSE 'other'
  END
FROM agentsam_tools
WHERE
  input_schema IS NULL
  OR trim(input_schema) = ''
  OR COALESCE(json_valid(input_schema), 0) = 0
  OR (
    json_valid(input_schema) = 1
    AND json_type(input_schema) = 'object'
    AND json_extract(input_schema, '$.type') IS NULL
    AND json_extract(input_schema, '$.properties') IS NULL
  )
  OR (
    json_valid(input_schema) = 1
    AND json_type(input_schema) = 'object'
    AND json_type(input_schema, '$.properties') = 'object'
  );

-- Invalid / empty schemas cannot be safely inferred.
-- Make them valid empty object schemas so OpenAI does not reject the whole tool list.
UPDATE agentsam_tools
SET
  input_schema = json_object(
    'type', 'object',
    'properties', json_object(),
    'additionalProperties', json('false')
  ),
  updated_at = unixepoch()
WHERE
  input_schema IS NULL
  OR trim(input_schema) = ''
  OR COALESCE(json_valid(input_schema), 0) = 0;

-- Convert shorthand root:
-- {"url":"string","selector":"string"}
-- into:
-- {"type":"object","properties":{"url":{"type":"string"},"selector":{"type":"string"}},"additionalProperties":false}
WITH shorthand_root AS (
  SELECT
    t.id,
    e.key AS prop_name,
    e.value AS prop_value,
    e.type AS prop_value_type
  FROM agentsam_tools t, json_each(t.input_schema) e
  WHERE
    json_valid(t.input_schema) = 1
    AND json_type(t.input_schema) = 'object'
    AND json_extract(t.input_schema, '$.type') IS NULL
    AND json_extract(t.input_schema, '$.properties') IS NULL
),
prop_schema AS (
  SELECT
    id,
    prop_name,
    CASE
      WHEN prop_value_type = 'object'
        AND json_extract(prop_value, '$.type') IS NOT NULL
      THEN json(prop_value)

      WHEN prop_value_type = 'object'
      THEN json_object(
        'type', 'object',
        'properties', json_object(),
        'additionalProperties', json('false')
      )

      WHEN prop_value_type = 'array'
      THEN json_object(
        'type', 'array',
        'items', json_object()
      )

      WHEN prop_value_type IN ('true', 'false')
      THEN json_object('type', 'boolean')

      WHEN prop_value_type = 'integer'
      THEN json_object('type', 'integer')

      WHEN prop_value_type = 'real'
      THEN json_object('type', 'number')

      WHEN lower(trim(CAST(prop_value AS TEXT))) IN ('string', 'number', 'integer', 'boolean')
      THEN json_object('type', lower(trim(CAST(prop_value AS TEXT))))

      WHEN lower(trim(CAST(prop_value AS TEXT))) = 'object'
      THEN json_object(
        'type', 'object',
        'properties', json_object(),
        'additionalProperties', json('false')
      )

      WHEN lower(trim(CAST(prop_value AS TEXT))) = 'array'
      THEN json_object(
        'type', 'array',
        'items', json_object()
      )

      WHEN lower(trim(CAST(prop_value AS TEXT))) LIKE '%[]'
      THEN json_object(
        'type', 'array',
        'items', json_object(
          'type',
          CASE
            WHEN replace(lower(trim(CAST(prop_value AS TEXT))), '[]', '') IN ('string', 'number', 'integer', 'boolean')
            THEN replace(lower(trim(CAST(prop_value AS TEXT))), '[]', '')
            ELSE 'string'
          END
        )
      )

      ELSE json_object(
        'type', 'string',
        'description', CAST(prop_value AS TEXT)
      )
    END AS schema_json
  FROM shorthand_root
),
converted AS (
  SELECT
    id,
    json_object(
      'type', 'object',
      'properties', json_group_object(prop_name, json(schema_json)),
      'additionalProperties', json('false')
    ) AS new_schema
  FROM prop_schema
  GROUP BY id
)
UPDATE agentsam_tools
SET
  input_schema = (
    SELECT new_schema
    FROM converted
    WHERE converted.id = agentsam_tools.id
  ),
  updated_at = unixepoch()
WHERE id IN (SELECT id FROM converted);

-- Normalize rows that already have properties but may have shorthand property values or missing root defaults.
WITH property_root AS (
  SELECT
    t.id,
    t.input_schema,
    e.key AS prop_name,
    e.value AS prop_value,
    e.type AS prop_value_type
  FROM agentsam_tools t, json_each(json_extract(t.input_schema, '$.properties')) e
  WHERE
    json_valid(t.input_schema) = 1
    AND json_type(t.input_schema) = 'object'
    AND json_type(t.input_schema, '$.properties') = 'object'
),
property_schema AS (
  SELECT
    id,
    prop_name,
    CASE
      WHEN prop_value_type = 'object'
        AND json_extract(prop_value, '$.type') IS NOT NULL
      THEN json(prop_value)

      WHEN prop_value_type = 'object'
      THEN json_object(
        'type', 'object',
        'properties', json_object(),
        'additionalProperties', json('false')
      )

      WHEN prop_value_type = 'array'
      THEN json_object(
        'type', 'array',
        'items', json_object()
      )

      WHEN prop_value_type IN ('true', 'false')
      THEN json_object('type', 'boolean')

      WHEN prop_value_type = 'integer'
      THEN json_object('type', 'integer')

      WHEN prop_value_type = 'real'
      THEN json_object('type', 'number')

      WHEN lower(trim(CAST(prop_value AS TEXT))) IN ('string', 'number', 'integer', 'boolean')
      THEN json_object('type', lower(trim(CAST(prop_value AS TEXT))))

      WHEN lower(trim(CAST(prop_value AS TEXT))) = 'object'
      THEN json_object(
        'type', 'object',
        'properties', json_object(),
        'additionalProperties', json('false')
      )

      WHEN lower(trim(CAST(prop_value AS TEXT))) = 'array'
      THEN json_object(
        'type', 'array',
        'items', json_object()
      )

      WHEN lower(trim(CAST(prop_value AS TEXT))) LIKE '%[]'
      THEN json_object(
        'type', 'array',
        'items', json_object(
          'type',
          CASE
            WHEN replace(lower(trim(CAST(prop_value AS TEXT))), '[]', '') IN ('string', 'number', 'integer', 'boolean')
            THEN replace(lower(trim(CAST(prop_value AS TEXT))), '[]', '')
            ELSE 'string'
          END
        )
      )

      ELSE json_object(
        'type', 'string',
        'description', CAST(prop_value AS TEXT)
      )
    END AS schema_json
  FROM property_root
),
converted_properties AS (
  SELECT
    id,
    json_group_object(prop_name, json(schema_json)) AS new_properties
  FROM property_schema
  GROUP BY id
)
UPDATE agentsam_tools
SET
  input_schema = json_set(
    input_schema,
    '$.type', 'object',
    '$.properties', json((
      SELECT new_properties
      FROM converted_properties
      WHERE converted_properties.id = agentsam_tools.id
    )),
    '$.additionalProperties', json('false')
  ),
  updated_at = unixepoch()
WHERE id IN (SELECT id FROM converted_properties);

-- Fix object schemas with missing/non-object properties after prior normalization.
UPDATE agentsam_tools
SET
  input_schema = json_set(
    input_schema,
    '$.type', 'object',
    '$.properties', json_object(),
    '$.additionalProperties', json('false')
  ),
  updated_at = unixepoch()
WHERE
  json_valid(input_schema) = 1
  AND json_type(input_schema) = 'object'
  AND json_extract(input_schema, '$.type') = 'object'
  AND (
    json_type(input_schema, '$.properties') IS NULL
    OR json_type(input_schema, '$.properties') != 'object'
  );

-- Final verification summary.
SELECT
  'backup_rows' AS metric,
  COUNT(*) AS value
FROM agentsam_tools_input_schema_backup
UNION ALL
SELECT
  'invalid_json_remaining' AS metric,
  COUNT(*) AS value
FROM agentsam_tools
WHERE COALESCE(json_valid(input_schema), 0) = 0
UNION ALL
SELECT
  'object_without_type_remaining' AS metric,
  COUNT(*) AS value
FROM agentsam_tools
WHERE
  json_valid(input_schema) = 1
  AND json_type(input_schema) = 'object'
  AND json_extract(input_schema, '$.type') IS NULL
UNION ALL
SELECT
  'object_without_properties_remaining' AS metric,
  COUNT(*) AS value
FROM agentsam_tools
WHERE
  json_valid(input_schema) = 1
  AND json_type(input_schema) = 'object'
  AND json_extract(input_schema, '$.type') = 'object'
  AND (
    json_type(input_schema, '$.properties') IS NULL
    OR json_type(input_schema, '$.properties') != 'object'
  );

SELECT
  id,
  tool_name,
  input_schema,
  updated_at
FROM agentsam_tools
WHERE tool_name = 'browser_content'
LIMIT 5;
