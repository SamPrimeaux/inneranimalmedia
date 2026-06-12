# Team milestones (AutoRAG source)

Curated **milestone briefs** for IAM team progress — MovieMode, client smokes, deploy receipts — **not** the full codebase.

## When to add a file here

- Shipped a feature lane (MovieMode, donations, dashboard surface) and Agent Sam should answer “what did we ship?” without scanning 288 code files
- Claude/Cursor session produced truth that lives in chat but **not** yet in git docs
- You explicitly **do not** want `npm run run:reindex_codebase_dashboard_agent`

## When **not** to use this folder

- Handler implementation questions → code lane (`run:reindex_codebase_dashboard_agent` scoped paths only)
- Client dossiers → `docs/clients/{project}/project-brief.md` + `run:ingest_client_project_doc`
- D1 schema → `ingest_schema_rag.py`

## File format

1. Copy `TEMPLATE.md` or an existing milestone
2. YAML frontmatter: `title`, `topic`, `lane_key`, `doc_type: team_milestone`, `milestone_date`
3. H2 sections (chunk boundaries) — keep each section &lt; ~600 tokens
4. Add path to `manifest.json`
5. Ingest:

```bash
npm run run:ingest_team_milestones:dry-run
npm run run:ingest_team_milestones
```

## Lane routing

| Content | `lane_key` in frontmatter | Ingest script `source_type` |
|---------|---------------------------|-----------------------------|
| Internal team / platform | `docs_knowledge_search` | `knowledge` |
| Client project receipt | `client_project_semantic_search` | `knowledge` (metadata carries client key) |

Vectors land in `AGENTSAM_VECTORIZE_DOCUMENTS` + `agentsam.agentsam_documents_oai3large_1536`. Receipt: D1 `vectorize_sync_log`.

See `docs/autorag/TEAM_MILESTONE_INGEST_PIPELINE.md` for the full playbook.
