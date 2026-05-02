-- Optional: create `public.documents` for scripts/ingest-docs.js if it does not exist.
-- Embedding dimension must match Workers AI @cf/baai/bge-large-en-v1.5 (1024).
-- Run in Supabase SQL editor with a role that can create tables.

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text not null,
  content text not null,
  embedding vector(1024) not null,
  project_id text not null,
  created_at timestamptz default now()
);

create index if not exists documents_source_project_idx
  on public.documents (source, project_id);

create index if not exists documents_embedding_ivfflat
  on public.documents using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);
