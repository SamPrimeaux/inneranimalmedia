/**
 * RuntimeProfile — the single orchestration contract downstream execution should read.
 * Phase 0 schema; compiled from D1 registry at request time (Phase 1).
 *
 * @module runtime-profile.types
 */

/**
 * @typedef {import('./agent-mode.js').AgentMode} AgentMode
 */

/**
 * @typedef {'chat_loop'|'plan_pipeline'|'workflow_only'|'multitask_fanout'} ExecutionKind
 */

/**
 * @typedef {Object} RuntimeWritePolicy
 * @property {boolean} can_edit_files
 * @property {boolean} can_terminal
 * @property {boolean} can_d1_write
 * @property {boolean} can_deploy
 * @property {boolean} can_browser_automation
 * @property {boolean} can_memory_write
 */

/**
 * @typedef {'readonly_context'|'plan_artifact'|'execution'|'parallel'} ToolProfile
 */

/**
 * @typedef {Object} RuntimeContextPolicy
 * @property {boolean} include_rag
 * @property {boolean} include_memory
 * @property {boolean} include_workspace
 * @property {boolean} fresh_thread_recommended
 */

/**
 * @typedef {Object} RuntimeParallelPolicy
 * @property {boolean} enabled
 * @property {number} max_subagents
 * @property {string[]} allowed_subagent_types
 * @property {'synthesize'|'first_success'|'all'} merge_strategy
 */

/**
 * @typedef {Object} RuntimeProfileSource
 * @property {string|null} prompt_route_id
 * @property {string|null} route_requirements_id
 * @property {number} compiled_at
 * @property {'shadow'|'live'} compile_lane
 */

/**
 * @typedef {Object} RuntimeProfile
 * @property {Exclude<AgentMode, 'auto'>} mode
 * @property {string} profile_id
 * @property {string} profile_hash
 * @property {number} profile_version
 * @property {string|null} system_prompt_key
 * @property {string|null} system_prompt_inline
 * @property {string[]} prompt_layers
 * @property {string[]} tool_allowlist
 * @property {string[]} tool_denylist
 * @property {string[]} tool_require_approval
 * @property {number} max_tools
 * @property {number} max_tool_calls
 * @property {number} max_turns
 * @property {number} max_runtime_ms
 * @property {RuntimeWritePolicy} write_policy
 * @property {string|null} workflow_key
 * @property {ExecutionKind} execution_kind
 * @property {RuntimeContextPolicy} context_policy
 * @property {string} routing_task_type
 * @property {string|null} model_key
 * @property {string|null} routing_arm_id
 * @property {number} temperature
 * @property {RuntimeParallelPolicy} parallel_policy
 * @property {RuntimeProfileSource} source
 * @property {string|null} refined_route_key
 * @property {string} color
 * @property {ToolProfile} tool_profile
 * @property {boolean} tool_capable_required
 * @property {string|null} selected_provider
 */

/**
 * @typedef {Object} RuntimeProfileSession
 * @property {string} userId
 * @property {string} workspaceId
 * @property {string|null} [tenantId]
 * @property {string|null} [conversationId]
 */

/**
 * @typedef {Object} RuntimeProfileOverrides
 * @property {string|null} [model_key]
 * @property {string|null} [subagent_slug]
 * @property {string|null} [route_key]
 * @property {string|null} [task_type]
 */

/**
 * @typedef {Object} ResolveRuntimeProfileInput
 * @property {unknown} mode
 * @property {string} message
 * @property {RuntimeProfileSession} session
 * @property {RuntimeProfileOverrides} [overrides]
 * @property {'shadow'|'live'} [compile_lane]
 */

export const RUNTIME_PROFILE_VERSION = 1;
