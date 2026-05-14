/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentPresenceState } from './presenceTypes';

/** Short pools — pick deterministically via `pickPresenceLine` (no random chaos). */
export const presenceCopy: Record<
  AgentPresenceState,
  readonly string[]
> = {
  idle: ['Ready when you are.', 'Standing by in this workspace.'],
  thinking: ['Reading the context before acting.', 'Mapping the next safe step.'],
  planning: ['Turning this into a trackable plan.', 'Breaking the work into clean steps.'],
  reading: ['Inspecting the workspace.', 'Checking the source before guessing.'],
  writing: ['Drafting the file-backed change.', 'Writing this where it can be reviewed.'],
  tool: ['Using a tool with live feedback.', 'Executing a checked workspace action.'],
  terminal: ['Running in the workspace terminal.', 'Watching stdout and stderr.'],
  browser: ['Opening the target route.', 'Checking page behavior visually.'],
  database: ['Reading live schema and rows.', 'Checking IDs before writing.'],
  waiting_approval: ['Waiting for approval before risky action.', 'Nothing runs until you confirm.'],
  complete: ['Done, with proof attached.', 'Completed and logged.'],
  failed: ['Stopped safely with an error to inspect.', 'Failed before making unsafe assumptions.'],
};

function hashToIndex(seed: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return modulo ? h % modulo : 0;
}

export function pickPresenceLine(state: AgentPresenceState, seed: string): string {
  const pool = presenceCopy[state];
  if (!pool?.length) return '';
  return pool[hashToIndex(seed, pool.length)] ?? pool[0];
}

/** Optional operational one-liner from tool name (witty but concrete). */
export function toolPersonaLine(toolName: string): string | null {
  const t = toolName.toLowerCase();
  if (t.includes('d1') || t.includes('sql') || t.includes('supabase'))
    return 'Reading the schema before touching rows.';
  if (t.includes('py_compile') || t.includes('python3'))
    return 'Syntax-checking the generated Python file.';
  if (t.includes('terminal') || t === 'terminal_run')
    return 'Running safely in the workspace terminal.';
  if (t.startsWith('cdt_') || t.includes('browser') || t.includes('playwright'))
    return 'Capturing proof in the browser, not guessing.';
  if (t.includes('r2') || t.includes('artifact'))
    return 'Collecting generated artifacts.';
  if (t.includes('monaco') || t.includes('file'))
    return 'Opening the draft for review.';
  if (t.includes('excalidraw') || t.includes('draw'))
    return 'Opening a visual scratchpad.';
  return null;
}
