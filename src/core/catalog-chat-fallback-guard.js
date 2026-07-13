/**
 * Shared SQL guards so chat failover never picks STT / TTS / embed / image SKUs.
 * gpt-4o-mini-transcribe is speech-to-text only (OpenAI v1/audio/transcriptions) — not chat.
 */

/**
 * @param {{
 *   modelKeyExpr?: string,
 *   openaiModelIdExpr?: string|null,
 *   hasSupportsTools?: boolean,
 *   hasRoutingLane?: boolean,
 *   requireTools?: boolean,
 * }} [opts]
 * @returns {string} AND … clauses (leading whitespace ok)
 */
export function catalogChatFallbackSqlGuard(opts = {}) {
  const mk = opts.modelKeyExpr || 'model_key';
  const oid = opts.openaiModelIdExpr || null;
  const parts = [
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%bge%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%embed%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%mxbai%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%whisper%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%transcribe%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%diarize%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%tts%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%speech%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%imagen%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE '%image%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE 'workers_ai_audio%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE 'workers_ai_embed%'`,
    `AND LOWER(COALESCE(${mk},'')) NOT LIKE 'workers_ai_image%'`,
  ];
  if (oid) {
    parts.push(`AND LOWER(COALESCE(${oid},'')) NOT LIKE '%transcribe%'`);
    parts.push(`AND LOWER(COALESCE(${oid},'')) NOT LIKE '%whisper%'`);
    parts.push(`AND LOWER(COALESCE(${oid},'')) NOT LIKE '%tts%'`);
    parts.push(`AND LOWER(COALESCE(${oid},'')) NOT LIKE '%diarize%'`);
  }
  if (opts.hasRoutingLane) {
    parts.push(
      `AND LOWER(COALESCE(routing_lane,'')) NOT IN ('embedding','transcription','speech','tts','audio','image')`,
    );
  }
  if (opts.requireTools && opts.hasSupportsTools) {
    parts.push(`AND COALESCE(supports_tools, 0) = 1`);
  }
  return `\n     ${parts.join('\n     ')}`;
}

/**
 * Runtime check for a catalog row / model_key that must never be a chat completion target.
 * @param {string|null|undefined} modelKey
 * @param {{ openai_model_id?: string|null, routing_lane?: string|null, supports_tools?: number|null }|null} [row]
 */
export function isNonChatCatalogModel(modelKey, row = null) {
  const k = String(modelKey || '').trim().toLowerCase();
  const oid = String(row?.openai_model_id || '').trim().toLowerCase();
  const lane = String(row?.routing_lane || '').trim().toLowerCase();
  if (!k && !oid) return false;
  const hay = `${k} ${oid}`;
  if (
    /bge|embed|mxbai|whisper|transcribe|diarize|\btts\b|speech|imagen|workers_ai_audio|workers_ai_embed|workers_ai_image/.test(
      hay,
    )
  ) {
    return true;
  }
  if (k.includes('image') || oid.includes('image')) return true;
  if (['embedding', 'transcription', 'speech', 'tts', 'audio', 'image'].includes(lane)) {
    return true;
  }
  return false;
}
