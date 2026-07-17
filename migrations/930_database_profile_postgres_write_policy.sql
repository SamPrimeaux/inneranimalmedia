-- 930: Database Studio's combined profile explicitly permits its Supabase
-- write tool. Runtime enforcement treats missing Postgres capability as deny.

UPDATE agentsam_tool_profiles
SET write_policy_json = json_set(
      COALESCE(NULLIF(write_policy_json, ''), '{}'),
      '$.can_postgres_write',
      json('true')
    ),
    updated_at = unixepoch()
WHERE profile_key = 'database_engineer';
