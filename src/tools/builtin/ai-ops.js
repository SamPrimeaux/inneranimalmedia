/**
 * ai_complete / ai_compare / ai_embed — Workers AI + shared embeddings.
 */
import { generateWorkersAiEmbedding } from '../../core/embed-workers-ai.js';
import { resolveModelApiKey } from '../../integrations/tokens.js';

const WAI_COMPACT = '@cf/meta/llama-3.1-8b-instruct';

async function runWorkersAiText(env, system, user) {
  if (!env?.AI) return { error: 'Workers AI binding (env.AI) not configured' };
  const messages = [
    ...(system ? [{ role: 'system', content: String(system).slice(0, 8000) }] : []),
    { role: 'user', content: String(user).slice(0, 12000) },
  ];
  const res = await env.AI.run(WAI_COMPACT, { messages });
  const text =
    (typeof res === 'string' && res) ||
    res?.response ||
    res?.result ||
    (Array.isArray(res?.messages) && res.messages[0]?.content) ||
    '';
  if (!text) return { error: 'empty_completion', raw: res };
  return { success: true, text: String(text).trim() };
}

export const handlers = {
  async ai_embed(params, env) {
    const text = params.text != null ? String(params.text) : params.input != null ? String(params.input) : '';
    if (!text.trim()) return { error: 'text required' };
    try {
      const vec = await generateWorkersAiEmbedding(env, text.slice(0, 8000));
      return { success: true, dimensions: Array.isArray(vec) ? vec.length : vec?.length ?? 0, embedding: vec };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },

  async ai_complete(params, env) {
    const prompt = params.prompt != null ? String(params.prompt) : String(params.text || '');
    const system = params.system != null ? String(params.system) : '';
    if (!prompt.trim()) return { error: 'prompt required' };
    return await runWorkersAiText(env, system || null, prompt);
  },

  async ai_compare(params, env) {
    const a = params.a != null ? String(params.a) : '';
    const b = params.b != null ? String(params.b) : '';
    if (!a.trim() || !b.trim()) return { error: 'a and b required' };
    const rubric = params.rubric != null ? String(params.rubric) : 'similarity, factual overlap, and contradictions';
    const sys = `Compare two texts. ${rubric}. Respond with concise bullet points.`;
    const user = `TEXT_A:\n${a.slice(0, 6000)}\n\nTEXT_B:\n${b.slice(0, 6000)}`;
    const w = await runWorkersAiText(env, sys, user);
    if (w.error) {
      // Optional OpenAI fallback when Workers AI missing
      const key = await resolveModelApiKey(env, 'openai', 'gpt-4.1-nano', params.user_id || null);
      if (!key) return w;
      try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4.1-nano',
            messages: [
              { role: 'system', content: sys },
              { role: 'user', content: user },
            ],
            max_tokens: 800,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { error: data?.error?.message || `openai ${res.status}` };
        }
        const text = data?.choices?.[0]?.message?.content || '';
        return { success: true, text: String(text).trim(), via: 'openai' };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    }
    return { ...w, via: 'workers_ai' };
  },
};
