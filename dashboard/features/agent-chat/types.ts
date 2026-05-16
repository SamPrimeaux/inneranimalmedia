/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import type { ActiveFile, ProjectType } from '../../types';

export type MessageAttachmentPreview = {
  previewUrl: string | null;
  type: 'image' | 'file';
  name: string;
};

/** Excalidraw plan map artifact from planner or POST /api/agentsam/plans. */
export type ImplementationPlanVisualMap = {
  artifact_id: string;
  r2_key?: string;
  public_url: string;
};

/** Canonical Markdown plan export (R2 + agentsam_artifacts). */
export type ImplementationPlanMarkdown = {
  artifact_id: string;
  r2_key?: string;
  public_url: string;
};

export type ImplementationPlanChip = {
  plan_id: string;
  plan_title?: string;
  visual_map?: ImplementationPlanVisualMap | null;
  plan_markdown?: ImplementationPlanMarkdown | null;
};

/** Future: Worker SSE `artifact_preview` payloads merged into the assistant bubble (images, query results). */
export type AgentPreviewArtifactKind = 'sql' | 'diff' | 'code' | 'image' | 'table';

export type AgentPreviewArtifact = {
  id: string;
  kind: AgentPreviewArtifactKind;
  title?: string;
  /** Code / SQL / diff — for diffs this is the "after" content */
  content?: string;
  language?: string;
  /** Image URL (https or data:) */
  imageUrl?: string;
  /** Monaco diff viewer — original file content (SSE `code_diff.before`) */
  before?: string;
  /** Repo-relative or virtual path (SSE `code_diff.path`) */
  path?: string;
};

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Blob URLs kept after send so image previews stay visible in history (not revoked with composer clear). */
  attachmentPreviews?: MessageAttachmentPreview[];
  /** When Agent Sam emits `plan_created` with a saved plan map artifact. */
  implementationPlan?: ImplementationPlanChip | null;
  /** Reserved for structured previews from the Worker (optional; fences use `AgentCodeFencePreview` today). */
  previewArtifacts?: AgentPreviewArtifact[];
}

/** Host-managed chat tab strip (e.g. App.tsx multi-session). */
export type AgentChatShellTab = { id: string; title: string };

export interface ChatAssistantProps {
  activeProject: ProjectType;
  activeFileContent?: string;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onFileSelect?: (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile>) => void;
  onRunInTerminal?: (cmd: string) => void;
  activeFileName?: string;
  /** Full open-file metadata so @file / @monaco can include tool routing (r2_read, r2_write, github_file). */
  activeFile?: ActiveFile | null;
  /** Current editor cursor (for @monaco injection only). */
  editorCursorLine?: number;
  editorCursorColumn?: number;
  /** SSE: agent tool `r2_write` emits `r2_file_updated` for Monaco sync */
  onR2FileUpdated?: (event: { type: 'r2_file_updated'; bucket: string; key: string }) => void;
  /** SSE: `browser_navigate` opens the Browser tab (e.g. after HTML write or preview_in_browser) */
  onBrowserNavigate?: (event: { type: 'browser_navigate'; url: string }) => void;
  /** Dropped or attached .glb: parent uses a blob URL and should open the Voxel (engine) tab. */
  onGlbFileSelect?: (file: File) => void;
  /** Mobile: open GitHub repos panel (`actions` activity); optional repo to expand. */
  onOpenGitHubIntegration?: (opts?: { expandRepoFullName?: string }) => void;
  /** Mobile: leave full-screen chat and show the main editor / welcome workspace. */
  onMobileOpenDashboard?: () => void;
  /** Open the code editor tab from chat (e.g. mobile Context tab). */
  onOpenCodeTab?: () => void;
  /** Open the Search sidebar (knowledge + chat history). */
  onOpenChatHistory?: () => void;
  /** `agentsam_user_policy` row fields for the active workspace (from App bootstrap). */
  agentsamPolicy?: Record<string, unknown> | null;
  /** IAM workspace id (`auth_users.active_workspace_id` / settings) — scopes approval polling and APIs. */
  workspaceId?: string | null;
  /** Mirror active tab's server conversation id when the host switches chat tabs (empty = unsaved thread). */
  syncedHostConversationId?: string;
  /** Optional horizontal tab strip above chat (Cursor-style parallel threads). */
  agentChatShellTabs?: AgentChatShellTab[];
  activeAgentChatShellTabId?: string | null;
  onAgentChatShellTabSelect?: (tabId: string) => void;
  /** Open a parallel chat tab (host allocates tab + messages slot). */
  onAgentChatShellNewTab?: () => void;
  /** Parent mirrors streaming state (approval polling). */
  onLoadingChange?: (loading: boolean) => void;
  /** SSE surfaced a command_run awaiting approval. */
  onApprovalRequired?: (commandRunId: string) => void;
  /** Active agentsam_command_run id for approval queue scoping. */
  agentRunId?: string | null;
}

export type StagedAttachment = {
  id: string;
  file: File;
  type: 'image' | 'file';
  previewUrl: string | null;
};

export type PickerItem = { id: string; label: string; kind: string };
export type SlashCmd = { slug: string; description: string | null };

export type ToolApprovalPayload = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  preview?: string;
  /** Plan-task terminal gate: Allow → approve queue → POST /api/agent/plan-task/resume (SSE). */
  plan_terminal?: {
    plan_id: string;
    task_id: string;
    command_run_id?: string;
    approval_id: string;
  };
};

export type ChatModelRow = {
  id: string;
  name: string;
  provider: string;
  model_key: string;
  api_platform: string;
  /** D1 `agentsam_ai.picker_group` — section title in model picker; falls back to `provider`. */
  picker_group?: string;
  size_class?: string;
  input_rate_per_mtok?: number | null;
  output_rate_per_mtok?: number | null;
};

export const MENTION_CONTEXT_HEADER = '\n\n--- On-demand context (this message only) ---\n';
export const MENTION_FILE_MAX_CHARS = 8000;
export const MENTION_R2_LIST_MAX_ROWS = 250;
/** Worker request body cap (inform UI); combined files rejected above CHAT_ATTACH_MAX_TOTAL_BYTES in worker.js */
export const CHAT_REQUEST_MAX_BYTES = 100 * 1024 * 1024;
export const CHAT_ATTACH_MAX_TOTAL_BYTES = 90 * 1024 * 1024;

/**
 * App.tsx mobile shell: fixed tab bar z-[90] with `bottom: 1.5rem + safe-area` (~52px row) + status strip.
 * Chat panel is max-md:fixed z-[45], so the composer must pad above that stack or it sits underneath.
 */
export const MOBILE_CHAT_COMPOSER_BOTTOM_PAD =
  'calc(56px + 1.5rem + env(safe-area-inset-bottom, 0px) + 24px)';

/** Mobile: keep composer short so flex-1 message list does not jump on every keystroke; scroll inside textarea instead. */
export const COMPOSER_TEXTAREA_MAX_PX_NARROW = 104;
export const COMPOSER_TEXTAREA_MAX_PX_WIDE = 200;

export const LS_GH_REPO = 'iam-chat-github-repo-context';

export type AgentMode = 'ask' | 'plan' | 'agent' | 'debug' | 'multitask';

export const AGENT_MODES = [
  { id: 'agent', label: 'Agent', description: 'Execute and open surfaces' },
  { id: 'plan', label: 'Plan', description: 'Design technical plans' },
  { id: 'debug', label: 'Debug', description: 'Inspect, prove, and fix' },
  { id: 'multitask', label: 'Multitask', description: 'Coordinate workflows' },
  { id: 'ask', label: 'Ask', description: 'Talk and answer questions' },
] as const satisfies ReadonlyArray<{ id: AgentMode; label: string; description: string }>;

export type WorkflowLedgerState = {
  runId: string | null;
  stepsTotal: number | null;
  stepsCompleted: number;
  currentNodeKey: string | null;
  runCost: number | null;
  runTokensIn: number | null;
  runTokensOut: number | null;
  lastError: string | null;
};

export type ExecPanelState = {
  tool_name: string;
  status: 'running' | 'done' | 'error';
  lines: string[];
  duration_ms?: number;
  started: string;
  is_sql: boolean;
  sql_rows?: Record<string, unknown>[];
} | null;
