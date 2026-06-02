/**
 * Structural JSON Schema comparison for MCP tool contract drift tests.
 * Ignores descriptions; compares type, required, additionalProperties, property keys/types/enums.
 */

/** @param {unknown} raw */
export function parseSchemaJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} schema
 * @returns {Record<string, unknown>|null}
 */
export function normalizeInputSchemaContract(schema) {
  const s = parseSchemaJson(schema);
  if (!s || typeof s !== 'object' || s.type !== 'object') return null;

  /** @type {Record<string, { type?: string, enum?: string[] }>} */
  const properties = {};
  const src = s.properties && typeof s.properties === 'object' ? s.properties : {};
  for (const [key, val] of Object.entries(src)) {
    if (!val || typeof val !== 'object') {
      properties[key] = {};
      continue;
    }
    /** @type {{ type?: string, enum?: string[] }} */
    const entry = {};
    if (val.type != null) entry.type = String(val.type);
    if (Array.isArray(val.enum)) entry.enum = [...val.enum].map(String).sort();
    properties[key] = entry;
  }

  return {
    type: 'object',
    required: [...(Array.isArray(s.required) ? s.required : [])].map(String).sort(),
    additionalProperties: s.additionalProperties === false ? false : Boolean(s.additionalProperties),
    properties,
  };
}

/**
 * @param {unknown} schema
 * @returns {Record<string, unknown>|null}
 */
export function normalizeOutputSchemaContract(schema) {
  const s = parseSchemaJson(schema);
  if (!s || typeof s !== 'object' || s.type !== 'object') return null;

  /** @type {Record<string, { type?: string, enum?: string[] }>} */
  const properties = {};
  const src = s.properties && typeof s.properties === 'object' ? s.properties : {};
  for (const [key, val] of Object.entries(src)) {
    if (!val || typeof val !== 'object') {
      properties[key] = {};
      continue;
    }
    /** @type {{ type?: string, enum?: string[] }} */
    const entry = {};
    if (val.type != null) entry.type = String(val.type);
    if (Array.isArray(val.enum)) entry.enum = [...val.enum].map(String).sort();
    properties[key] = entry;
  }

  return {
    type: 'object',
    additionalProperties: s.additionalProperties === false ? false : Boolean(s.additionalProperties),
    properties,
  };
}

/** @param {unknown} a @param {unknown} b */
function stableJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * @param {string} label
 * @param {unknown} actual
 * @param {unknown} expected
 * @returns {string|null}
 */
export function diffInputSchemaContract(label, actual, expected) {
  const a = normalizeInputSchemaContract(actual);
  const e = normalizeInputSchemaContract(expected);
  if (!a) return `${label}: input_schema is missing or not a JSON object schema`;
  if (!e) return `${label}: expected canonical input_schema is invalid`;

  if (!stableJson(a, e)) {
    return `${label}: input_schema drift\n  expected: ${JSON.stringify(e)}\n  actual:   ${JSON.stringify(a)}`;
  }
  return null;
}

/**
 * D1 output_schema may omit optional canonical fields; every D1 property must match canonical.
 * @param {string} label
 * @param {unknown} actual
 * @param {unknown} canonical
 * @returns {string|null}
 */
export function diffOutputSchemaCompatible(label, actual, canonical) {
  const a = normalizeOutputSchemaContract(actual);
  const c = normalizeOutputSchemaContract(canonical);
  if (!a) return `${label}: output_schema is missing or not a JSON object schema`;
  if (!c) return `${label}: canonical output_schema is invalid`;

  if (a.additionalProperties !== c.additionalProperties) {
    return `${label}: output_schema additionalProperties drift (expected ${c.additionalProperties}, got ${a.additionalProperties})`;
  }

  for (const [key, spec] of Object.entries(a.properties)) {
    const canon = c.properties[key];
    if (!canon) {
      return `${label}: output_schema has unexpected property "${key}"`;
    }
    if (spec.type && canon.type && spec.type !== canon.type) {
      return `${label}: output_schema property "${key}" type drift (expected ${canon.type}, got ${spec.type})`;
    }
    if (spec.enum && canon.enum && !stableJson(spec.enum, canon.enum)) {
      return `${label}: output_schema property "${key}" enum drift (expected ${JSON.stringify(canon.enum)}, got ${JSON.stringify(spec.enum)})`;
    }
  }

  const requiredKeys = ['cwd', 'cwd_source', 'exit_code', 'stdout', 'stderr', 'output', 'command'];
  for (const key of requiredKeys) {
    if (!a.properties[key]) {
      return `${label}: output_schema missing required property "${key}"`;
    }
  }

  return null;
}

/**
 * @param {string} label
 * @param {unknown} inputSchema
 * @param {string[]} forbidden
 * @returns {string|null}
 */
export function diffForbiddenInputProperties(label, inputSchema, forbidden) {
  const parsed = parseSchemaJson(inputSchema);
  const props =
    parsed && typeof parsed === 'object' && parsed.properties && typeof parsed.properties === 'object'
      ? Object.keys(parsed.properties)
      : [];
  const hits = forbidden.filter((f) => props.includes(f));
  if (!hits.length) return null;
  return `${label}: input_schema must not include ${hits.join(', ')}`;
}
