import { IAM_AGENT_CHAT_COMPOSE } from '../../../agentChatConstants';
import {
  preferredCatalogToolsForOperator,
  type CadOperator,
} from './operators';

export type CadChatDispatchOpts = {
  operator?: CadOperator;
  operatorId?: string;
  prompt?: string;
  workspace?: string;
  selectedObjectId?: string | null;
  sceneId?: string | null;
  /** Optional Meshy ids when known from UI (agent freehands the rest). */
  meshyContext?: {
    rig_task_id?: string | null;
    model_task_id?: string | null;
    action_id?: number | null;
    action_name?: string | null;
  };
  send?: boolean;
};

/**
 * Compose an intent message for ChatAssistant.
 * Operators set *intent* + preferred catalog tool keys (D1-pinned).
 * The model freehands tool arguments against agentsam_tools.input_schema —
 * this is not hardcoded FreeCAD/Blender/OpenSCAD script injection.
 */
export function dispatchCadChat(opts: CadChatDispatchOpts): void {
  const {
    operator,
    operatorId,
    prompt,
    workspace,
    selectedObjectId,
    sceneId,
    meshyContext,
    send = false,
  } = opts;

  const opId = operator?.id ?? operatorId ?? 'unknown';
  const opTitle = operator?.title ?? opId;
  const engine = operator?.engine ?? 'Runner';
  const tools = preferredCatalogToolsForOperator(opId);

  const lines = [
    `[IAM CAD Studio] Run operator: **${opTitle}** (\`${opId}\`)`,
    `- Engine: ${engine}`,
    workspace ? `- Workspace: ${workspace}` : null,
    selectedObjectId ? `- Selected object: \`${selectedObjectId}\`` : null,
    sceneId ? `- Scene: \`${sceneId}\`` : null,
    tools.length
      ? `- Preferred catalog tools (call these — freehand args from schemas): ${tools.map((t) => `\`${t}\``).join(', ')}`
      : null,
    meshyContext?.model_task_id
      ? `- Meshy model_task_id: \`${meshyContext.model_task_id}\``
      : null,
    meshyContext?.rig_task_id ? `- Meshy rig_task_id: \`${meshyContext.rig_task_id}\`` : null,
    meshyContext?.action_id != null
      ? `- Meshy action_id: ${meshyContext.action_id}${
          meshyContext.action_name ? ` (${meshyContext.action_name})` : ''
        }`
      : null,
    prompt?.trim() ? `\nIntent:\n${prompt.trim()}` : null,
    opId === 'meshyAnimate' || opId === 'meshyRig'
      ? '\nUse Meshy catalog tools only. Do **not** call imgx_generate_image to fake progress UI. Do **not** invent Blender frame renders. Rig if needed → animate → poll meshyai_get_task → spawn GLB when public_url is ready.'
      : '\nCall the preferred catalog tools (or illustration_create for CAD engines). Freehand parameters from each tool schema. Update the Design Studio viewport when artifacts are ready — never fake status with image generation.',
  ].filter(Boolean);

  window.dispatchEvent(
    new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
      detail: {
        message: lines.join('\n'),
        send,
        ensureAgentPanel: true,
      },
    }),
  );
}

export function dispatchGenerateCadObject(body: {
  prompt: string;
  engine?: string;
  target?: string;
  units?: string;
  quality?: string;
  workspace?: string;
  sceneId?: string | null;
}): void {
  const engine = body.engine ?? 'Meshy';
  const isMeshy = /meshy/i.test(engine);
  const lines = [
    '[IAM CAD Studio] **Generate CAD Object**',
    `- Engine: ${engine}`,
    body.target ? `- Target: ${body.target}` : null,
    body.units ? `- Units: ${body.units}` : null,
    body.quality ? `- Quality: ${body.quality}` : null,
    body.workspace ? `- Workspace: ${body.workspace}` : null,
    body.sceneId ? `- Scene: \`${body.sceneId}\`` : null,
    isMeshy
      ? '- Preferred catalog tools: `meshyai_text_to_3d`, `meshyai_get_task`'
      : '- Prefer `illustration_create` with matching engine',
    `\nDescription:\n${body.prompt.trim()}`,
    '\nCall catalog tools with freehand args. Spawn the GLB in the Design Studio viewport when complete. Do not fake progress with imgx_generate_image.',
  ].filter(Boolean);

  window.dispatchEvent(
    new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
      detail: {
        message: lines.join('\n'),
        send: true,
        ensureAgentPanel: true,
      },
    }),
  );
}
