-- 180: mcp_tool_calls token columns for audit pipeline (worker recordMcpToolCall)
-- Apply sandbox: npx wrangler d1 migrations apply inneranimalmedia-business --remote -c wrangler.jsonc

ALTER TABLE mcp_tool_calls ADD COLUMN input_tokens INTEGER DEFAULT 0;
ALTER TABLE mcp_tool_calls ADD COLUMN output_tokens INTEGER DEFAULT 0;
