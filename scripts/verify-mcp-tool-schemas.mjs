#!/usr/bin/env node
/**
 * Verify canonical MCP tool schemas (no required goal/query).
 * Usage: node scripts/verify-mcp-tool-schemas.mjs
 */
import { inputSchemaFromAgentsamToolRow } from '../src/core/agentsam-tools-catalog.js';
import { agentsamMemorySearchInputSchema } from '../src/core/mcp-memory-search-schema.js';
import { agentsamMemorySaveInputSchema } from '../src/core/mcp-memory-save-schema.js';
import { agentsamPlanInputSchema } from '../src/core/mcp-plan-schema.js';
import { agentsamGithubWriteInputSchema } from '../src/core/mcp-github-write-schema.js';

function assertNoRequired(name, schema) {
  if (schema?.required?.length) {
    throw new Error(`${name}: required=${JSON.stringify(schema.required)}`);
  }
}

assertNoRequired('agentsam_plan', agentsamPlanInputSchema());
assertNoRequired('agentsam_memory_search', agentsamMemorySearchInputSchema());

const saveSchema = agentsamMemorySaveInputSchema();
if (!saveSchema.properties?.memory_type?.enum?.includes('policy')) {
  throw new Error('agentsam_memory_save schema missing policy type');
}
if (!saveSchema.required?.includes('key')) {
  throw new Error('agentsam_memory_save schema must require key');
}
assertNoRequired(
  'agentsam_plan stale row',
  inputSchemaFromAgentsamToolRow({
    tool_key: 'agentsam_plan',
    input_schema: JSON.stringify({ required: ['goal'], properties: { goal: { type: 'string' } } }),
  }),
);
assertNoRequired(
  'agentsam_memory_search stale row',
  inputSchemaFromAgentsamToolRow({
    tool_key: 'agentsam_memory_search',
    input_schema: JSON.stringify({
      required: ['query'],
      properties: { query: { type: 'string' }, namespace: { type: 'string' } },
    }),
  }),
);

const ghWrite = agentsamGithubWriteInputSchema();
if (ghWrite.required?.includes('sha')) {
  throw new Error('agentsam_github_write schema must not require sha');
}
if (!ghWrite.required?.includes('path') || !ghWrite.required?.includes('content') || !ghWrite.required?.includes('message')) {
  throw new Error('agentsam_github_write schema must require path, content, message');
}
const ghStale = inputSchemaFromAgentsamToolRow({
  tool_key: 'agentsam_github_write',
  input_schema: JSON.stringify({
    required: ['user_id', 'repo', 'path', 'content', 'message', 'sha'],
    properties: { user_id: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' }, sha: { type: 'string' } },
  }),
});
if (ghStale.required?.includes('sha')) {
  throw new Error('agentsam_github_write stale D1 row must be overridden — sha still required');
}

console.log('OK: canonical MCP schemas have no required goal/query');
