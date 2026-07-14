-- Refresh ctx_inneranimalmedia blockers: drop recycled myths (SSE, Moon Glass worker.js, scores undef).
UPDATE agentsam_project_context
SET
  current_blockers = 'Runtime CODE reindex in flight (cidx_src_reindex_v1) — validate src/ citations when done (tkt_closed_loop_code_rag_2026_07_14). Schema RAG dedupe+reingest still open. Telemetry blind spots: exec logs/OTLP/escalations unread by routing (tkt_closed_loop_feedback_blindspots_2026_07_14). Catalog-driven chat compact+summarize (tkt_closed_loop_auto_compact_memory_2026_07_14). Cleared 2026-07-14: DesignStudio subscribeRunEvents wired; Meshy proxy+GLTFLoader present; master_daily_retention defines scores (routing arm skip unimplemented); Moon Glass is applyCmsTheme CSS vars not worker.js bleed.',
  updated_at = unixepoch()
WHERE id = 'ctx_inneranimalmedia';
