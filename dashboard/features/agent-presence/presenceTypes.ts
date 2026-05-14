/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Single source of truth for Agent Sam “presence” — logo motion, microcopy, and UI chrome.
 */

export type AgentPresenceState =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'reading'
  | 'writing'
  | 'tool'
  | 'terminal'
  | 'browser'
  | 'database'
  | 'waiting_approval'
  | 'complete'
  | 'failed';

export type AgentPresence = {
  state: AgentPresenceState;
  /** Primary line — operational, not vague. */
  label: string;
  /** Optional second line (command preview, tool name, etc.). */
  detail?: string;
  startedAt?: number;
  toolName?: string;
  planId?: string;
  taskId?: string;
};

/** Maps presence state → `data-motion` on the logo (CSS in presenceMotion.css). */
export type AgentLogoMotion =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'reading'
  | 'writing'
  | 'tool'
  | 'running'
  | 'browser'
  | 'database'
  | 'blocked'
  | 'complete'
  | 'failed';
