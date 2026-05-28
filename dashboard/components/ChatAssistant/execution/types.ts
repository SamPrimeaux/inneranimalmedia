/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AgentPreviewArtifact } from '../types';

export type AgentToolTraceStatus = 'running' | 'done' | 'error';

/** One row in the Agent Sam tool / terminal execution timeline (SSE-driven + local actions). */
export type AgentToolTraceRow = {
  id: string;
  /** Short label for the row header (tool name or user action). */
  toolName: string;
  status: AgentToolTraceStatus;
  lines: string[];
  durationMs?: number;
  startedAtLabel: string;
  isSql?: boolean;
  sqlRows?: Record<string, unknown>[];
  /** True when this row was created from the dashboard (syntax / run), not SSE. */
  local?: boolean;
};

export type ArtifactChipListProps = {
  artifacts: AgentPreviewArtifact[];
  onOpenArtifact: (a: AgentPreviewArtifact) => void;
  onOpenImageUrl?: (url: string) => void;
};
