-- Retire D1-side embedding storage on knowledge chunks (semantic search uses Supabase pgvector).
UPDATE ai_knowledge_chunks SET embedding_vector = NULL WHERE embedding_vector IS NOT NULL;
