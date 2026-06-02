/**
 * Terminal tool contract drift — D1 agentsam_tools vs mcp-terminal-contract.js SSOT.
 */
import { resolve } from 'path';
import {
  CANONICAL_AGENTSAM_TERMINAL_LOCAL_INPUT_SCHEMA,
  CANONICAL_AGENTSAM_TERMINAL_REMOTE_INPUT_SCHEMA,
  CANONICAL_AGENTSAM_TERMINAL_OUTPUT_SCHEMA,
} from '../../src/core/mcp-terminal-contract.js';
import { runD1Query } from './d1-deploy-record.mjs';
import {
  diffForbiddenInputProperties,
  diffInputSchemaContract,
  diffOutputSchemaCompatible,
} from './json-schema-contract-compare.mjs';

export const TERMINAL_CONTRACT_SPECS = [
  {
    toolKey: 'agentsam_terminal_local',
    inputSchema: CANONICAL_AGENTSAM_TERMINAL_LOCAL_INPUT_SCHEMA,
    outputSchema: CANONICAL_AGENTSAM_TERMINAL_OUTPUT_SCHEMA,
    forbiddenInputProperties: ['target_id', 'targetId'],
  },
  {
    toolKey: 'agentsam_terminal_remote',
    inputSchema: CANONICAL_AGENTSAM_TERMINAL_REMOTE_INPUT_SCHEMA,
    outputSchema: CANONICAL_AGENTSAM_TERMINAL_OUTPUT_SCHEMA,
    forbiddenInputProperties: ['path'],
  },
];

/** @typedef {{ tool_key?: string, tool_name?: string, input_schema?: string, output_schema?: string }} TerminalToolRow */

/**
 * @param {TerminalToolRow} row
 * @returns {string[]}
 */
export function collectTerminalContractDriftErrors(row) {
  const toolKey = String(row?.tool_key || row?.tool_name || '').trim();
  const spec = TERMINAL_CONTRACT_SPECS.find((s) => s.toolKey === toolKey);
  if (!spec) return [`${toolKey || '(unknown)'}: not a terminal contract tool`];

  const label = toolKey;
  const errors = [];

  const forbiddenErr = diffForbiddenInputProperties(
    label,
    row?.input_schema,
    spec.forbiddenInputProperties,
  );
  if (forbiddenErr) errors.push(forbiddenErr);

  const inputErr = diffInputSchemaContract(label, row?.input_schema, spec.inputSchema);
  if (inputErr) errors.push(inputErr);

  const outputErr = diffOutputSchemaCompatible(label, row?.output_schema, spec.outputSchema);
  if (outputErr) errors.push(outputErr);

  return errors;
}

/**
 * @param {TerminalToolRow[]} rows
 * @returns {string[]}
 */
export function collectAllTerminalContractDriftErrors(rows) {
  const errors = [];
  const byKey = new Map(
    (rows || []).map((r) => [String(r?.tool_key || r?.tool_name || '').trim(), r]),
  );

  for (const spec of TERMINAL_CONTRACT_SPECS) {
    const row = byKey.get(spec.toolKey);
    if (!row) {
      errors.push(`${spec.toolKey}: missing from agentsam_tools`);
      continue;
    }
    errors.push(...collectTerminalContractDriftErrors(row));
  }

  return errors;
}

/**
 * @param {string} [repoRoot]
 * @returns {TerminalToolRow[]}
 */
export function fetchTerminalToolRowsFromD1(repoRoot = process.cwd()) {
  const root = resolve(repoRoot);
  const keys = TERMINAL_CONTRACT_SPECS.map((s) => `'${s.toolKey.replace(/'/g, "''")}'`).join(', ');
  return runD1Query(
    root,
    `SELECT tool_key, tool_name, input_schema, output_schema FROM agentsam_tools WHERE tool_key IN (${keys}) ORDER BY tool_key`,
  );
}

/**
 * @param {string} [repoRoot]
 * @returns {string[]}
 */
export function verifyTerminalContractDrift(repoRoot = process.cwd()) {
  const rows = fetchTerminalToolRowsFromD1(repoRoot);
  return collectAllTerminalContractDriftErrors(rows);
}
