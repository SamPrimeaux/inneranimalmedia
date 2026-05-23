-- Supabase: chat memory for Agent Sam (Worker writes via Hyperdrive).
-- Embedding: OpenAI text-embedding-3-large @1536; mirrored to Vectorize inneranimalmedia-vectors (AGENTSAMVECTORIZE).
-- Apply: supabase/migrations/20260523120000_agent_memory_1536_agentsam_vectorize.sql

create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  agent_id text not null default 'agent-sam',
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}',
  embedding vector(1536),
  created_at timestamptz default now()
);

create index if not exists agent_memory_session_idx on public.agent_memory (session_id);
create index if not exists agent_memory_created_idx on public.agent_memory (created_at desc);
