-- 933: Catalog-driven post-dispatch/pre-model result contracts.

ALTER TABLE agentsam_tools ADD COLUMN result_policy_json TEXT;

CREATE TABLE IF NOT EXISTS agentsam_tool_result_policy_log (
  id TEXT PRIMARY KEY,
  tool_id TEXT NOT NULL REFERENCES agentsam_tools(id) ON DELETE CASCADE,
  tool_key TEXT NOT NULL,
  operation TEXT NOT NULL,
  original_bytes INTEGER NOT NULL,
  returned_bytes INTEGER NOT NULL,
  original_items INTEGER NOT NULL DEFAULT 0,
  returned_items INTEGER NOT NULL DEFAULT 0,
  was_truncated INTEGER NOT NULL DEFAULT 0 CHECK (was_truncated IN (0,1)),
  outcome TEXT NOT NULL,
  agent_run_id TEXT,
  conversation_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_agentsam_tool_result_policy_log_tool_created
  ON agentsam_tool_result_policy_log(tool_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agentsam_tool_result_policy_log_run
  ON agentsam_tool_result_policy_log(agent_run_id, created_at DESC);

UPDATE agentsam_tools
SET input_schema = json('{
  "type":"object",
  "properties":{
    "operation":{"type":"string","enum":["search","list","read","write","upsert","delete","resolve"]},
    "query":{"type":"string"},
    "memory_type":{"type":"string"},
    "tags":{"type":"array","items":{"type":"string"}},
    "limit":{"type":"integer","minimum":1,"maximum":20,"default":10},
    "key":{"type":"string"},
    "keys":{"type":"array","items":{"type":"string"},"minItems":1,"maxItems":10},
    "value":{"type":"string"},
    "source":{"type":"string"},
    "confidence":{"type":"number"},
    "ttl_days":{"type":"number"},
    "note":{"type":"string"}
  },
  "required":["operation"],
  "additionalProperties":true
}'),
    output_schema = json('{
  "oneOf":[
    {
      "type":"object",
      "properties":{
        "operation":{"type":"string","enum":["search","list"]},
        "results":{"type":"array","maxItems":20,"items":{"type":"object","properties":{
          "key":{"type":"string"},"summary":{"type":"string"},"memory_type":{"type":"string"},
          "tags":{"type":"array","items":{"type":"string"}},"source":{"type":"string"},
          "updated_at":{}
        },"required":["key"],"additionalProperties":false}},
        "count":{"type":"integer"},"tier":{"type":"string"}
      },
      "required":["operation","results","count"],
      "additionalProperties":false
    },
    {
      "type":"object",
      "properties":{
        "operation":{"type":"string","enum":["read"]},
        "found":{"type":"array","maxItems":10,"items":{"type":"object","properties":{
          "key":{"type":"string"},"value":{"type":"string"},"memory_type":{"type":"string"},
          "tags":{"type":"array","items":{"type":"string"}},"source":{"type":"string"},
          "updated_at":{}
        },"required":["key","value"],"additionalProperties":false}},
        "missing":{"type":"array","items":{"type":"string"}}
      },
      "required":["operation","found","missing"],
      "additionalProperties":false
    },
    {
      "type":"object",
      "properties":{
        "operation":{"type":"string","enum":["write"]},"ok":{"type":"boolean"},
        "key":{"type":"string"},"memory_type":{"type":"string"},"expires_at":{}
      },
      "required":["operation","ok","key"],
      "additionalProperties":false
    },
    {
      "type":"object",
      "properties":{
        "operation":{"type":"string","enum":["delete"]},"ok":{"type":"boolean"},
        "key":{"type":"string"},"deleted":{"type":"integer"}
      },
      "required":["operation","ok","key","deleted"],
      "additionalProperties":false
    },
    {
      "type":"object",
      "properties":{
        "operation":{"type":"string","enum":["resolve"]},"ok":{"type":"boolean"},
        "resolved_count":{"type":"integer"},"keys":{"type":"array","items":{"type":"string"}}
      },
      "required":["operation","ok"],
      "additionalProperties":false
    }
  ]
}'),
    result_policy_json = json('{
  "version":1,
  "operations":{
    "search":{
      "collection_field":"results","count_field":"count","max_items":10,
      "root_fields":["operation","results","count","tier"],
      "item_fields":["key","summary","memory_type","tags","source","updated_at"],
      "item_field_char_limits":{"key":240,"summary":600,"memory_type":80,"source":240},
      "max_serialized_bytes":16384
    },
    "list":{
      "collection_field":"results","count_field":"count","max_items":10,
      "root_fields":["operation","results","count","tier"],
      "item_fields":["key","summary","memory_type","tags","source","updated_at"],
      "item_field_char_limits":{"key":240,"summary":600,"memory_type":80,"source":240},
      "max_serialized_bytes":16384
    },
    "read":{
      "collection_field":"found","max_items":10,
      "root_fields":["operation","found","missing"],
      "item_fields":["key","value","memory_type","tags","source","updated_at"],
      "item_field_char_limits":{"key":240,"value":4000,"memory_type":80,"source":240},
      "max_serialized_bytes":49152
    },
    "write":{
      "root_fields":["operation","ok","key","memory_type","expires_at"],
      "field_char_limits":{"key":240,"memory_type":80},
      "max_serialized_bytes":4096
    },
    "delete":{
      "root_fields":["operation","ok","key","deleted"],
      "field_char_limits":{"key":240},
      "max_serialized_bytes":4096
    },
    "resolve":{
      "root_fields":["operation","ok","resolved_count","keys"],
      "max_serialized_bytes":4096
    }
  }
}'),
    updated_at = unixepoch()
WHERE tool_key = 'agentsam_memory_manager';
