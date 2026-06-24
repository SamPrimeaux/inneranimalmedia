/** Strip paste artifacts from API keys / secrets. */
export function sanitizeSecret(raw) {
  return String(raw ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/[\s\r\n\t]/g, '')
    .replace(/^["']+|["']+$/g, '');
}

/** Reject clipboard accidents (shell commands, paths). */
export function assertPlausibleApiKey(value, envVar) {
  const v = sanitizeSecret(value);
  if (!v) throw new Error('empty key');
  if (/^\.?\//.test(v) || v.includes('./scripts') || v.includes('npm run')) {
    throw new Error(
      'That looks like a shell command or path, not an API key. Copy only the key from the provider console.',
    );
  }
  if (envVar === 'ANTHROPIC_API_KEY' && !v.startsWith('sk-ant-')) {
    console.warn(`WARN: expected sk-ant-… prefix, got ${v.slice(0, 16)}…`);
  }
  if (envVar === 'OPENAI_API_KEY' && !v.startsWith('sk-')) {
    console.warn('WARN: expected sk-… prefix for OpenAI');
  }
  return v;
}
