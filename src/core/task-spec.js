/**
 * TaskSpec — primary output of resolveTurnDecision (beyond legacy taskType).
 * Separates domain / operation / authority / tool profile from the overloaded task_type string.
 *
 * Compat: taskType remains the persisted canonical key during migration
 * (generated from domain.operation when possible).
 */

/** @typedef {'chat'|'code'|'data'|'media'|'mail'|'ops'|'cms'|'design'|'unknown'} TaskDomain */
/** @typedef {'ask'|'inspect'|'search'|'plan'|'mutate'|'generate'|'revise'|'triage'|'deploy'|'verify'} TaskOperation */
/** @typedef {'none'|'read'|'external_read'|'workspace_write'|'external_write'} TaskSideEffect */
/** @typedef {'read'|'mutate'|'approve_mutate'} TaskAuthority */
/** @typedef {'inspect'|'code_develop'|'image'|'ask'|'mail'|'oauth_parity'|'exempt'} ToolProfileHint */
/** @typedef {'L0'|'L1'|'L2'|'L3'|'L4'|'L5'|'L6'|'L7'} ConceptualLane */

/**
 * @typedef {object} TaskSpec
 * @property {string} version
 * @property {TaskDomain} domain
 * @property {TaskOperation} operation
 * @property {string|null} target
 * @property {TaskAuthority} authority
 * @property {TaskSideEffect} sideEffect
 * @property {ToolProfileHint} toolProfile
 * @property {ConceptualLane} conceptualLane
 * @property {string} taskType  legacy projection (agentsam_intent_decisions.task_type)
 * @property {string|null} modeHint
 * @property {number|null} confidence
 * @property {string|null} matchedBy
 * @property {boolean} imageFastPath
 */

/**
 * @param {string} taskType
 * @param {{ imageFastPath?: boolean, message?: string|null, mode?: string|null }} [ctx]
 * @returns {Omit<TaskSpec, 'version'|'confidence'|'matchedBy'|'imageFastPath'|'modeHint'|'taskType'>}
 */
export function mapTaskTypeToSpecAxes(taskType, ctx = {}) {
  const tt = String(taskType || '').trim().toLowerCase();
  const message = String(ctx.message || '');
  const imageFastPath = ctx.imageFastPath === true;

  if (imageFastPath || tt === 'image_generation') {
    const revise = /\b(edit|revise|make it|change it|darker|brighter|again)\b/i.test(message);
    return {
      domain: 'media',
      operation: revise ? 'revise' : 'generate',
      target: 'image',
      authority: 'mutate',
      sideEffect: 'external_write',
      toolProfile: 'image',
      conceptualLane: 'L6',
    };
  }

  if (
    tt === 'project_question' ||
    tt === 'readonly_repo_audit' ||
    tt === 'summary' ||
    tt === 'research'
  ) {
    return {
      domain: 'code',
      operation: 'inspect',
      target: 'repo',
      authority: 'read',
      sideEffect: 'none',
      toolProfile: 'inspect',
      conceptualLane: 'L4',
    };
  }

  if (tt === 'ask' || tt === 'chat' || tt === 'simple_ask_greeting' || tt === 'project_qna_fast') {
    // Repo/architecture asks still want inspect tools even when classifier says chat/ask.
    if (
      /\b(inspect|propose|improve|structure|architecture|overview|audit|tool structure|task.?type)\b/i.test(
        message,
      ) &&
      /\b(repo|codebase|tool|agent|routing|profile|workspace|samprimeaux|inneranimalmedia)\b/i.test(
        message,
      )
    ) {
      return {
        domain: 'code',
        operation: 'inspect',
        target: 'repo',
        authority: 'read',
        sideEffect: 'none',
        toolProfile: 'inspect',
        conceptualLane: 'L4',
      };
    }
    return {
      domain: 'chat',
      operation: 'ask',
      target: null,
      authority: 'read',
      sideEffect: 'none',
      toolProfile: 'ask',
      conceptualLane: 'L1',
    };
  }

  if (tt === 'plan') {
    return {
      domain: 'code',
      operation: 'plan',
      target: 'repo',
      authority: 'read',
      sideEffect: 'none',
      toolProfile: 'inspect',
      conceptualLane: 'L4',
    };
  }

  if (
    tt === 'code' ||
    tt === 'code_implementation' ||
    tt === 'implementation' ||
    tt === 'feature' ||
    tt === 'refactor' ||
    tt === 'cms_edit' ||
    tt === 'tool_use'
  ) {
    return {
      domain: tt === 'cms_edit' ? 'cms' : 'code',
      operation: 'mutate',
      target: tt === 'cms_edit' ? 'cms' : 'repo',
      authority: 'approve_mutate',
      sideEffect: 'workspace_write',
      toolProfile: 'code_develop',
      conceptualLane: 'L2',
    };
  }

  if (tt === 'debug' || tt === 'terminal_execution') {
    return {
      domain: 'code',
      operation: tt === 'debug' ? 'verify' : 'mutate',
      target: 'repo',
      authority: 'approve_mutate',
      sideEffect: 'workspace_write',
      toolProfile: 'code_develop',
      conceptualLane: tt === 'debug' ? 'L5' : 'L2',
    };
  }

  if (tt === 'deploy') {
    return {
      domain: 'ops',
      operation: 'deploy',
      target: 'worker',
      authority: 'approve_mutate',
      sideEffect: 'external_write',
      toolProfile: 'code_develop',
      conceptualLane: 'L2',
    };
  }

  if (tt === 'sql_d1_generation' || tt === 'd1_query' || tt === 'd1_write') {
    const write = tt === 'd1_write' || tt === 'sql_d1_generation';
    return {
      domain: 'data',
      operation: write ? 'mutate' : 'inspect',
      target: 'd1',
      authority: write ? 'approve_mutate' : 'read',
      sideEffect: write ? 'workspace_write' : 'none',
      toolProfile: write ? 'code_develop' : 'inspect',
      conceptualLane: write ? 'L2' : 'L3',
    };
  }

  if (tt === 'mail_triage' || tt === 'gmail') {
    return {
      domain: 'mail',
      operation: 'triage',
      target: 'gmail',
      authority: 'approve_mutate',
      sideEffect: 'external_write',
      toolProfile: 'mail',
      conceptualLane: 'L1',
    };
  }

  if (tt === 'search_code' || tt === 'vectorize') {
    return {
      domain: 'code',
      operation: 'search',
      target: 'repo',
      authority: 'read',
      sideEffect: 'none',
      toolProfile: 'inspect',
      conceptualLane: 'L3',
    };
  }

  if (tt === 'design_studio' || tt === 'cad_generation' || tt === 'design_intake') {
    return {
      domain: 'design',
      operation: 'generate',
      target: 'design',
      authority: 'mutate',
      sideEffect: 'workspace_write',
      toolProfile: 'exempt',
      conceptualLane: 'L6',
    };
  }

  return {
    domain: 'unknown',
    operation: 'ask',
    target: null,
    authority: 'read',
    sideEffect: 'none',
    toolProfile: 'oauth_parity',
    conceptualLane: 'L1',
  };
}

/**
 * @param {{
 *   taskType: string,
 *   imageFastPath?: boolean,
 *   message?: string|null,
 *   mode?: string|null,
 *   confidence?: number|null,
 *   matchedBy?: string|null,
 * }} input
 * @returns {TaskSpec}
 */
export function buildTaskSpec(input) {
  const taskType = String(input.taskType || 'chat').trim().toLowerCase() || 'chat';
  const axes = mapTaskTypeToSpecAxes(taskType, {
    imageFastPath: input.imageFastPath === true,
    message: input.message,
    mode: input.mode,
  });
  return {
    version: 'task-spec-v1',
    ...axes,
    taskType,
    modeHint: input.mode != null ? String(input.mode) : null,
    confidence: input.confidence != null ? Number(input.confidence) : null,
    matchedBy: input.matchedBy != null ? String(input.matchedBy) : null,
    imageFastPath: input.imageFastPath === true,
  };
}

/**
 * Compact key for logs / telemetry: domain.operation
 * @param {TaskSpec|null|undefined} spec
 */
export function taskSpecKey(spec) {
  if (!spec) return 'unknown.ask';
  return `${spec.domain}.${spec.operation}`;
}
