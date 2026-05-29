#!/usr/bin/env node
/**
 * Verify canonical MCP tool schemas (no required goal/query).
 * Usage: node scripts/verify-mcp-tool-schemas.mjs
 */
import { inputSchemaFromAgentsamToolRow } from '../src/core/agentsam-tools-catalog.js';
import { agentsamMemorySearchInputSchema } from '../src/core/mcp-memory-search-schema.js';
import { agentsamMemorySaveInputSchema } from '../src/core/mcp-memory-save-schema.js';
import { agentsamPlanInputSchema } from '../src/core/mcp-plan-schema.js';

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

console.log('OK: canonical MCP schemas have no required goal/query');
