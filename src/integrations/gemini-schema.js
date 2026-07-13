/**
 * Gemini function_declarations JSON Schema sanitizer (pure — no auth/network).
 * Vendor MCP schemas often include OpenAI/Anthropic-only keys and x-* extensions
 * (e.g. Gmail MCP `x-google-enum-descriptions`) that Gemini 400s on.
 */

/** JSON Schema keys Gemini function_declarations reject (OpenAI/Anthropic allow them). */
const GEMINI_SCHEMA_STRIP_KEYS = new Set([
  'additionalProperties',
  '$schema',
  '$id',
  '$ref',
  '$defs',
  'definitions',
  'patternProperties',
  'default',
  'examples',
  'const',
  'deprecated',
  'readOnly',
  'writeOnly',
  'format',
  'title',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'contentMediaType',
  'contentEncoding',
]);

/**
 * Recursively strip unsupported JSON Schema keys and uppercase Gemini type literals.
 * Also drops vendor extensions (`x-*`, including `x-google-enum-descriptions` from Gmail MCP).
 * @param {unknown} schema
 */
export function sanitizeGeminiParameterSchema(schema) {
  if (schema == null) return schema;
  if (Array.isArray(schema)) {
    return schema.map((entry) => sanitizeGeminiParameterSchema(entry));
  }
  if (typeof schema !== 'object') return schema;

  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (GEMINI_SCHEMA_STRIP_KEYS.has(key)) continue;
    if (key.startsWith('x-') || key.startsWith('X-')) continue;
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      const props = {};
      for (const [propKey, propVal] of Object.entries(value)) {
        props[propKey] = sanitizeGeminiParameterSchema(propVal);
      }
      out.properties = props;
      continue;
    }
    if (key === 'items') {
      out.items = sanitizeGeminiParameterSchema(value);
      continue;
    }
    if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      out[key] = Array.isArray(value)
        ? value.map((entry) => sanitizeGeminiParameterSchema(entry))
        : value;
      continue;
    }
    out[key] =
      value && typeof value === 'object' && !Array.isArray(value)
        ? sanitizeGeminiParameterSchema(value)
        : value;
  }
  if (out.type) out.type = String(out.type).toUpperCase();
  // Gemini requires array schemas to declare items (OpenAI tolerates bare "type":"array").
  if (out.type === 'ARRAY') {
    if (!out.items || typeof out.items !== 'object' || Array.isArray(out.items)) {
      out.items = { type: 'STRING' };
    } else if (!out.items.type) {
      out.items = { ...out.items, type: 'STRING' };
    } else {
      out.items.type = String(out.items.type).toUpperCase();
    }
  }
  return out;
}

/**
 * @param {unknown[]} tools
 */
export function normalizeGeminiTools(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return [
    {
      function_declarations: tools
        .map((t) => {
          let parameters = { type: 'OBJECT', properties: {} };
          try {
            const raw =
              typeof t.input_schema === 'string'
                ? JSON.parse(t.input_schema)
                : t.input_schema || t.function?.parameters || {};
            if (raw && typeof raw === 'object') {
              parameters = sanitizeGeminiParameterSchema(raw);
              if (!parameters.type) parameters.type = 'OBJECT';
            }
          } catch (_) {
            /* keep empty object params */
          }
          return {
            name: t.tool_name || t.name || t.function?.name,
            description: (
              t.description ||
              t.tool_name ||
              t.function?.description ||
              t.name ||
              ''
            ).slice(0, 500),
            parameters,
          };
        })
        .filter((fd) => fd.name),
    },
  ];
}
