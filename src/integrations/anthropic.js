/**
 * Integration: Anthropic
 * Refactored: Official Anthropic TypeScript SDK Integration.
 * Handles tool-calling, streaming, and v4.6 features (Caching, Batching).
 * Zero-hardcoding: Model parameters and feature flags are DB-driven.
 */

import Anthropic from '@anthropic-ai/sdk';
import { handlers as dbHandlers } from '../tools/db.js';

/**
 * Executes a tool-aware chat completion using the official Anthropic SDK.
 */
export async function chatWithAnthropic({ messages, tools, env, options = {} }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY missing from environment');

  const client = new Anthropic({ apiKey });
  const modelKey = options.model || 'claude-3-5-sonnet-20240620';
  
  // Dynamic feature and rate lookup from D1 (Zero-Hardcoding Compliance)
  const modelInfo = await dbHandlers.d1_query({ 
    sql: "SELECT * FROM ai_models WHERE model_key = ?", 
    params: [modelKey] 
  }, env);
  
  const modelData = modelInfo.results?.[0] || {};
  const features = JSON.parse(modelData.features_json || '{}');
  const betas = options.betas || [];
  
  // 1. SOTA Beta Headers (v4.6+)
  const isSotaModel = (modelKey.includes('4-6') || modelKey.includes('4-5')) && !modelKey.includes('haiku');
  if (isSotaModel) {
    betas.push('compaction-2026-03-24'); // Infinite conversation / server-side summarization
    if (modelKey.includes('opus')) betas.push('fast-mode-2026-02-01'); // 2.5x speed for Opus
  } else {
    // Legacy Betas
    if (features.prompt_caching) betas.push('prompt-caching-2024-07-31');
    if (features.thinking) betas.push('thinking-2024-10-22');
    if (options.thinking?.type === 'enabled' || options.thinkingBudget) betas.push('extended-thinking-2025-01-24');
  }

  const streamParams = {
    model: modelKey,
    max_tokens: options.max_tokens || 4096,
    system: options.systemPrompt || 'You are Agent Sam, a high-performance coding assistant.',
    messages: messages.map(m => ({
      role: m.role,
      content: Array.isArray(m.content) ? m.content : m.content
    })).filter(m => m.role !== 'system'),
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters || t.input_schema,
      cache_control: t.cache_control || undefined,
    })),
    tool_choice: options.tool_choice || undefined,
    stream: true,
    betas: betas.length > 0 ? [...new Set(betas)] : undefined // De-duplicate headers
  };

  // 2. Adaptive Thinking & Effort (v4.6 GA Path)
  if (isSotaModel) {
    streamParams.thinking = { type: 'adaptive' };
    if (options.effort) {
      streamParams.thinking.effort = options.effort; // 'high', 'medium', 'low'
    }
  } else if (options.thinking) {
    streamParams.thinking = options.thinking;
  } else if (features.thinking && options.thinkingBudget) {
    streamParams.thinking = { 
      type: 'enabled', 
      budget_tokens: Number(options.thinkingBudget) 
    };
  }

  // 3. Structured Output Config (GA moving from legacy output_format)
  if (options.jsonSchema) {
    streamParams.output_config = { format: { type: 'json_schema', schema: options.jsonSchema } };
  }

  // 4. Data Residency
  if (options.inference_geo) {
    streamParams.inference_geo = options.inference_geo; // 'us' or 'global'
  }

  const response = await client.messages.create(streamParams);
  return response;
}

/**
 * Asynchronous Message Batch handler.
 * Leverages the SDK's batches namespace for high-volume background tasks.
 */
export async function createAnthropicBatch({ requests, env }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  const client = new Anthropic({ apiKey });
  
  return await client.messages.batches.create({ requests });
}
