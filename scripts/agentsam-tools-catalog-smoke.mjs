#!/usr/bin/env node
/**
 * Runtime tests: agentsam_tools catalog list + dispatch (no runBuiltinTool in dispatchToolCall).
 * Run: node scripts/agentsam-tools-catalog-smoke.mjs
 */
import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');

const {
  CATALOG_ACTIVE_TOOL_COUNT,
  listAgentsamToolsForContext,
  loadAgentsamToolRow,
  validateHandlerConfigForExecution,
  toolCategoriesFromLanes,
  mapCatalogRowsToAgentTools,
  toolRowMatchesCategoryFilter,
} = await import(pathToFileURL(path.join(REPO, 'src/core/agentsam-tools-catalog.js')).href);

const { parseHandlerConfig } = await import(
  pathToFileURL(path.join(REPO, 'src/core/resolve-credential.js')).href
);

let failed = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed += 1;
}
function ok(msg) {
  console.log(`ok: ${msg}`);
}

/** Minimal in-memory D1 stub for catalog queries. */
function mockEnv(rows) {
  const active = rows.filter((r) => Number(r.is_active ?? 1) === 1 && Number(r.is_degraded ?? 0) === 0);
  return {
    DB: {
      prepare(sql) {
        const isList =
          sql.includes('FROM agentsam_tools') &&
          (sql.includes('lower(tool_category) IN') || sql.includes('lower(tool_category) LIKE'));
        const isLoad = sql.includes('display_name = ?');
        return {
          bind(...args) {
            if (isList) {
              const lim = Number(args[args.length - 1]) || 50;
              const filterBinds = args.slice(0, -1);
              const laneCats = filterBinds
                .filter((b) => !String(b).includes('%'))
                .map((c) => String(c).toLowerCase());
              let out = active.filter((r) => toolRowMatchesCategoryFilter(r.tool_category, laneCats));
              out = out.slice(0, lim);
              return {
                all: async () => ({ results: out }),
                first: async () => out[0] ?? null,
              };
            }
            if (isLoad) {
              const key = String(args[0] || '');
              const row = active.find(
                (r) =>
                  r.tool_key === key ||
                  r.tool_name === key ||
                  r.tool_code === key ||
                  r.display_name === key,
              );
              return { all: async () => ({ results: row ? [row] : [] }), first: async () => row ?? null };
            }
            return { all: async () => ({ results: [] }), first: async () => null };
          },
        };
      },
    },
  };
}

const mockRows = [];
for (let i = 0; i < CATALOG_ACTIVE_TOOL_COUNT; i += 1) {
  const cat = i < 4 ? 'browser' : i < 12 ? 'terminal' : 'd1';
  mockRows.push({
    tool_key: `tool_${i}`,
    tool_name: `tool_${i}`,
    display_name: `tool_${i}`,
    tool_category: cat,
    description: `mock ${i}`,
    input_schema: '{"type":"object","properties":{}}',
    handler_config: JSON.stringify({
      auth_source: 'platform',
      env_key: 'MCP_AUTH_TOKEN',
      operation: 'query',
    }),
    handler_type: cat === 'browser' ? 'mybrowser' : 'd1',
    workspace_scope: '["*"]',
    modes_json: '["agent"]',
    risk_level: 'low',
    requires_approval: 0,
    is_active: 1,
    is_degraded: 0,
  });
}

const env = mockEnv(mockRows);

const empty = await listAgentsamToolsForContext(env, { workspaceId: 'ws_test', categories: [] });
if (empty.length !== 0) fail(`empty categories should return 0 tools, got ${empty.length}`);
else ok('default list without categories is empty (not 76)');

const browserCats = toolCategoriesFromLanes(['inspect']);
const browserOnly = await listAgentsamToolsForContext(env, {
  workspaceId: 'ws_test',
  categories: browserCats,
  limit: 50,
});
if (browserOnly.length !== 4) fail(`browser category expected 4 tools, got ${browserOnly.length}`);
else if (browserOnly.some((r) => String(r.tool_category).toLowerCase() !== 'browser')) {
  fail('browser filter included non-browser category');
} else ok('category filter returns browser tools only');

const capped = await listAgentsamToolsForContext(env, {
  workspaceId: 'ws_test',
  categories: toolCategoriesFromLanes(['develop']),
  limit: 8,
});
if (capped.length > 8) fail(`limit 8 expected <=8 tools, got ${capped.length}`);
if (capped.length >= CATALOG_ACTIVE_TOOL_COUNT) {
  fail(`capped list must be < ${CATALOG_ACTIVE_TOOL_COUNT}`);
} else ok(`category list capped (${capped.length} tools, not ${CATALOG_ACTIVE_TOOL_COUNT})`);

const dottedRows = [
  {
    tool_key: 'agentsam_d1_query',
    tool_name: 'agentsam_d1_query',
    display_name: 'agentsam_d1_query',
    tool_category: 'database.d1.query',
    description: 'D1 query',
    input_schema: '{"type":"object","properties":{}}',
    handler_config: JSON.stringify({
      binding: 'DB',
      operation: 'query',
      auth_source: 'platform',
    }),
    handler_type: 'd1',
    workspace_scope: '["*"]',
    modes_json: '["agent"]',
    risk_level: 'low',
    requires_approval: 0,
    is_active: 1,
    is_degraded: 0,
  },
  {
    tool_key: 'agentsam_terminal_local',
    tool_name: 'agentsam_terminal_local',
    display_name: 'agentsam_terminal_local',
    tool_category: 'terminal.local',
    description: 'terminal',
    input_schema: '{"type":"object","properties":{}}',
    handler_config: JSON.stringify({
      auth_source: 'platform',
      env_key: 'PTY_AUTH_TOKEN',
    }),
    handler_type: 'terminal',
    workspace_scope: '["*"]',
    modes_json: '["agent"]',
    risk_level: 'low',
    requires_approval: 0,
    is_active: 1,
    is_degraded: 0,
  },
];
const dottedEnv = mockEnv(dottedRows);
const dottedListed = await listAgentsamToolsForContext(dottedEnv, {
  workspaceId: 'ws_test',
  categories: toolCategoriesFromLanes(['develop']),
  limit: 20,
});
if (!dottedListed.some((r) => r.tool_name === 'agentsam_d1_query')) {
  fail('database.d1.query must match develop lane d1 category filter');
} else if (!dottedListed.some((r) => r.tool_name === 'agentsam_terminal_local')) {
  fail('terminal.local must match develop lane terminal category filter');
} else ok('dotted tool_category prefixes match lane category filter');

const badCfgRow = {
  tool_key: 'browser_close_session',
  tool_name: 'browser_close_session',
  handler_type: 'mybrowser',
  handler_config: '{}',
  is_active: 1,
  is_degraded: 0,
};
const badCheck = validateHandlerConfigForExecution(badCfgRow, parseHandlerConfig(badCfgRow.handler_config));
if (badCheck.ok) fail('empty handler_config should fail closed');
else ok('invalid handler_config fails closed');

const unknownRow = await loadAgentsamToolRow(env, 'totally_unknown_tool_xyz');
if (unknownRow != null) fail('unknown tool should not load a row');
else ok('unknown tool row load fails closed');

const d1Row = mockRows.find((r) => r.tool_category === 'd1');
const loaded = await loadAgentsamToolRow(env, d1Row.tool_key);
if (!loaded || loaded.tool_key !== d1Row.tool_key) {
  fail('loadAgentsamToolRow must resolve catalog row by tool_key');
} else {
  ok('loadAgentsamToolRow reads agentsam_tools-shaped row');
}
const cfgOk = validateHandlerConfigForExecution(loaded, parseHandlerConfig(loaded.handler_config));
if (!cfgOk.ok) fail(`valid catalog row should pass handler_config check: ${cfgOk.error}`);
else ok('handler_config validation passes for catalog d1 row');

const dispatchSrc = readFileSync(path.join(REPO, 'src/core/dispatch-by-tool-code.js'), 'utf8');
if (!dispatchSrc.includes('loadAgentsamToolRow') || /\brunBuiltinTool\s*\(/.test(dispatchSrc)) {
  fail('dispatch-by-tool-code must use catalog row load only');
} else ok('dispatch-by-tool-code loads agentsam_tools (no runBuiltinTool)');

const agentSrc = readFileSync(path.join(REPO, 'src/api/agent.js'), 'utf8');
const fnStart = agentSrc.indexOf('async function dispatchToolCall');
const fnEnd = agentSrc.indexOf('async function dispatchToolCallWithBudget', fnStart);
const dispatchFn = agentSrc.slice(fnStart, fnEnd);
if (/runBuiltinTool/.test(dispatchFn)) {
  fail('dispatchToolCall must not call runBuiltinTool');
} else ok('dispatchToolCall has no runBuiltinTool fallback');

const unsupported = validateHandlerConfigForExecution(
  { tool_key: 'x', handler_type: 'telemetry' },
  { auth_source: 'platform' },
);
if (unsupported.ok) fail('unsupported handler_type should fail closed');
else ok('unsupported handler_type fails closed');

const catalogSrc = readFileSync(path.join(REPO, 'src/core/catalog-tool-executor.js'), 'utf8');
if (!catalogSrc.includes("case 'mybrowser'")) {
  fail('catalog-tool-executor must implement mybrowser handler_type');
} else ok('catalog executor includes mybrowser branch');

console.log(failed ? `\n${failed} test(s) failed` : '\nAll agentsam_tools catalog smoke checks passed');
process.exit(failed ? 1 : 0);
