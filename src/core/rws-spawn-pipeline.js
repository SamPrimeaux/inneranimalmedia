/**
 * Pure RWS pipeline helpers (no Worker/agent imports — safe for unit tests).
 */

export const RWS_SPAWN_MODES = new Set(['agent', 'debug', 'plan', 'multitask']);

/**
 * @param {import('./runtime-profile.types.js').RuntimeProfile} profile
 */
export function shouldRunRwsFanout(profile) {
  if (!profile || !RWS_SPAWN_MODES.has(profile.mode)) return false;
  return (
    profile.parallel_policy?.enabled === true && profile.parallel_policy?.execution_enabled === true
  );
}

/**
 * @param {'read'|'write'|'summarize'} role
 * @param {string} message
 * @param {{ read?: string, write?: string }} prior
 */
export function buildRwsChildUserMessage(role, message, prior = {}) {
  const task = String(message || '').trim();
  if (role === 'read') {
    return (
      `You are the **READ** subagent in a 3-step pipeline (read → write → summarize).\n` +
      `Gather evidence only: read files, search the repo, query D1 read-only, inspect logs.\n` +
      `Do NOT edit files, run destructive commands, or write to databases.\n` +
      `Output a concise evidence report the WRITE agent can act on.\n\n` +
      `---\n\n${task}`
    );
  }
  if (role === 'write') {
    const readBlock = String(prior.read || '').trim() || '_No read output yet._';
    return (
      `You are the **WRITE** subagent in a 3-step pipeline.\n` +
      `Use the READ agent evidence below. Implement fixes, edits, or structured outputs as needed.\n` +
      `Prefer minimal, correct diffs. Explain what you changed.\n\n` +
      `## READ agent output\n\n${readBlock}\n\n---\n\n## Original task\n\n${task}`
    );
  }
  const readBlock = String(prior.read || '').trim() || '_No read output._';
  const writeBlock = String(prior.write || '').trim() || '_No write output._';
  return (
    `You are the **SUMMARIZER** subagent — the user-facing voice of the pipeline.\n` +
    `Explain what happened in **simple plain English**. No jargon, no tool names, no internal IDs.\n` +
    `Structure: (1) what we looked at, (2) what we changed or decided, (3) what the user should do next.\n` +
    `Keep it under ~12 short sentences unless the task was large.\n\n` +
    `## READ output\n\n${readBlock}\n\n## WRITE output\n\n${writeBlock}\n\n---\n\n## Original task\n\n${task}`
  );
}

/**
 * @param {'read'|'write'|'summarize'} role
 * @param {import('./runtime-profile.types.js').RuntimeProfile} parentProfile
 */
export function getRwsChildCompileOverrides(role, parentProfile) {
  const slugMap = { read: 'deep-researcher', write: 'code-editor', summarize: 'plain-summarizer' };
  if (role === 'read') {
    return {
      subagent_slug: slugMap.read,
      task_type: 'ask',
      mode: 'ask',
      route_key: 'ask',
    };
  }
  if (role === 'write') {
    const parentMode = parentProfile?.mode === 'debug' ? 'debug' : 'agent';
    return {
      subagent_slug: slugMap.write,
      task_type: parentProfile?.mode === 'plan' ? 'plan' : 'code',
      mode: parentMode,
      route_key: parentProfile?.mode === 'plan' ? 'plan' : 'code',
    };
  }
  return {
    subagent_slug: slugMap.summarize,
    task_type: 'ask',
    mode: 'ask',
    route_key: 'ask',
  };
}
