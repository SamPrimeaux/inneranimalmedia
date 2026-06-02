/**
 * MCP_TOKENS (env.KV) is for small JSON config — never screenshots or binary blobs.
 * Screenshots belong on R2: reports/quality-report/…, screenshots/agent/, screenshots/browser/, etc.
 */

/** @type {readonly string[]} */
export const KV_BLOCKED_KEY_PREFIXES = ['screenshots/'];

/**
 * @param {string} key
 * @returns {boolean}
 */
export function isKvScreenshotOrBinaryKey(key) {
  const k = String(key || '').trim();
  if (!k) return false;
  for (const prefix of KV_BLOCKED_KEY_PREFIXES) {
    if (k.startsWith(prefix) || k.includes(`/${prefix}`)) return true;
  }
  return false;
}

/**
 * @param {unknown} value
 * @returns {boolean}
 */
function looksLikeBinaryKvValue(value) {
  if (value instanceof ArrayBuffer) return true;
  if (value instanceof Uint8Array) return true;
  if (value instanceof Blob) return true;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return true;
  return false;
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function assertKvPutAllowed(key, value) {
  if (isKvScreenshotOrBinaryKey(key)) {
    throw new Error(
      `KV (MCP_TOKENS) must not store screenshots. Key "${key}" — use R2 (DASHBOARD, DOCS_BUCKET, or ASSETS).`,
    );
  }
  if (looksLikeBinaryKvValue(value)) {
    throw new Error(
      `KV (MCP_TOKENS) must not store binary data. Key "${key}" — use R2 for images and files.`,
    );
  }
}

/**
 * Wrap env.KV.put/delete guard — does not affect SESSION_CACHE.
 * @param {any} env
 * @returns {any}
 */
export function wrapEnvKvBinding(env) {
  if (!env?.KV?.put) return env;
  const raw = env.KV;
  if (raw.__iamKvGuardWrapped) return env;

  const guarded = {
    ...raw,
    __iamKvGuardWrapped: true,
    async put(key, value, options) {
      assertKvPutAllowed(key, value);
      return raw.put(key, value, options);
    },
  };

  return { ...env, KV: guarded };
}
