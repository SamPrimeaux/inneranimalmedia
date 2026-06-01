import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAgentRuntimeMode, AGENT_MODES } from '../../src/core/agent-mode.js';
import {
  compileModeProfile,
  defaultWritePolicyForMode,
  resolveModeController,
  resolveExecutionKind,
  agentLikeTooling,
  askNeedsReadEvidenceTools,
  hashRuntimeProfile,
} from '../../src/core/runtime-profile.js';
import { RUNTIME_PROFILE_VERSION } from '../../src/core/runtime-profile.types.js';

test('normalizeAgentRuntimeMode accepts composer modes', () => {
  assert.equal(normalizeAgentRuntimeMode('Plan'), 'plan');
  assert.equal(normalizeAgentRuntimeMode('ASK'), 'ask');
  assert.equal(normalizeAgentRuntimeMode(''), 'agent');
  assert.equal(normalizeAgentRuntimeMode('bogus'), 'agent');
});

test('AGENT_MODES matches five composer modes', () => {
  assert.deepEqual(AGENT_MODES.map((m) => m.id), ['agent', 'plan', 'debug', 'multitask', 'ask']);
});

test('ask write policy blocks mutations and memory writes', () => {
  const wp = defaultWritePolicyForMode('ask');
  assert.equal(wp.can_edit_files, false);
  assert.equal(wp.can_terminal, false);
  assert.equal(wp.can_d1_write, false);
  assert.equal(wp.can_deploy, false);
  assert.equal(wp.can_memory_write, false);
});

test('plan write policy blocks all writes', () => {
  const wp = defaultWritePolicyForMode('plan');
  assert.equal(wp.can_edit_files, false);
  assert.equal(wp.can_terminal, false);
  assert.equal(wp.can_d1_write, false);
  assert.equal(wp.can_deploy, false);
  assert.equal(wp.can_browser_automation, false);
  assert.equal(wp.can_memory_write, false);
});

test('debug write policy blocks deploy by default', () => {
  const wp = defaultWritePolicyForMode('debug');
  assert.equal(wp.can_edit_files, true);
  assert.equal(wp.can_terminal, true);
  assert.equal(wp.can_d1_write, true);
  assert.equal(wp.can_deploy, false);
});

test('mode→controller mapping is deterministic', () => {
  assert.equal(resolveModeController('ask'), 'ask_controller');
  assert.equal(resolveModeController('plan'), 'plan_controller');
  assert.equal(resolveModeController('agent'), 'agent_controller');
  assert.equal(resolveModeController('debug'), 'debug_controller');
  assert.equal(resolveModeController('multitask'), 'multitask_controller');
});

test('execution_kind is derived only from mode (no plan hijack)', () => {
  assert.equal(resolveExecutionKind('ask'), 'ask_turn');
  assert.equal(resolveExecutionKind('plan'), 'plan_pipeline');
  assert.equal(resolveExecutionKind('agent'), 'agent_tool_loop');
  assert.equal(resolveExecutionKind('debug'), 'debug_investigation_loop');
  assert.equal(resolveExecutionKind('multitask'), 'multitask_fanout');
});

test('multitask mode → multitask_fanout', () => {
  assert.equal(resolveExecutionKind('multitask'), 'multitask_fanout');
});

test('ask simple greeting is not agent-like tooling', () => {
  assert.equal(agentLikeTooling('ask', 'hello'), false);
  assert.equal(askNeedsReadEvidenceTools('hello'), false);
});

test('ask general knowledge does not need read evidence tools', () => {
  assert.equal(askNeedsReadEvidenceTools('what is a heuristic?'), false);
  assert.equal(agentLikeTooling('ask', 'what is a heuristic?'), false);
});

test('ask code context question needs read evidence tools', () => {
  assert.equal(
    askNeedsReadEvidenceTools('where is task_type set before agentsam_agent_run?'),
    true,
  );
});

test('ask mutation without context does not compile tools', () => {
  assert.equal(askNeedsReadEvidenceTools('fix this bug'), false);
});

test('ask d1 question is agent-like tooling', () => {
  assert.equal(agentLikeTooling('ask', 'how many rows in agentsam_plans?'), true);
  assert.equal(askNeedsReadEvidenceTools('how many rows in agentsam_plans?'), true);
});

test('compileModeProfile without DB returns stable shadow profile', async () => {
  const profile = await compileModeProfile(null, {
    mode: 'plan',
    message: 'plan auth refactor for the dashboard',
    tenantId: 'tenant_x',
    workspaceId: 'ws_x',
    userId: 'au_x',
    compile_lane: 'shadow',
  });
  assert.equal(profile.mode, 'plan');
  assert.equal(profile.mode_controller, 'plan_controller');
  assert.equal(profile.profile_version, RUNTIME_PROFILE_VERSION);
  assert.equal(profile.execution_kind, 'plan_pipeline');
  assert.ok(profile.profile_hash.length >= 8);
  assert.ok(profile.tool_denylist.includes('terminal_run'));
  assert.equal(profile.source.compile_lane, 'shadow');
});

test('compileModeProfile ask evidence question keeps d1_query off denylist', async () => {
  const profile = await compileModeProfile(null, {
    mode: 'ask',
    message: 'how many rows in agentsam_plans?',
    compile_lane: 'shadow',
  });
  assert.equal(profile.mode, 'ask');
  assert.equal(profile.mode_controller, 'ask_controller');
  assert.equal(profile.color, 'green');
  assert.equal(profile.tool_profile, 'readonly_context');
  assert.ok(!profile.tool_denylist.includes('d1_query'));
  assert.ok(profile.tool_denylist.includes('terminal_run'));
  assert.equal(profile.tool_capable_required, false);
});

test('compileModeProfile ask greeting is green with zero tools', async () => {
  const profile = await compileModeProfile(null, {
    mode: 'ask',
    message: 'hi',
    compile_lane: 'shadow',
  });
  assert.equal(profile.color, 'green');
  assert.equal(profile.tool_profile, 'readonly_context');
  assert.equal(profile.tool_allowlist.length, 0);
  assert.equal(profile.tool_capable_required, false);
});

test('compileModeProfile multitask enables parallel_policy', async () => {
  const profile = await compileModeProfile(null, {
    mode: 'multitask',
    message: 'investigate and patch in parallel',
    compile_lane: 'shadow',
  });
  assert.equal(profile.mode_controller, 'multitask_controller');
  assert.equal(profile.execution_kind, 'multitask_fanout');
  assert.equal(profile.parallel_policy.enabled, true);
});

test('profile hash is deterministic for same inputs', async () => {
  const a = await compileModeProfile(null, { mode: 'ask', message: 'hi' });
  const b = await compileModeProfile(null, { mode: 'ask', message: 'hi' });
  assert.equal(a.profile_hash, b.profile_hash);
  const h = await hashRuntimeProfile(a);
  assert.equal(h, a.profile_hash);
});
