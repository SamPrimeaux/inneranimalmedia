-- 843: gpt-4o-mini-transcribe (and sibling STT rows) are speech-to-text only.
-- Never chat picker / never Workers AI → OpenAI chat failover.
-- OpenAI: v1/audio/transcriptions only — not v1/chat/completions.
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote -c wrangler.production.toml --file=./migrations/843_scope_transcribe_never_chat_fallback.sql

UPDATE agentsam_model_catalog
SET routing_lane = 'transcription',
    supports_tools = 0,
    cost_notes = CASE
      WHEN cost_notes IS NULL OR TRIM(cost_notes) = '' THEN
        'role=speech_to_text_only;endpoint=v1/audio/transcriptions;never_chat_fallback'
      WHEN INSTR(cost_notes, 'never_chat_fallback') > 0 THEN cost_notes
      ELSE cost_notes || ';role=speech_to_text_only;endpoint=v1/audio/transcriptions;never_chat_fallback'
    END,
    updated_at = unixepoch()
WHERE model_key LIKE '%transcribe%'
   OR COALESCE(openai_model_id, '') LIKE '%transcribe%'
   OR model_key LIKE '%whisper%'
   OR COALESCE(openai_model_id, '') LIKE '%whisper%';

-- Keep STT rows out of Agent Sam model picker (catalog may stay active for STT callers).
UPDATE agentsam_ai
SET show_in_picker = 0,
    picker_eligible = 0,
    status = CASE WHEN status = 'active' THEN 'inactive' ELSE status END,
    updated_at = unixepoch()
WHERE model_key LIKE '%transcribe%'
   OR model_key LIKE '%whisper%'
   OR LOWER(COALESCE(name, '')) LIKE '%transcribe%';

-- MiniMax M3: keep CF docs model id (minimax/m3), note enrollment/billing if WAI 2021.
UPDATE agentsam_model_catalog
SET workers_ai_model_id = 'minimax/m3',
    api_platform = 'workers_ai',
    is_active = 1,
    is_degraded = 0,
    degraded_reason = NULL,
    cost_notes = CASE
      WHEN cost_notes IS NULL OR TRIM(cost_notes) = '' THEN
        'role=workers_ai_chat;cf_model=minimax/m3;requires_workers_ai_enrollment'
      WHEN INSTR(cost_notes, 'cf_model=minimax/m3') > 0 THEN cost_notes
      ELSE cost_notes || ';cf_model=minimax/m3;requires_workers_ai_enrollment'
    END,
    updated_at = unixepoch()
WHERE model_key = 'wai-minimax-m3';
