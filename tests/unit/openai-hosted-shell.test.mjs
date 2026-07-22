import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHostedShellTool,
  withHostedShellTool,
  withHostedShellHybridInstructions,
  HOSTED_SHELL_HYBRID_INSTRUCTION,
  summarizeShellCallAction,
  formatShellCallOutputPreview,
} from '../../src/core/openai-hosted-shell.js';

test('buildHostedShellTool defaults to container_auto without network', () => {
  assert.deepEqual(buildHostedShellTool(), {
    type: 'shell',
    environment: { type: 'container_auto' },
  });
  assert.deepEqual(buildHostedShellTool([]), {
    type: 'shell',
    environment: { type: 'container_auto' },
  });
});

test('buildHostedShellTool adds allowlist only for valid domains', () => {
  const tool = buildHostedShellTool(['pypi.org', 'bad domain', 'files.pythonhosted.org']);
  assert.equal(tool.type, 'shell');
  assert.equal(tool.environment.type, 'container_auto');
  assert.deepEqual(tool.environment.network_policy, {
    type: 'allowlist',
    allowed_domains: ['pypi.org', 'files.pythonhosted.org'],
  });
});

test('withHostedShellTool is idempotent', () => {
  const once = withHostedShellTool([], true);
  assert.equal(once.length, 1);
  const twice = withHostedShellTool(once, true);
  assert.equal(twice.filter((t) => t.type === 'shell').length, 1);
  assert.deepEqual(withHostedShellTool([], false), []);
  assert.deepEqual(withHostedShellTool([{ type: 'apply_patch' }], false), [{ type: 'apply_patch' }]);
});

test('hybrid instructions append once', () => {
  const a = withHostedShellHybridInstructions('You are Agent Sam.', true);
  assert.match(a, /Shell routing \(hybrid\)/);
  assert.match(a, /agentsam_terminal_remote/);
  const b = withHostedShellHybridInstructions(a, true);
  assert.equal(b, a);
  assert.equal(withHostedShellHybridInstructions('x', false), 'x');
  assert.equal(withHostedShellHybridInstructions('', true), HOSTED_SHELL_HYBRID_INSTRUCTION);
});

test('summarize + format shell payloads', () => {
  assert.deepEqual(summarizeShellCallAction({ commands: ['uname -a', 'pwd'], timeout_ms: 1000 }), {
    commands: ['uname -a', 'pwd'],
    timeout_ms: 1000,
    max_output_length: null,
  });
  const preview = formatShellCallOutputPreview([
    { stdout: 'Linux\n', stderr: '', outcome: { type: 'exit', exit_code: 0 } },
  ]);
  assert.match(preview, /Linux/);
  assert.match(preview, /exit=0/);
});
