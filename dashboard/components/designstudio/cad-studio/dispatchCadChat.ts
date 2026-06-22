import { IAM_AGENT_CHAT_COMPOSE } from '../../../agentChatConstants';
import type { CadOperator } from './operators';

export type CadChatDispatchOpts = {
  operator?: CadOperator;
  operatorId?: string;
  prompt?: string;
  workspace?: string;
  selectedObjectId?: string | null;
  sceneId?: string | null;
  send?: boolean;
};

/** Route agentic CAD ops through ChatAssistant — no direct API from palette. */
export function dispatchCadChat(opts: CadChatDispatchOpts): void {
  const {
    operator,
    operatorId,
    prompt,
    workspace,
    selectedObjectId,
    sceneId,
    send = false,
  } = opts;

  const opId = operator?.id ?? operatorId ?? 'unknown';
  const opTitle = operator?.title ?? opId;
  const engine = operator?.engine ?? 'Runner';

  const lines = [
    `[IAM CAD Studio] Run operator: **${opTitle}** (\`${opId}\`)`,
    `- Engine: ${engine}`,
    workspace ? `- Workspace: ${workspace}` : null,
    selectedObjectId ? `- Selected object: \`${selectedObjectId}\`` : null,
    sceneId ? `- Scene: \`${sceneId}\`` : null,
    prompt?.trim() ? `\nPrompt:\n${prompt.trim()}` : null,
    '\nPlease orchestrate this via the appropriate CAD/Meshy/Blender runner tools and update the viewport when artifacts are ready.',
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
  const lines = [
    '[IAM CAD Studio] **Generate CAD Object**',
    `- Engine: ${body.engine ?? 'Meshy'}`,
    body.target ? `- Target: ${body.target}` : null,
    body.units ? `- Units: ${body.units}` : null,
    body.quality ? `- Quality: ${body.quality}` : null,
    body.workspace ? `- Workspace: ${body.workspace}` : null,
    body.sceneId ? `- Scene: \`${body.sceneId}\`` : null,
    `\nDescription:\n${body.prompt.trim()}`,
    '\nGenerate the model and spawn the GLB in the Design Studio viewport when complete.',
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
