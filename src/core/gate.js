import { resolveModelForTask, normalizeCanonicalTaskType } from './resolveModel.js';

export async function runModeGate(env, userMessage, modeSlug, workspaceId = null) {
  const ws =
    workspaceId != null && String(workspaceId).trim() !== ''
      ? String(workspaceId).trim()
      : null;

  let gateModel = 'gpt-5.4-nano';
  let escalationModel = 'gpt-5.4';
  if (env?.DB && ws) {
    try {
      const gateResolved = await resolveModelForTask(env, {
        task_type: normalizeCanonicalTaskType('gate'),
        mode: 'auto',
        workspace_id: ws,
      });
      gateModel = gateResolved.model_key;
      const escResolved = await resolveModelForTask(env, {
        task_type: normalizeCanonicalTaskType('gate'),
        mode: 'agent',
        workspace_id: ws,
      });
      escalationModel = escResolved.model_key;
    } catch (_) {}
  }

  const mode = {
    slug: modeSlug ?? 'agent',
    gate_model: gateModel,
    escalation_model: escalationModel,
    escalation_threshold: 0.8,
    gate_prompt: null,
  };

  if (!env.OPENAI_API_KEY) {
    return { model: 'gpt-5.4', provider: 'openai', reasoning_effort: 'none', rewritten_prompt: userMessage };
  }

  let gateResult = null;
  if (mode.gate_prompt) {
    try {
      // P3: direct /v1/responses; future: resolve gate model via catalog + dispatchComplete / Responses adapter.
      const gateResp = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
        body: JSON.stringify({
          model: gateModel,
          input: [
            { role: 'system', content: mode.gate_prompt },
            { role: 'user', content: userMessage.slice(0, 4000) }
          ],
          reasoning: { effort: 'none' },
          text: { verbosity: 'low' },
          max_output_tokens: 512,
        })
      });
      if (gateResp.ok) {
        const d = await gateResp.json();
        gateResult = JSON.parse((d.output_text ?? '').replace(/```json|```/g, '').trim());
      }
    } catch (_) {}
  }

  const complexity = gateResult?.complexity ?? 0.5;
  const shouldEscalate = gateResult?.escalate === true || complexity >= (mode.escalation_threshold ?? 0.8);
  const resolvedModel = shouldEscalate ? escalationModel : gateModel;

  const taskType = gateResult?.task_type ?? 'agent_chat';
  const routingRule = await env.DB.prepare(
    'SELECT reasoning_effort FROM agentsam_routing_arms WHERE task_type = ? AND is_active = 1 LIMIT 1'
  ).bind(taskType).first();

  return {
    model: resolvedModel,
    provider: 'openai',
    reasoning_effort: routingRule?.reasoning_effort ?? 'none',
    task_type: taskType,
    rewritten_prompt: gateResult?.rewritten_prompt ?? userMessage,
    tools_hint: gateResult?.tools_hint ?? [],
    complexity,
    mode,
  };
}
