-- Lane D: document Veo destination=local|stream on agentsam_tools (no new tables).
-- Default delivery is local playable URL; Stream is optional Save.
UPDATE agentsam_tools
SET
  description = COALESCE(
    NULLIF(TRIM(description), ''),
    'Generate video with Vertex Veo (async). Default destination=local (playable URL). Optional destination=stream saves to Hosted Videos when Stream is configured.'
  ),
  input_schema = json('{
    "type": "object",
    "required": ["prompt"],
    "properties": {
      "prompt": { "type": "string", "description": "Video generation prompt" },
      "duration_seconds": { "type": "number", "minimum": 1, "maximum": 60, "default": 5 },
      "quality": { "type": "string", "enum": ["fast", "ultra"], "default": "fast" },
      "resolution": { "type": "string", "default": "720p" },
      "aspect_ratio": { "type": "string", "default": "16:9" },
      "negative_prompt": { "type": "string" },
      "reference_image_r2_key": { "type": "string" },
      "destination": {
        "type": "string",
        "enum": ["local", "stream"],
        "default": "local",
        "description": "local = playable artifact URL (default, Connor-safe). stream = also ingest to Cloudflare Stream (fails loud if Stream not configured)."
      },
      "workspace_id": { "type": "string" },
      "tenant_id": { "type": "string" }
    }
  }'),
  updated_at = unixepoch()
WHERE tool_key = 'veo_generate_video' OR tool_name = 'veo_generate_video';
