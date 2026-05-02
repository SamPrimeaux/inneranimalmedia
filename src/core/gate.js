export async function runModeGate(env, userMessage, modeSlug) {
  const mode = await env.DB.prepare(
    'SELECT * FROM agent_mode_configs WHERE slug = ? AND is_active = 1'
  ).bind(modeSlug ?? 'agent').first();

  if (!mode || !env.OPENAI_API_KEY) {
    return { model: 'gpt-5.4', provider: 'openai', reasoning_effort: 'none', rewritten_prompt: userMessage };
  }

  let gateResult = null;
  try {
    const gateResp = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: mode.gate_model ?? 'gpt-5.4-nano',
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

  const complexity = gateResult?.complexity ?? 0.5;
  const shouldEscalate = gateResult?.escalate === true || complexity >= (mode.escalation_threshold ?? 0.8);
  const resolvedModel = shouldEscalate
    ? (mode.escalation_model ?? mode.model_preference ?? 'gpt-5.4')
    : (mode.model_preference ?? 'gpt-5.4');

  const taskType = gateResult?.task_type ?? 'agent_chat';
  const routingRule = await env.DB.prepare(
    'SELECT reasoning_effort FROM model_routing_rules WHERE task_type = ? AND is_active = 1'
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
