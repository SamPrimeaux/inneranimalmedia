-- Migration 659: Drop orphaned drift pipeline + fix poisoned Welford latency rows
-- The real Thompson system lives in agentsam_routing_arms (success_alpha/beta + Welford)
-- and agentsam_model_routing_memory. agentsam_model_drift_signals was a dead parallel
-- pipeline sourced from agentsam_usage_events (2 rows) — never wired to actual routing.

DROP TABLE IF EXISTS agentsam_model_drift_signals;

-- Fix poisoned avg_latency_ms rows in agentsam_model_routing_memory.
-- Values > 10,000,000ms (2.7 hours) are Welford accumulator overflows from
-- a bad initial seed. Reset to NULL so next real run seeds correctly.
UPDATE agentsam_model_routing_memory
SET avg_latency_ms = NULL,
    updated_at = datetime('now')
WHERE avg_latency_ms > 10000000;
