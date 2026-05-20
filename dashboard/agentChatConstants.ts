/** localStorage key for persisted Agent Sam thread id (keep in sync with App workspace scope). */
export const LS_AGENT_CHAT_CONVERSATION_ID = 'iam-agent-chat-conversation-id';

/** Window event: detail.id string selects thread; null clears (new chat). */
export const IAM_AGENT_CHAT_CONVERSATION_CHANGE = 'iam-agent-chat-conversation-change';

/** Labeled quickstart / smoketest batches — trains Thompson on ws_inneranimalmedia. */
export const QUICKSTART_BATCH_LABEL = 'anthropic_smoketest_quickstart';

export const QUICKSTART_WORKSPACE_ID = 'ws_inneranimalmedia';

/** Payload for {@link IAM_AGENT_CHAT_NEW_THREAD} from Quickstart → ChatAssistant. */
export type QuickstartThreadDetail = {
  message: string;
  task_type?: string;
  route_key?: string;
  quickstart_batch?: string;
  apply_eto_after_run?: boolean;
  workspace_id?: string;
  /** Force Auto routing (Thompson); do not pin a model. */
  modelKey?: string;
};

/** Window event: App created a new shell tab; ChatAssistant should send detail in that thread. */
export const IAM_AGENT_CHAT_NEW_THREAD = 'iam-agent-chat-new-thread';

export const CREATE_SKILL_SEED_MESSAGE =
  'I want to create a new Agent Sam skill. Please start with an intake interview (do not auto-run a multi-step plan yet): what should it do, when should it trigger, and is it a Cursor skill or a Worker/D1 skill?';
