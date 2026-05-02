import { jsonResponse } from '../core/responses.js';
import { getAuthUser } from '../core/auth.js';
import { runBuiltinTool } from '../tools/ai-dispatch.js';

/**
 * Google Gemini Service Integration (Modular Port).
 * Handles Gemini 1.5 Pro/Flash streaming and native function-calling.
 */

/**
 * Normalizes tool definitions for the Gemini function-calling schema.
 */
export function normalizeGeminiTools(tools) {
    if (!Array.isArray(tools) || tools.length === 0) return undefined;
    
    return [{
        function_declarations: tools.map(t => {
            let parameters = { type: 'OBJECT', properties: {} };
            try {
                const raw = typeof t.input_schema === 'string' ? JSON.parse(t.input_schema) : (t.input_schema || {});
                // Gemini expects capitalized types
                if (raw && raw.type) {
                    parameters = { ...raw, type: String(raw.type).toUpperCase() };
                }
            } catch (_) {}

            return {
                name: t.tool_name || t.name,
                description: (t.description || t.tool_name || '').slice(0, 500),
                parameters
            };
        })
    }];
}

/**
 * The Core Gemini Engine (Public API).
 */
export async function chatWithToolsGemini(env, request, params) {
    const { 
        modelKey, 
        messages, 
        tools: toolDefinitions,
        systemPrompt 
    } = params;

    const authUser = await getAuthUser(request, env);
    if (!authUser) return jsonResponse({ error: 'Unauthorized' }, 401);

    const apiKey = (env.GOOGLE_API_KEY || '').trim();
    if (!apiKey) return jsonResponse({ error: 'Google API key not configured' }, 503);

    const geminiTools = normalizeGeminiTools(toolDefinitions);
    const resolvedModel = modelKey || 'gemini-1.5-pro-latest';

    // Initial SSE Setup
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
        try {
            const body = {
                contents: messages.map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                })),
                system_instruction: {
                    parts: [{ text: systemPrompt }]
                },
                tools: geminiTools,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 8192
                }
            };

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:streamGenerateContent?alt=sse&key=${apiKey}`;

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const err = await response.text();
                await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: err })}\n\n`));
                return;
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value);
                await writer.write(encoder.encode(chunk));
            }

        } catch (e) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: 'error', message: e.message })}\n\n`));
        } finally {
            await writer.close();
        }
    })();

    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}
