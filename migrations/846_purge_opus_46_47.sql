-- 846: REMOVE Opus 4.6 / 4.7 from control plane (provider cut-off — not deprecate).
-- Prefer claude-opus-4-8. Do not leave inactive catalog rows that can still be pinned.
-- Historical spend/usage rows are left alone.
--
-- Apply:
--   ./scripts/with-cloudflare-env.sh npx wrangler d1 execute inneranimalmedia-business --remote \
--     -c wrangler.production.toml --file=./migrations/846_purge_opus_46_47.sql

-- Boss / chat / debug / plan arms for 4.8 already exist — delete stale 4.6/4.7 arms.
DELETE FROM agentsam_routing_arms
WHERE model_key IN (
  'claude-opus-4-6',
  'claude-opus-4-7',
  'anthropic_opus_4_6',
  'anthropic_opus_4_7',
  'wai-claude-opus-4-6',
  'wai-claude-opus-4-7'
);

DELETE FROM agentsam_model_routing_memory
WHERE model_key IN (
  'claude-opus-4-6',
  'claude-opus-4-7',
  'anthropic_opus_4_6',
  'anthropic_opus_4_7',
  'wai-claude-opus-4-6',
  'wai-claude-opus-4-7'
);

DELETE FROM agentsam_model_pricing
WHERE model_key IN (
  'claude-opus-4-6',
  'claude-opus-4-7',
  'anthropic_opus_4_6',
  'anthropic_opus_4_7',
  'wai-claude-opus-4-6',
  'wai-claude-opus-4-7'
);

DELETE FROM agentsam_model_health
WHERE model_key IN (
  'claude-opus-4-6',
  'claude-opus-4-7',
  'anthropic_opus_4_6',
  'anthropic_opus_4_7',
  'wai-claude-opus-4-6',
  'wai-claude-opus-4-7'
);

DELETE FROM agentsam_model_eval_observations
WHERE model_key IN (
  'claude-opus-4-6',
  'claude-opus-4-7',
  'anthropic_opus_4_6',
  'anthropic_opus_4_7',
  'wai-claude-opus-4-6',
  'wai-claude-opus-4-7'
);

DELETE FROM agentsam_ai
WHERE model_key IN (
  'claude-opus-4-6',
  'claude-opus-4-7',
  'anthropic_opus_4_6',
  'anthropic_opus_4_7',
  'wai-claude-opus-4-6',
  'wai-claude-opus-4-7'
);

DELETE FROM agentsam_model_catalog
WHERE model_key IN (
  'claude-opus-4-6',
  'claude-opus-4-7',
  'anthropic_opus_4_6',
  'anthropic_opus_4_7',
  'wai-claude-opus-4-6',
  'wai-claude-opus-4-7'
);
