/** localStorage key for persisted Agent Sam thread id (keep in sync with App workspace scope). */
export const LS_AGENT_CHAT_CONVERSATION_ID = 'iam-agent-chat-conversation-id';

/** Window event: detail.id string selects thread; null clears (new chat). */
export const IAM_AGENT_CHAT_CONVERSATION_CHANGE = 'iam-agent-chat-conversation-change';

/** Window event: detail.id is active agent/workflow run id; null clears. */
export const IAM_AGENT_RUN_CONTEXT = 'iam-agent-run-context';

/** Mobile: keep Agent Sam chat shell open and focus the Context tab (repo/editor) instead of empty Monaco. */
export const IAM_AGENT_MOBILE_CODE_FOCUS = 'iam-agent-mobile-code-focus';

/** Window event: detail.job_id — CAD/Meshy job created from Agent Sam tools. */
export const IAM_DESIGNSTUDIO_CAD_JOB = 'iam-designstudio-cad-job';

/** Labeled quickstart / smoketest batches — trains Thompson on ws_inneranimalmedia. */
export const QUICKSTART_BATCH_LABEL = 'anthropic_smoketest_quickstart';

export const QUICKSTART_WORKSPACE_ID = 'ws_inneranimalmedia';

/** Payload for {@link IAM_AGENT_CHAT_NEW_THREAD} from Quickstart → ChatAssistant. */
export type QuickstartThreadDetail = {
  message: string;
  task_type?: string;
  route_key?: string;
  quickstart_batch?: string;
  quickstart_card?: string;
  apply_eto_after_run?: boolean;
  workspace_id?: string;
  /** Force Auto routing (Thompson); do not pin a model. */
  modelKey?: string;
  ensureAgentPanel?: boolean;
  force_plan_mode?: boolean;
  project_slug?: string;
  page_id?: string | null;
  bootstrap_cache_key?: string | null;
  collab_room?: string | null;
  live_session_id?: string | null;
};

/** Window event: App created a new shell tab; ChatAssistant should send detail in that thread. */
export const IAM_AGENT_CHAT_NEW_THREAD = 'iam-agent-chat-new-thread';

/** ChatAssistant mounted and listening for pending App sends. */
export const IAM_AGENT_CHAT_READY = 'iam-agent-chat-ready';

/** App should navigate to `/dashboard/agent/{id}` (React Router — not replaceState). */
export const IAM_AGENT_SYNC_CONVERSATION_URL = 'iam-agent-sync-conversation-url';

export const CREATE_SKILL_SEED_MESSAGE =
  'I want to create a new Agent Sam skill. Please start with an intake interview (do not auto-run a multi-step plan yet): what should it do, when should it trigger, and is it a Cursor skill or a Worker/D1 skill?';

/** Prefill Agent Sam composer when creating a subagent from Settings (user sends manually). */
export const CREATE_SUBAGENT_COMPOSE_MESSAGE = '/create-subagent';

/** Window event: prefill composer; does not send unless detail.send === true. */
export const IAM_AGENT_CHAT_COMPOSE = 'iam:agent-chat-compose';

export type AgentChatComposeDetail = {
  message: string;
  selectionStart?: number;
  selectionEnd?: number;
  /** When true (default), App opens the agent panel if it was closed. */
  ensureAgentPanel?: boolean;
  /** When true, sends immediately (default false). */
  send?: boolean;
};

/** Navigate to Agent workbench and open a tab (from Artifacts build flow). */
export const IAM_ARTIFACT_OPEN_BUILDER = 'iam:artifact-open-builder';

export type ArtifactOpenBuilderDetail = {
  tab?: 'code' | 'browser' | 'moviemode' | 'Workspace' | 'excalidraw';
  artifactId?: string | null;
  r2Key?: string | null;
};

/** Handoff from Examples Gallery iframe → Agent chat (wired in App.tsx). */
export type ExamplesGalleryPromptHandoff = {
  prompt: string;
  recipeId?: string;
  source?: string;
};

declare global {
  interface Window {
    iamStartWorkspaceWithPrompt?: (detail: ExamplesGalleryPromptHandoff) => void;
  }
}
