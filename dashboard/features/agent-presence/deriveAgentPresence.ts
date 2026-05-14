/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentToolTraceRow } from '../agent-chat/execution/types';
import type { WorkflowLedgerState, AgentMode } from '../agent-chat/types';
import type { ThinkingCardState } from '../../src/components/ThinkingCard';
import type { AgentPresence, AgentPresenceState, AgentLogoMotion } from './presenceTypes';
import { pickPresenceLine, toolPersonaLine } from './presenceCopy';

export type DerivePresenceInput = {
  isLoading: boolean;
  mode: AgentMode;
  thinkingState: ThinkingCardState | null;
  pendingToolApproval: { tool: { name?: string; preview?: string; plan_terminal?: unknown } } | null;
  approvalBusy: boolean;
  toolTraceRows: AgentToolTraceRow[];
  workflowLedger: WorkflowLedgerState;
  draftSyntaxBusy: boolean;
  draftRunBusy: boolean;
  /** Brief post-stream UI flash */
  presenceFlash: 'complete' | 'failed' | null;
};

function motionFor(state: AgentPresenceState): AgentLogoMotion {
  switch (state) {
    case 'terminal':
      return 'running';
    case 'waiting_approval':
      return 'blocked';
    default:
      return state as AgentLogoMotion;
  }
}

function classifyRunningTool(row: AgentToolTraceRow): AgentPresenceState {
  const tn = (row.toolName || '').toLowerCase();
  const line0 = (row.lines[0] || '').toLowerCase();
  if (tn.includes('py_compile') || line0.includes('py_compile') || tn.includes('python3') || line0.includes('python3'))
    return 'terminal';
  if (tn.includes('d1') || tn.includes('sql') || tn.includes('supabase') || tn.includes('query'))
    return 'database';
  if (tn.startsWith('cdt_') || tn.includes('browser') || tn.includes('playwright'))
    return 'browser';
  if (tn.includes('monaco') || line0.includes('.py'))
    return 'writing';
  return 'tool';
}

export function deriveAgentPresence(i: DerivePresenceInput): { presence: AgentPresence; logoMotion: AgentLogoMotion } {
  const seed =
    i.toolTraceRows.map((r) => r.id + r.status).join('|') +
    (i.pendingToolApproval?.tool.name || '') +
    (i.workflowLedger.runId || '');

  if (i.presenceFlash === 'failed') {
    const p: AgentPresence = {
      state: 'failed',
      label: pickPresenceLine('failed', seed),
      detail: i.toolTraceRows.length ? i.toolTraceRows[i.toolTraceRows.length - 1]?.lines.join('\n').slice(0, 200) : undefined,
    };
    return { presence: p, logoMotion: 'failed' };
  }
  if (i.presenceFlash === 'complete') {
    const p: AgentPresence = {
      state: 'complete',
      label: pickPresenceLine('complete', seed),
    };
    return { presence: p, logoMotion: 'complete' };
  }

  if (i.pendingToolApproval) {
    const prev = String(i.pendingToolApproval.tool.preview || '').split('\n')[0]?.slice(0, 140);
    const p: AgentPresence = {
      state: 'waiting_approval',
      label: pickPresenceLine('waiting_approval', seed),
      detail: prev || i.pendingToolApproval.tool.name,
    };
    return { presence: p, logoMotion: motionFor('waiting_approval') };
  }

  if (i.approvalBusy) {
    const p: AgentPresence = {
      state: 'tool',
      label: 'Applying your approval…',
      detail: i.pendingToolApproval?.tool?.name || undefined,
      toolName: 'approval',
    };
    return { presence: p, logoMotion: 'tool' };
  }

  if (i.draftSyntaxBusy) {
    const p: AgentPresence = {
      state: 'terminal',
      label: 'Syntax-checking the draft.',
      detail: 'python3 -m py_compile (single-line, workspace path)',
    };
    return { presence: p, logoMotion: 'running' };
  }
  if (i.draftRunBusy) {
    const p: AgentPresence = {
      state: 'terminal',
      label: 'Running the script in terminal.',
      detail: 'python3 <workspace path>',
    };
    return { presence: p, logoMotion: 'running' };
  }

  const runningRow = [...i.toolTraceRows].reverse().find((r) => r.status === 'running');
  if (i.isLoading && runningRow) {
    const st = classifyRunningTool(runningRow);
    const persona = toolPersonaLine(runningRow.toolName) || pickPresenceLine(st, runningRow.id);
    const detail = runningRow.lines.join('\n').trim().slice(0, 180) || runningRow.toolName;
    const p: AgentPresence = {
      state: st,
      label: persona,
      detail,
      toolName: runningRow.toolName,
    };
    return { presence: p, logoMotion: motionFor(st) };
  }

  if (i.isLoading && i.mode === 'plan') {
    const p: AgentPresence = {
      state: 'planning',
      label: pickPresenceLine('planning', seed),
    };
    return { presence: p, logoMotion: motionFor('planning') };
  }

  if (i.isLoading && i.workflowLedger.runId && !i.workflowLedger.lastError) {
    const p: AgentPresence = {
      state: 'reading',
      label: 'Workflow in progress…',
      detail: i.workflowLedger.currentNodeKey || i.workflowLedger.runId.slice(0, 14),
    };
    return { presence: p, logoMotion: motionFor('reading') };
  }

  if (i.isLoading && i.thinkingState) {
    const runStep = i.thinkingState.steps.find((s) => s.status === 'running');
    if (runStep) {
      const st: AgentPresenceState = 'reading';
      const p: AgentPresence = {
        state: st,
        label: toolPersonaLine(runStep.name) || `Working: ${runStep.name}`,
        detail: runStep.preview,
        toolName: runStep.name,
      };
      return { presence: p, logoMotion: motionFor(st) };
    }
    if (i.thinkingState.status === 'thinking' || i.thinkingState.status === 'working') {
      const p: AgentPresence = {
        state: 'thinking',
        label: pickPresenceLine('thinking', seed),
        detail: i.thinkingState.thinkingText?.trim().slice(0, 120) || undefined,
      };
      return { presence: p, logoMotion: motionFor('thinking') };
    }
    if (i.thinkingState.status === 'blocked') {
      const p: AgentPresence = {
        state: 'waiting_approval',
        label: pickPresenceLine('waiting_approval', seed),
      };
      return { presence: p, logoMotion: 'blocked' };
    }
  }

  if (i.isLoading) {
    const p: AgentPresence = {
      state: 'thinking',
      label: pickPresenceLine('thinking', seed + '|stream'),
    };
    return { presence: p, logoMotion: motionFor('thinking') };
  }

  const p: AgentPresence = {
    state: 'idle',
    label: pickPresenceLine('idle', seed + '|idle'),
  };
  return { presence: p, logoMotion: 'idle' };
}
