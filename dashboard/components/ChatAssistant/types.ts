/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import type { ActiveFile, ProjectType } from '../../types';
import type { AgentWorkspaceContextPacket } from '../../src/ideWorkspace';

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

export type ExecutionPlanTaskStatus = 'todo' | 'running' | 'done' | 'failed' | 'skipped' | 'blocked';

export type ExecutionPlanTask = {
  id: string;
  title: string;
  order_index: number;
  status: ExecutionPlanTaskStatus;
  parent_task_id?: string | null;
  handler_type?: string | null;
  /** Collapsed-by-default task output or error snippet. */
  detail?: string;
  trace?: {
    execution_step_id?: string | null;
    command_run_id?: string | null;
    workflow_run_id?: string | null;
    capability_type?: string | null;
    handler_key?: string | null;
    files_involved?: string[];
  };
};

export type ExecutionPlanState = {
  plan_id: string;
  plan_title: string;
  status: 'planning' | 'ready' | 'running' | 'complete' | 'partial' | 'failed';
  tasks: ExecutionPlanTask[];
  workflow_run_id?: string | null;
  tasks_completed?: number;
  tasks_failed?: number;
  tasks_skipped?: number;
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

export type ImageGenerationPhase =
  | 'idle'
  | 'initializing'
  | 'generating'
  | 'refining'
  | 'completed'
  | 'failed';

export type ImageGenerationPreviewFrame = {
  frameIndex: number;
  previewUrl: string;
};

/** Progressive image generation card state (SSE `image_generation_*`). */
export type ImageGenerationState = {
  generationId: string;
  phase: ImageGenerationPhase;
  provider?: string;
  model?: string;
  prompt?: string;
  width?: number;
  height?: number;
  progress: number;
  stage?: string;
  message: string;
  previewFrames: ImageGenerationPreviewFrame[];
  activeFrameIndex: number;
  imageUrl?: string;
  r2Key?: string;
  artifactId?: string;
  failed?: boolean;
};

export interface EmailArtifact {
  subject: string;
  body: string;
  to?: string;
  from?: string;
}

/** Inline agent question in thread (SSE needs_input / agent_question). */
export type AgentQuestionPayload = {
  question: string;
  options?: string[];
  questionId?: string;
};

export type PlanQuestionChoice = {
  key: string;
  label: string;
};

export type PlanIntakeQuestion = {
  id: string;
  question: string;
  choices: PlanQuestionChoice[];
  /** When true, the Questions UI allows selecting more than one choice. */
  multi_select?: boolean;
};

/** Cursor-style batched plan questions (SSE plan_questions_batch). */
export type PlanQuestionsBatchPayload = {
  batch_id: string;
  phase: 'pre_plan' | 'mid_plan' | 'roadblock';
  plan_id?: string | null;
  explore_summary?: {
    synthesis?: string;
    files_searched?: number;
    searches?: number;
  };
  questions: PlanIntakeQuestion[];
  allow_skip?: boolean;
  submitted?: boolean;
};

/** Plan proposal awaiting user confirmation (SSE plan_confirmation_required). */
export type PlanConfirmationPayload = {
  plan_id: string;
  approval_id: string;
  plan_title?: string;
  message?: string;
  tasks?: Array<{ title: string; order_index: number }>;
};

/** Active subagent row in multitask/plan fanout. */
export type ActiveSubagentRow = {
  id: string;
  slug: string;
  label: string;
  state: string;
  conversationId?: string | null;
  startedAt: number;
  stepCount?: number;
};

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Blob URLs kept after send so image previews stay visible in history (not revoked with composer clear). */
  attachmentPreviews?: MessageAttachmentPreview[];
  /** When Agent Sam emits `plan_created` with a saved plan map artifact. */
  implementationPlan?: ImplementationPlanChip | null;
  /** Live plan checklist from plan_* / task_* SSE (compact UI; verbose fields in task.trace). */
  executionPlan?: ExecutionPlanState | null;
  /** Reserved for structured previews from the Worker (optional; fences use `AgentCodeFencePreview` today). */
  previewArtifacts?: AgentPreviewArtifact[];
  /** Cinematic progressive image generation (SSE `image_generation_*`). */
  imageGenerationState?: ImageGenerationState | null;
  /** Email draft artifact from Agent Sam email composition (SSE `email_draft`). */
  emailArtifact?: EmailArtifact | null;
  /** Agent question rendered inline in thread. */
  agentQuestion?: AgentQuestionPayload | null;
  /** Batched plan intake questions (Continue / Skip). */
  planQuestionsBatch?: PlanQuestionsBatchPayload | null;
  /** Plan proposal bubble — View Plan / Build → */
  planConfirmation?: PlanConfirmationPayload | null;
}

/** Host-managed chat tab strip (e.g. App.tsx multi-session). */
export type AgentChatShellTab = { id: string; title: string };

export type { AgentWorkspaceContextPacket };

export interface ChatAssistantProps {
  activeProject: ProjectType;
  /** Design Studio linkage when on /dashboard/designstudio */
  designStudioSceneId?: string | null;
  designStudioBlueprintId?: string | null;
  designStudioCadJobId?: string | null;
  activeFileContent?: string;
  /** Surface-level default subagent slug — pinned on every message from this surface. */
  defaultSubagentSlug?: string;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  onFileSelect?: (file: Pick<ActiveFile, 'name' | 'content'> & Partial<ActiveFile> & { workspacePath?: string }) => void;
  onRunInTerminal?: (cmd: string) => void;
  activeFileName?: string;
  /** Full open-file metadata so @file / @monaco can include tool routing (r2_read, r2_write, github_file). */
  activeFile?: ActiveFile | null;
  /** Current editor cursor (for @monaco injection only). */
  editorCursorLine?: number;
  editorCursorColumn?: number;
  /** SSE: agent tool `r2_write` emits `r2_file_updated` for Monaco sync */
  onR2FileUpdated?: (event: { type: 'r2_file_updated'; bucket: string; key: string }) => void;
  /** SSE: `browser_navigate` / `surface_open` opens the Browser tab (embedded iframe; automation optional) */
  onBrowserNavigate?: (event: {
    type: 'browser_navigate';
    url: string;
    /** When true, BrowserView may show MYBROWSER/CDT screenshot preview instead of iframe-only. */
    automation?: boolean;
    screenshot_url?: string;
    page_text?: string;
    title?: string;
  }) => void;
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
  /** Mobile agent home: Quickstart chip → /dashboard/agent/quickstart. */
  onOpenQuickstart?: () => void;
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
  /** SSE `context.agent_run_id` (`agentsam_agent_run.id`) for run-spine linkage (e.g. BrowserView screenshots). */
  onAgentRunContext?: (agentRunId: string | null) => void;
  /** Active workbench tab (Workspace, code, browser, …). */
  activeWorkbenchTab?: string;
  /** Browser panel URL when host controls navigation. */
  browserUrl?: string | null;
  /** Labels/paths for open editor files (Monaco tabs). */
  openFilePaths?: string[];
  /** Active plan id from workspace dashboard when known. */
  activePlanId?: string | null;
  /** Notify host when chat creates or selects a plan. */
  onActivePlanChange?: (planId: string | null) => void;
  /** CMS route context (project_slug, page_id, KV/DO keys) when on /dashboard/cms. */
  cmsContext?: AgentWorkspaceContextPacket | null;
}

export type StagedAttachment = {
  id: string;
  file: File;
  type: 'image' | 'file';
  previewUrl: string | null;
};

export type PickerItem = { id: string; label: string; kind: string };
export type SlashCmd = { id?: string; slug: string; description: string | null };

export type ToolApprovalPayload = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  preview?: string;
  /** agentsam_approval_queue id — PATCH /api/agent/approval/:id after Allow. */
  approval_id?: string;
  proposal_id?: string;
  risk_level?: 'low' | 'medium' | 'high' | 'critical' | string;
  server_display_name?: string;
  /** Terminal connection_resolution from worker (e.g. superadmin_operator_workspace). */
  connection_resolution?: string;
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
 * Chat panel is max-phone:fixed z-[45], so the composer must pad above that stack or it sits underneath.
 */
export const MOBILE_CHAT_COMPOSER_BOTTOM_PAD =
  'calc(56px + 1.5rem + env(safe-area-inset-bottom, 0px) + 24px)';

/** Mobile: keep composer short so flex-1 message list does not jump on every keystroke; scroll inside textarea instead. */
export const COMPOSER_TEXTAREA_MAX_PX_NARROW = 104;
export const COMPOSER_TEXTAREA_MAX_PX_WIDE = 200;

export const LS_GH_REPO = 'iam-chat-github-repo-context';

/** Per-user + per-workspace — avoids leaking Sam's selected repo on shared machines. */
export function githubRepoContextStorageKey(userId: string | null, workspaceId: string | null): string {
  const u = userId?.trim() || 'anon';
  const w = workspaceId?.trim() || 'nows';
  return `${LS_GH_REPO}:${u}:${w}`;
}

/** Composer model picker: Thompson / resolveRoutingArm on the Worker when sent as `model`. */
export const AUTO_MODEL_KEY = 'auto';

export const LS_AGENT_CHAT_MODEL_KEY = 'iam-agent-chat-model-key';

export const LS_AGENT_CHAT_MODE = 'iam-agent-chat-mode';

/** Composer subagent picker — slug from `agentsam_subagent_profile` (empty = default Agent Sam). */
export const LS_AGENT_CHAT_SUBAGENT_SLUG = 'iam-agent-chat-subagent-slug';

export type ChatSubagentProfileRow = {
  id: string;
  slug: string;
  display_name: string;
  description?: string;
  default_model_id?: string | null;
  agent_type?: string;
  access_mode?: string;
  is_platform_global?: number;
};

export function isAutoModelSelection(modelKey: string | null | undefined): boolean {
  const k = modelKey != null ? String(modelKey).trim().toLowerCase() : '';
  return k === '' || k === AUTO_MODEL_KEY;
}

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
