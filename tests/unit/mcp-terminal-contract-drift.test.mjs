import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANONICAL_AGENTSAM_TERMINAL_LOCAL_INPUT_SCHEMA,
  CANONICAL_AGENTSAM_TERMINAL_REMOTE_INPUT_SCHEMA,
  CANONICAL_AGENTSAM_TERMINAL_OUTPUT_SCHEMA,
} from '../../src/core/mcp-terminal-contract.js';
import {
  diffForbiddenInputProperties,
  diffInputSchemaContract,
  diffOutputSchemaCompatible,
  normalizeInputSchemaContract,
} from '../../scripts/lib/json-schema-contract-compare.mjs';
import {
  collectAllTerminalContractDriftErrors,
  collectTerminalContractDriftErrors,
} from '../../scripts/lib/terminal-contract-drift.mjs';

const PROD_LOCAL_INPUT =
  '{"type":"object","properties":{"command":{"type":"string"},"path":{"type":"string","description":"Optional cwd under PTY workspace; honored before workspace_root."}},"required":["command"],"additionalProperties":false}';

const PROD_REMOTE_INPUT =
  '{"type":"object","properties":{"command":{"type":"string"},"target_id":{"type":"string","description":"terminal_connections id for this workspace."}},"required":["command"],"additionalProperties":false}';

const PROD_OUTPUT =
  '{"type":"object","properties":{"cwd":{"type":"string"},"cwd_source":{"type":"string"},"exit_code":{"type":"integer"},"stdout":{"type":"string"},"stderr":{"type":"string"},"output":{"type":"string"},"command":{"type":"string"},"recovery_hints":{"type":"array"}},"additionalProperties":true}';

test('normalizeInputSchemaContract ignores description text', () => {
  const normalized = normalizeInputSchemaContract(PROD_LOCAL_INPUT);
  assert.deepEqual(normalized?.properties?.path, { type: 'string' });
  assert.deepEqual(normalized?.required, ['command']);
});

test('prod-shaped D1 rows match canonical terminal input contracts', () => {
  const rows = [
    {
      tool_key: 'agentsam_terminal_local',
      input_schema: PROD_LOCAL_INPUT,
      output_schema: PROD_OUTPUT,
    },
    {
      tool_key: 'agentsam_terminal_remote',
      input_schema: PROD_REMOTE_INPUT,
      output_schema: PROD_OUTPUT,
    },
  ];
  assert.deepEqual(collectAllTerminalContractDriftErrors(rows), []);
});

test('detects local input_schema drift when target_id appears', () => {
  const drifted = JSON.stringify({
    type: 'object',
    properties: {
      command: { type: 'string' },
      path: { type: 'string' },
      target_id: { type: 'string' },
    },
    required: ['command'],
    additionalProperties: false,
  });
  const errors = collectTerminalContractDriftErrors({
    tool_key: 'agentsam_terminal_local',
    input_schema: drifted,
    output_schema: PROD_OUTPUT,
  });
  assert.ok(errors.some((e) => e.includes('target_id')));
  assert.ok(errors.some((e) => e.includes('input_schema drift')));
});

test('detects remote input_schema missing target_id property', () => {
  const drifted = JSON.stringify({
    type: 'object',
    properties: { command: { type: 'string' } },
    required: ['command'],
    additionalProperties: false,
  });
  const err = diffInputSchemaContract(
    'agentsam_terminal_remote',
    drifted,
    CANONICAL_AGENTSAM_TERMINAL_REMOTE_INPUT_SCHEMA,
  );
  assert.ok(err?.includes('input_schema drift'));
});

test('detects output_schema missing cwd_source', () => {
  const drifted = JSON.stringify({
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      exit_code: { type: 'integer' },
      stdout: { type: 'string' },
      stderr: { type: 'string' },
      output: { type: 'string' },
      command: { type: 'string' },
    },
    additionalProperties: true,
  });
  const err = diffOutputSchemaCompatible(
    'agentsam_terminal_local',
    drifted,
    CANONICAL_AGENTSAM_TERMINAL_OUTPUT_SCHEMA,
  );
  assert.ok(err?.includes('cwd_source'));
});

test('forbidden property helper flags mixed routing args', () => {
  const localWithTarget = JSON.stringify({
    type: 'object',
    properties: {
      command: { type: 'string' },
      path: { type: 'string' },
      target_id: { type: 'string' },
    },
    required: ['command'],
    additionalProperties: false,
  });
  assert.match(
    diffForbiddenInputProperties('agentsam_terminal_local', localWithTarget, ['target_id']),
    /must not include target_id/,
  );
  assert.equal(
    diffForbiddenInputProperties('agentsam_terminal_remote', PROD_REMOTE_INPUT, ['path']),
    null,
  );
});
