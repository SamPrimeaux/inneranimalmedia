/**
 * Code Mode toolset — D1 agentsam_tools → AI SDK tools → createCodeTool + DynamicWorkerExecutor.
 * Requires env.LOADER (worker_loaders binding) and env.DB.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { createCodeTool } from '@cloudflare/codemode/ai';
import { DynamicWorkerExecutor } from '@cloudflare/codemode';
import { dispatchCatalogToolResult } from './dispatch-by-tool-code.js';
import {
  inputSchemaFromAgentsamToolRow,
  validateHandlerConfigForExecution,
} from './agentsam-tools-catalog.js';
import { parseHandlerConfig } from './resolve-credential.js';
import {
  codemodeRowAllowedForWorkspace,
  isCodemodeIsolatedWorkspace,
} from './codemode-workspace-policy.js';
import { CODEMODE_TOOL_NAME } from './codemode-constants.js';

export { CODEMODE_TOOL_NAME };

/** Isolated codemode sandbox must not expose browser/filesystem handlers directly. */
const CODEMODE_BLOCKED_HANDLER_TYPES = new Set(['mybrowser', 'filesystem']);

/**
 * @param {Record<string, unknown>} prop
 */
function jsonSchemaPropertyToZod(prop) {
  if (!prop || typeof prop !== 'object') return z.unknown().optional();
  const t = String(prop.type || '').toLowerCase();
  if (t === 'string') return z.string().optional();
  if (t === 'number' || t === 'integer') return z.number().optional();
  if (t === 'boolean') return z.boolean().optional();
  if (t === 'array') return z.array(z.unknown()).optional();
  if (t === 'object') return z.record(z.string(), z.unknown()).optional();
  return z.unknown().optional();
}

/**
 * @param {Record<string, unknown>} schema
 */
function jsonSchemaToZodObject(schema) {
  const props = schema?.properties && typeof schema.properties === 'object' ? schema.properties : {};
  const shape = Object.fromEntries(
    Object.entries(props).map(([k, v]) => [k, jsonSchemaPropertyToZod(v)]),
  );
  return Object.keys(shape).length ? z.object(shape) : z.object({}).passthrough();
}

/**
 * @param {Record<string, unknown>} row
 */
function toolKeyForCodemode(row) {
  const key = String(row.tool_key || row.tool_name || '').trim();
  return key || null;
}

/**
 * @param {Record<string, unknown>} row
 * @param {Set<string>|null|undefined} allowlistKeys
 */
function rowPassesAllowlist(row, allowlistKeys) {
  if (!allowlistKeys || !allowlistKeys.size) return true;
  const keys = [
    String(row.tool_key || '').trim().toLowerCase(),
    String(row.tool_name || '').trim().toLowerCase(),
    String(row.display_name || '').trim().toLowerCase(),
  ].filter(Boolean);
  return keys.some((k) => allowlistKeys.has(k));
}

/**
 * @param {string} toolKey
 * @param {string[]|null|undefined} toolKeys
 */
function rowPassesToolKeyFilter(toolKey, toolKeys) {
  if (!toolKeys || !toolKeys.length) return true;
  const set = new Set(toolKeys.map((k) => String(k).trim().toLowerCase()).filter(Boolean));
  return set.has(toolKey.toLowerCase());
}

/**
 * Build Code Mode tool + executor from safe, approval-free agentsam_tools rows.
 *
 * @param {import('@cloudflare/workers-types').Env & { LOADER?: WorkerLoader, DB?: D1Database }} env
 * @param {Record<string, unknown>} [runContext] workspaceId, tenantId, userId for dispatch
 * @param {{
 *   allowlistKeys?: Set<string>,
 *   toolKeys?: string[],
 * }} [opts]
 * @returns {Promise<{ codemodeTool: ReturnType<typeof createCodeTool>, toolCount: number }>}
 */
export async function buildCodemodeToolset(env, runContext = {}, opts = {}) {
  const db = env?.DB;
  if (!db) {
    throw new Error('buildCodemodeToolset: env.DB is required');
  }
  if (!env?.LOADER) {
    throw new Error('buildCodemodeToolset: env.LOADER worker_loaders binding is required');
  }

  const workspaceId = String(runContext.workspaceId ?? runContext.workspace_id ?? '').trim();
  const isolated = await isCodemodeIsolatedWorkspace(env, workspaceId);

  const { results } = await db
    .prepare(
      `SELECT tool_key, tool_name, display_name, description, input_schema, handler_config,
              handler_type, requires_approval, risk_level
       FROM agentsam_tools
       WHERE COALESCE(requires_approval, 0) = 0
         AND COALESCE(is_active, 1) = 1
         AND COALESCE(is_degraded, 0) = 0
         AND lower(COALESCE(handler_type, '')) NOT IN ('mybrowser', 'websearch', 'filesystem')
       ORDER BY tool_name`,
    )
    .all();

  const tools = {};
  let toolCount = 0;
  for (const row of results || []) {
    const handlerType = String(row.handler_type || '').trim().toLowerCase();
    if (CODEMODE_BLOCKED_HANDLER_TYPES.has(handlerType)) continue;
    if (!codemodeRowAllowedForWorkspace(row, isolated)) continue;

    const toolKey = toolKeyForCodemode(row);
    if (!toolKey) continue;
    if (!rowPassesAllowlist(row, opts.allowlistKeys)) continue;
    if (!rowPassesToolKeyFilter(toolKey, opts.toolKeys)) continue;

    const config = parseHandlerConfig(row.handler_config);
    const configCheck = validateHandlerConfigForExecution(row, config);
    if (!configCheck.ok) continue;

    const schemaJson = inputSchemaFromAgentsamToolRow(row);
    const description =
      String(row.description || row.display_name || row.tool_name || toolKey).trim() || toolKey;

    tools[toolKey] = tool({
      description,
      inputSchema: jsonSchemaToZodObject(schemaJson),
      execute: async (args) =>
        dispatchCatalogToolResult(env, toolKey, args, runContext),
    });
    toolCount += 1;
  }

  if (toolCount === 0) {
    throw new Error('buildCodemodeToolset: no eligible tools for workspace');
  }

  const executor = new DynamicWorkerExecutor({
    loader: env.LOADER,
    timeout: 25_000,
    globalOutbound: null,
  });

  const codemodeTool = createCodeTool({ tools, executor });
  return { codemodeTool, toolCount };
}
