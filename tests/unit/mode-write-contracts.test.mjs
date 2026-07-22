/**
 * S2 acceptance proofs #1–#3 — hard Ask/Plan/Agent write contracts.
 * Pure gate + compileModeProfile seal (no live SSE required for unit pass).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertModeWriteGate,
  sealWritePolicyForMode,
  toolNameLooksMutating,
  writePolicyAllowsAnyMutation,
  isHardReadonlyMode,
} from '../../src/core/mode-write-gate.js';
import { compileModeProfile } from '../../src/core/runtime-profile.js';
import { validateToolCall } from '../../src/core/agent-tool-validator.js';

const MUTATE_TOOLS = [
  'fs_write_file',
  'fs_edit_file',
  'terminal_run',
  'agentsam_terminal_remote',
  'd1_exec',
  'agentsam_d1_exec',
  'wrangler_deploy',
  'github_commit',
  'codemode',
];

const READ_TOOLS = ['d1_query', 'agentsam_d1_query', 'fs_read_file', 'agentsam_codebase_retrieve', 'memory_search'];

test('toolNameLooksMutating classifies mutate vs read', () => {
  for (const t of MUTATE_TOOLS) assert.equal(toolNameLooksMutating(t), true, t);
  for (const t of READ_TOOLS) assert.equal(toolNameLooksMutating(t), false, t);
});

test('Acceptance #1 Plan — sealed write_policy + mutate tools blocked', async () => {
  const profile = await compileModeProfile(null, {
    mode: 'plan',
    message: 'plan auth refactor for the dashboard',
    compile_lane: 'shadow',
  });
  assert.equal(profile.execution_kind, 'plan_pipeline');
  assert.equal(profile.mode_controller, 'plan_controller');
  assert.equal(writePolicyAllowsAnyMutation(profile.write_policy), false);
  assert.equal(profile.write_policy.can_edit_files, false);
  assert.equal(profile.write_policy.can_terminal, false);
  assert.equal(profile.write_policy.can_d1_write, false);
  assert.equal(profile.write_policy.can_deploy, false);

  for (const tool of MUTATE_TOOLS) {
    const g = assertModeWriteGate({
      mode: profile.mode,
      execution_kind: profile.execution_kind,
      write_policy: profile.write_policy,
      toolName: tool,
    });
    assert.equal(g.allowed, false, `plan must block ${tool}: ${g.reason}`);
  }
  const readOk = assertModeWriteGate({
    mode: 'plan',
    execution_kind: 'plan_pipeline',
    write_policy: profile.write_policy,
    toolName: 'd1_query',
  });
  assert.equal(readOk.allowed, true);
});

test('Acceptance #2 Ask — write_policy all false; mutate blocked; reads allowed', async () => {
  const profile = await compileModeProfile(null, {
    mode: 'ask',
    message: 'how many rows in agentsam_plans?',
    compile_lane: 'shadow',
  });
  assert.equal(profile.mode, 'ask');
  assert.equal(isHardReadonlyMode(profile.mode), true);
  for (const k of [
    'can_edit_files',
    'can_terminal',
    'can_d1_write',
    'can_deploy',
    'can_browser_automation',
    'can_memory_write',
  ]) {
    assert.equal(profile.write_policy[k], false, k);
  }
  for (const tool of MUTATE_TOOLS) {
    const g = assertModeWriteGate({
      mode: 'ask',
      execution_kind: profile.execution_kind,
      write_policy: profile.write_policy,
      toolName: tool,
    });
    assert.equal(g.allowed, false, `ask must block ${tool}`);
  }
  for (const tool of READ_TOOLS) {
    const g = assertModeWriteGate({
      mode: 'ask',
      write_policy: profile.write_policy,
      toolName: tool,
    });
    assert.equal(g.allowed, true, `ask must allow ${tool}`);
  }
});

test('Acceptance #3 Agent — can_edit_files; file/terminal tools pass gate', async () => {
  const profile = await compileModeProfile(null, {
    mode: 'agent',
    message: 'add a comment to ChatAssistant types',
    compile_lane: 'shadow',
  });
  assert.equal(profile.execution_kind, 'agent_tool_loop');
  assert.notEqual(profile.execution_kind, 'plan_pipeline');
  assert.equal(profile.write_policy.can_edit_files, true);
  assert.equal(profile.write_policy.can_terminal, true);

  for (const tool of ['fs_edit_file', 'fs_write_file', 'terminal_run']) {
    const g = assertModeWriteGate({
      mode: 'agent',
      execution_kind: profile.execution_kind,
      write_policy: profile.write_policy,
      toolName: tool,
    });
    assert.equal(g.allowed, true, `agent must allow ${tool}: ${g.reason}`);
  }
});

test('Ask/Plan seal overrides hostile D1 write_policy overlay', () => {
  const hostile = {
    can_edit_files: true,
    can_terminal: true,
    can_d1_write: true,
    can_deploy: true,
    can_browser_automation: true,
    can_memory_write: true,
  };
  const sealedAsk = sealWritePolicyForMode('ask', hostile);
  const sealedPlan = sealWritePolicyForMode('plan', hostile);
  assert.equal(writePolicyAllowsAnyMutation(sealedAsk), false);
  assert.equal(writePolicyAllowsAnyMutation(sealedPlan), false);
  const agentKept = sealWritePolicyForMode('agent', hostile);
  assert.equal(agentKept.can_edit_files, true);
});

test('validateToolCall sole mutate gate — Ask blocks terminal before catalog', async () => {
  const profile = await compileModeProfile(null, {
    mode: 'ask',
    message: 'how many rows?',
    compile_lane: 'shadow',
  });
  const denied = await validateToolCall(
    {},
    profile,
    'terminal_run',
    { runtimeProfile: profile, write_policy: profile.write_policy },
    null,
  );
  assert.equal(denied.allowed, false);
  assert.match(String(denied.reason || ''), /write_policy|ask/i);

  const deniedCode = await validateToolCall(
    { LOADER: {} },
    profile,
    'codemode',
    { runtimeProfile: profile },
    null,
  );
  assert.equal(deniedCode.allowed, false);

  const allowedRead = await validateToolCall(
    {},
    profile,
    'd1_query',
    { runtimeProfile: profile, write_policy: profile.write_policy },
    null,
  );
  // May still fail later on allowlist/catalog — but must NOT fail mode write gate
  if (!allowedRead.allowed) {
    assert.doesNotMatch(String(allowedRead.reason || ''), /write_policy/);
  }
});

test('validateToolCall — Plan blocks fs_write; Agent early-allows mutate names', async () => {
  const plan = await compileModeProfile(null, {
    mode: 'plan',
    message: 'plan auth refactor',
    compile_lane: 'shadow',
  });
  const agent = await compileModeProfile(null, {
    mode: 'agent',
    message: 'edit a file',
    compile_lane: 'shadow',
  });

  const planDeny = await validateToolCall({}, plan, 'fs_write_file', { runtimeProfile: plan }, null);
  assert.equal(planDeny.allowed, false);

  const agentGate = assertModeWriteGate({
    mode: agent.mode,
    write_policy: agent.write_policy,
    toolName: 'fs_write_file',
  });
  assert.equal(agentGate.allowed, true);
});

test('capabilityDecision mutate forces Ask deny even for benign-looking names', () => {
  const g = assertModeWriteGate({
    mode: 'ask',
    toolName: 'mystery_helper',
    write_policy: sealWritePolicyForMode('ask', null),
    capabilityDecision: {
      decision: 'allow',
      mutating_capabilities: ['fs.write'],
      unclassified: true,
    },
  });
  assert.equal(g.allowed, false);
});
