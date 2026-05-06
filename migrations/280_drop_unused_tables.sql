-- Tables with no INSERT/write paths in src/; agent_telemetry replaced by ai_provider_usage rollups in telemetry paths.
DROP TABLE IF EXISTS otlp_traces;
DROP TABLE IF EXISTS agentsam_shadow_runs;
DROP TABLE IF EXISTS agentsam_judge_runs;
DROP TABLE IF EXISTS agent_telemetry;
