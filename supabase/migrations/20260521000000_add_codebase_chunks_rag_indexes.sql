-- supabase/migrations/20260521000000_add_codebase_chunks_rag_indexes.sql
-- NOTE:
-- These indexes were applied manually via Supabase SQL because
-- CREATE INDEX CONCURRENTLY cannot run inside Supabase MCP apply_migration's
-- transaction wrapper.

create index concurrently if not exists codebase_chunks_embedding_hnsw_idx
on public.codebase_chunks
using hnsw (embedding vector_cosine_ops)
with (m = 16, ef_construction = 64);

create index concurrently if not exists idx_codebase_chunks_scope_snapshot
on public.codebase_chunks (tenant_id, workspace_id, snapshot_id, file_path);

create index concurrently if not exists idx_codebase_chunks_scope_created
on public.codebase_chunks (tenant_id, workspace_id, created_at desc);
