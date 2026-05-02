import { handlers as fsHandlers } from './fs.js';
import { handlers as dbHandlers } from './db.js';
import { handlers as termHandlers } from './terminal.js';

// Builtin Imports
import { handlers as webHandlers } from './builtin/web.js';
import { handlers as mediaHandlers } from './builtin/media.js';
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

/**
 * Universal Tool Dispatcher (Omni-Sam v2.0).
 * Routes 100+ model-requested tools to their modular production handlers.
 */
export async function runBuiltinTool(env, toolName, params) {
    console.log(`[AI Dispatcher] Executing: ${toolName}`);

    // High-priority tools that normally require frontend approval gates
    const requiresApproval = [
        'cdt_evaluate_script', 'cdt_upload_file', 'd1_write', 
        'worker_deploy', 'resend_send_broadcast', 'resend_create_api_key',
        'meshyai_image_to_3d', 'meshyai_text_to_3d', 'agentsam_run_agent'
    ];

    if (requiresApproval.includes(toolName)) {
        console.warn(`[AI Dispatcher] Approval required tool detected: ${toolName}`);
    }

    switch (true) {
        // ── CATEGORY: browser / web (31 Tools) ───────────────────────────
        case toolName.startsWith('cdt_'):
        case toolName.startsWith('browser_'):
        case toolName === 'playwright_screenshot':
        case toolName === 'preview_in_browser':
        case toolName === 'web_search':
            return await webHandlers[toolName]?.(params, env) || await webHandlers.search_web?.(params, env);

        // ── CATEGORY: media / ui (13 Tools) ──────────────────────────────
        case toolName.startsWith('excalidraw_'):
        case toolName.startsWith('voxel_'):
        case toolName.startsWith('meshyai_'):
        case toolName.startsWith('imgx_'):
            return await mediaHandlers[toolName]?.(params, env);

        // ── CATEGORY: context / RAG (11 Tools) ───────────────────────────
        case toolName.startsWith('context_'):
        case toolName.startsWith('human_context_'):
        case toolName === 'knowledge_search':
        case toolName === 'rag_search':
        case toolName === 'attached_file_content':
            return await contextHandlers[toolName]?.(params, env);

        // ── CATEGORY: db (3 Tools) ───────────────────────────────────────
        case toolName.startsWith('d1_'):
            return await dbHandlers[toolName]?.(params, env);

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
        case toolName.startsWith('resend_'):
        case toolName.startsWith('imessage.'):
        case toolName.startsWith('cf_images_'):
        case toolName.startsWith('gdrive_'):
        case toolName.startsWith('github_'):
        case toolName.startsWith('cloudconvert_'):
            return await integrationsHandlers[toolName]?.(params, env) || await imessageTools[toolName]?.({ env, session: params.session }, params);

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

        // ── CATEGORY: agent (3 Tools) ────────────────────────────────────
        case toolName.startsWith('agentsam_'):
            return await agentHandlers[toolName]?.(params, env);

        // ── CATEGORY: terminal / execution (3 Tools) ──────────────────────
        case toolName === 'terminal_execute':
        case toolName === 'run_command':
        case toolName === 'bash':
            return await termHandlers.run_command?.(params, env);

        // ── CATEGORY: intelligence / llm ops (6 Tools) ──────────────────
        case toolName.startsWith('anthropic_cli'):
            return await anthropicCliHandlers[toolName]?.(params, env);
        case toolName.startsWith('anthropic_batch'):
            return await anthropicBatchHandlers[toolName]?.(params, env);

        default:
            return { error: `Tool integration for '${toolName}' not found.` };
    }
}
