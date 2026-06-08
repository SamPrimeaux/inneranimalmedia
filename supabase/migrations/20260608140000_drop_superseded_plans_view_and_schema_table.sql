-- Retire superseded plan embed view and legacy schema RAG table.
-- Plan embeddings live on agentsam.agentsam_plans (20260605140000).
-- Schema RAG SSOT is agentsam.agentsam_database_schema_oai3large_1536 (D1 registry pgv_database_schema_1536).

DROP VIEW IF EXISTS agentsam.agentsam_plans_embedded;

DROP TABLE IF EXISTS agentsam.agentsam_schema_oai3large_1536;
