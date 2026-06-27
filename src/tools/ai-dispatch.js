import { handlers as dbHandlers } from './db.js';
import { handlers as termHandlers } from './terminal.js';

// Builtin Imports
import { handlers as builtinFsHandlers } from './builtin/fs.js';
import { handlers as webHandlers } from './builtin/web.js';
import { handlers as mediaHandlers } from './builtin/media.js';
import { handlers as moviemodeHandlers } from './builtin/moviemode.js';
import { handlers as contextHandlers } from './builtin/context.js';
import { handlers as deployHandlers } from './builtin/deploy.js';
import { handlers as telemetryHandlers } from './builtin/telemetry.js';
import { handlers as integrationsHandlers } from './builtin/integrations.js';
import { handlers as storageHandlers } from './builtin/storage.js';
import { handlers as platformHandlers } from './builtin/platform.js';
import { handlers as agentHandlers } from './builtin/agent.js';
import { handlers as workflowHandlers } from './builtin/workflow.js';
import { handlers as anthropicCliHandlers } from './builtin/anthropic-cli.js';
import { handlers as anthropicBatchHandlers } from './builtin/anthropic-batch.js';
import { imessageTools } from './builtin/imessage.js';
import { getComputerUseTools, specializedSchemas } from './builtin/computer-use.js';
import { python_execute } from './builtin/python.js';
import { handlers as aiOpsHandlers } from './builtin/ai-ops.js';
import { handlers as githubWorkerHandlers } from './builtin/github-worker.js';
import { handlers as memoryHandlers, MEMORY_TOOL_SCHEMAS } from './memory.js';


/** Merge agent session/run scope from tool loop context into Meshy/CAD tool params. */
function mergeMeshyRunContext(params, runContext) {
    const base = params && typeof params === 'object' ? { ...params } : {};
    if (!runContext || typeof runContext !== 'object') return base;
    const resolved =
        runContext.resolvedContext && typeof runContext.resolvedContext === 'object'
            ? runContext.resolvedContext
            : {};
    const sessionId =
        base.session_id ??
        base.conversation_id ??
        base.conversationId ??
        runContext.sessionId ??
        runContext.session_id ??
        runContext.conversation_id ??
        runContext.conversationId ??
        resolved.session_id ??
        null;
    return {
        ...base,
        session_id: sessionId,
        conversation_id:
            base.conversation_id ??
            base.conversationId ??
            runContext.conversation_id ??
            runContext.conversationId ??
            sessionId,
        agent_run_id:
            base.agent_run_id ??
            base.agentRunId ??
            runContext.agent_run_id ??
            runContext.agentRunId ??
            null,
        scene_snapshot_id:
            base.scene_snapshot_id ??
            base.scene_id ??
            runContext.scene_snapshot_id ??
            null,
        blueprint_id: base.blueprint_id ?? runContext.blueprint_id ?? null,
    };
}

/** Merge agent/workflow run ids from tool loop context into browser tool params. */
function mergeBrowserRunContext(params, runContext) {
    const base = params && typeof params === 'object' ? { ...params } : {};
    if (!runContext || typeof runContext !== 'object') return base;
    return {
        ...base,
        agent_run_id:
            base.agent_run_id ??
            base.agentRunId ??
            runContext.agent_run_id ??
            runContext.agentRunId ??
            null,
        workflow_run_id:
            base.workflow_run_id ??
            base.workflowRunId ??
            runContext.workflow_run_id ??
            runContext.workflowRunId ??
            null,
        run_id: base.run_id ?? base.runId ?? runContext.run_id ?? runContext.runId ?? null,
        conversation_id:
            base.conversation_id ??
            base.conversationId ??
            runContext.conversation_id ??
            runContext.conversationId ??
            runContext.sessionId ??
            null,
    };
}

export function normalizeToolName(toolName) {
    const n = String(toolName || '').trim();
    const aliases = {
        terminal_execute: 'terminal_run',
        run_command: 'terminal_run',
        bash: 'terminal_run',

        github_file: 'github_get_file',
        github_read: 'github_get_file',
        github_repo: 'github_repos',
        github_list_repos: 'github_repos',

        // Dashboard self-debug friendly aliases → existing CDT / browser MCP tools (no new D1 rows).
        browser_open_url: 'cdt_navigate_page',
        browser_get_dom_summary: 'cdt_take_snapshot',
        browser_click: 'cdt_click',
        browser_type: 'cdt_fill',
        browser_press: 'cdt_press_key',
        browser_get_console_errors: 'cdt_list_console_messages',
        browser_get_network_events: 'cdt_list_network_requests',
        browser_get_current_url: 'cdt_list_pages',
        browser_wait_for_text: 'cdt_wait_for',
        browser_eval_safe: 'cdt_evaluate_script',

        // ai-ops.js registers ai_complete / ai_compare / ai_embed (not agentsam_*).
        // Legacy or mistaken names route to the same handlers.
        agentsam_complete: 'ai_complete',
        agentsam_compare: 'ai_compare',
        agentsam_embed: 'ai_embed',

        save_file: 'write_file',
        put_file: 'write_file',
        fs_write_file: 'write_file',
        fs_edit_file: 'write_file',
        fs_read_file: 'read_file',
        fs_list_files: 'list_files',

        d1_schema: 'd1_schema_introspect',
        schema_inspect: 'd1_schema_introspect',
    };
    return aliases[n] || n;
}

/**
 * Universal Tool Dispatcher (Omni-Sam v2.0).
 * Routes 100+ model-requested tools to their modular production handlers.
 */
export async function runBuiltinTool(env, toolName, params, runContext = {}) {
    toolName = normalizeToolName(toolName);
    console.log(`[AI Dispatcher] Executing: ${toolName}`);

    // High-priority tools that normally require frontend approval gates
    const requiresApproval = [
        'cdt_evaluate_script', 'cdt_upload_file', 'd1_write', 'd1_batch_write',
        'worker_deploy', 'resend_send_broadcast', 'resend_create_api_key',
        'meshyai_image_to_3d', 'meshyai_text_to_3d', 'agentsam_run_agent',
    ];

    if (requiresApproval.includes(toolName)) {
        console.warn(`[AI Dispatcher] Approval required tool detected: ${toolName}`);
    }

    switch (true) {
        // ── Open web (not MYBROWSER) ─────────────────────────────────────
        case toolName === 'search_web':
        case toolName === 'web_fetch':
            if (webHandlers[toolName]) return await webHandlers[toolName](params, env, runContext);
            return { error: `Unknown web tool: ${toolName}` };

        // ── CATEGORY: browser / DOM inspect (MYBROWSER) ───────────────────
        case toolName.startsWith('cdt_'):
        case toolName.startsWith('browser_'):
        case toolName === 'playwright_screenshot':
        case toolName === 'preview_in_browser':
            {
                const browserParams = mergeBrowserRunContext(params, runContext);
                if (webHandlers[toolName]) return await webHandlers[toolName](browserParams, env);
            }
            return { error: `Unknown browser tool: ${toolName}` };

        // ── CATEGORY: media / ui (13 Tools) ──────────────────────────────
        case toolName.startsWith('excalidraw_'):
        case toolName.startsWith('voxel_'):
        case toolName.startsWith('meshyai_'):
        case toolName.startsWith('imgx_'):
            {
                const mediaParams = toolName.startsWith('meshyai_')
                    ? mergeMeshyRunContext(params, runContext)
                    : params;
                return await mediaHandlers[toolName]?.(mediaParams, env, runContext);
            }

        case toolName === 'moviemode_render':
        case toolName === 'moviemode_export':
        case toolName === 'veo_generate_video':
        case toolName === 'agentsam_video_embed':
            return await moviemodeHandlers[toolName]?.(env, params);

        // ── CATEGORY: context / RAG (11 Tools) ───────────────────────────
        case toolName.startsWith('context_'):
        case toolName.startsWith('human_context_'):
        case toolName === 'knowledge_search':
        case toolName === 'rag_search':
        case toolName === 'attached_file_content':
            return await contextHandlers[toolName]?.(params, env);

        // ── CATEGORY: db (D1 + Hyperdrive) ───────────────────────────────
        case toolName.startsWith('d1_'):
        case toolName.startsWith('hyperdrive_'):
            return await dbHandlers[toolName]?.(params, env);

        // ── CATEGORY: memory (4 Tools) ─────────────────────────────────────────
        case toolName.startsWith('memory_'):
            return await memoryHandlers[toolName]?.(params, env, runContext);

        // ── CATEGORY: deploy (5 Tools) ───────────────────────────────────────────────
        case toolName.startsWith('worker_'):
        case toolName === 'list_workers':
        case toolName === 'get_deploy_command':
        case toolName === 'get_worker_services':
            return await deployHandlers[toolName]?.(params, env);

        // ── CATEGORY: workflow (2 Tools) ─────────────────────────────────────────────
        case toolName === 'workflow_run_pipeline':
        case toolName === 'generate_daily_summary_email':
        case toolName === 'generate_execution_plan':
            return await workflowHandlers[toolName]?.(params, env);

        // ── CATEGORY: email / imessage / integrations / conversion (18 Tools) ──
        case toolName.startsWith('github_'):
            return await githubWorkerHandlers[toolName]?.(params, env);

        case toolName.startsWith('resend_'):
        case toolName.startsWith('imessage.'):
        case toolName.startsWith('cf_images_'):
        case toolName.startsWith('gdrive_'):
        case toolName.startsWith('cloudconvert_'):
            return await integrationsHandlers[toolName]?.(params, env) || await imessageTools[toolName]?.({ env, session: params.session }, params);

        // ── CATEGORY: filesystem (read + staged writes) ───────────────────
        case toolName === 'write_file':
        case toolName === 'read_file':
        case toolName === 'list_dir':
        case toolName === 'list_files':
        case toolName === 'apply_change_set':
        case toolName.startsWith('fs_'):
            return await builtinFsHandlers[toolName]?.(params, env, runContext);

        // ── CATEGORY: storage (9 Tools) ──────────────────────────────────
        case toolName.startsWith('r2_'):
        case toolName.startsWith('workspace_'):
        case toolName === 'get_r2_url':
            return await storageHandlers[toolName]?.(params, env);

        // ── CATEGORY: platform / quality (4 Tools) ───────────────────────
        case toolName.startsWith('a11y_'):
        case toolName === 'platform_info':
        case toolName === 'list_clients':
            return await platformHandlers[toolName]?.(params, env);

        // ── CATEGORY: telemetry (3 Tools) ────────────────────────────────────────────
        case toolName.startsWith('telemetry_'):
            return await telemetryHandlers[toolName]?.(params, env);

        // ── CATEGORY: intelligence / llm ops (Workers AI + embeddings) ───
        case toolName.startsWith('ai_'):
        case toolName === 'agentsam_complete':
        case toolName === 'agentsam_compare':
        case toolName === 'agentsam_embed': {
            const key =
                toolName.startsWith('ai_')
                    ? toolName
                    : { agentsam_complete: 'ai_complete', agentsam_compare: 'ai_compare', agentsam_embed: 'ai_embed' }[
                          toolName
                      ];
            const out = key ? await aiOpsHandlers[key]?.(params, env) : undefined;
            return out ?? { error: `Tool integration for '${toolName}' not found.` };
        }

        // ── CATEGORY: agent (3 Tools) ────────────────────────────────────
        case toolName.startsWith('agentsam_'):
            return await agentHandlers[toolName]?.(params, env);

        // ── CATEGORY: terminal / execution (3 Tools) ──────────────────────
        case toolName === 'terminal_run':
        case toolName === 'terminal_execute':
        case toolName === 'run_command':
        case toolName === 'bash':
            return await termHandlers.run_command?.({ ...params, tool_name: toolName }, env);

        case toolName === 'python_execute':
            return await python_execute(params, env);

        // ── CATEGORY: intelligence / llm ops (6 Tools) ──────────────────
        case toolName.startsWith('anthropic_cli'):
            return await anthropicCliHandlers[toolName]?.(params, env);
        case toolName.startsWith('anthropic_batch'):
            return await anthropicBatchHandlers[toolName]?.(params, env);

        default:
            return { error: `Tool integration for '${toolName}' not found.` };
    }
}
