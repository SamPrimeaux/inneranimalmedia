-- Match the official Cloudflare d1_database_query tool contract exactly.

UPDATE agentsam_tools
SET description = 'Query a D1 database in your Cloudflare account',
    input_schema = json('{
  "type": "object",
  "properties": {
    "database_id": {
      "type": "string"
    },
    "sql": {
      "type": "string"
    },
    "params": {
      "anyOf": [
        {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        {
          "type": "null"
        }
      ]
    }
  },
  "required": [
    "database_id",
    "sql"
  ],
  "$schema": "http://json-schema.org/draft-07/schema#"
}'),
    updated_at = datetime('now')
WHERE tool_key = 'agentsam_d1_query';
