-- Supabase: chat memory for Agent Sam (Worker writes via Hyperdrive after each /api/agent/chat).
-- Embedding dimension matches Workers AI @cf/baai/bge-large-en-v1.5 (1024).

create table if not exists public.agent_memory (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  agent_id text not null default 'agent-sam',
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  metadata jsonb not null default '{}',
  embedding vector(1024),
  created_at timestamptz default now()
);

create index if not exists agent_memory_session_idx on public.agent_memory (session_id);
create index if not exists agent_memory_created_idx on public.agent_memory (created_at desc);
