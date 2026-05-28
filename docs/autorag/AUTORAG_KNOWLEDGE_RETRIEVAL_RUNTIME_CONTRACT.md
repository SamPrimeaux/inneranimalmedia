---
title: AutoRAG Knowledge Retrieval Runtime Contract
project: inneranimalmedia
owner: Sam Primeaux
truth_level: golden
source_type: architecture
archive_tier: golden
embedding_model: text-embedding-3-large
embedding_dims: 3072
source_ref: inneranimalmedia.autorag.runtime_contract.v1
assumption_policy: "No assumptions. Only verified, source-backed, owner-approved knowledge may enter retrieval."
review_after: 2026-09-01
---

# AutoRAG Knowledge Retrieval Runtime Contract

**Related:** [AgentSam Supabase RAG Lane Schema Reference](../supabase/AGENTSAM_RAG_LANE_SCHEMA_REFERENCE.md) · [R2 bucket structure](../AUTORAG_BUCKET_STRUCTURE.md)

## Purpose

This contract defines how Inner Animal Media stores, embeds, searches, and retrieves knowledge for Agent Sam, MCP tools, Cursor workflows, and platform automation.

The goal is not to store everything.

The goal is to store only useful, verified, durable context that improves agent behavior without creating stale or misleading retrieval results.

AutoRAG is a quality layer, not a backup system, not a code dump, not a database clone, and not a place for speculative AI-generated notes.

## Core rule

Retrieval may provide orientation, but it must not replace live verification when live sources exist.

For any task that depends on current truth, agents must prefer the live source of truth over embedded context.

Examples:

* Current database schema: inspect the live database or verified schema lane.
* Current route behavior: inspect the current source file.
* Current R2 file contents: read the R2 object.
* Current model config: query the config table or live API.
* Current workflow status: query the workflow tables or runtime logs.

Embedded knowledge may suggest where to look, but it must not be treated as final proof for dangerous or state-dependent actions.

## Canonical storage layers

### R2 bucket

Canonical bucket:

`inneranimalmedia-autorag`

Canonical public base URL:

`https://rag.inneranimalmedia.com`

The custom domain is the public source URL for retrievable files. Do not use the public development URL for production references. Do not use S3 API URLs as user-facing source URLs.

R2 files are the canonical document objects for knowledge content.

### Supabase vector lanes

Supabase stores embedded chunks and retrieval metadata.

The primary document lane is:

`agentsam.agentsam_documents_oai3large_1536`

This lane is for verified R2-backed documents, skills, recipes, workflows, plans, roadmap notes, docs, and other curated knowledge.

The memory lane is:

`agentsam.agentsam_memory_oai3large_1536`

This lane is for durable memory only. It is not a document store.

The schema lane is:

`agentsam.agentsam_database_schema_oai3large_1536`

This lane is for schema orientation and anti-hallucination. It is not a substitute for live database inspection.

The deep archive lane is:

`agentsam.agentsam_deep_archive_oai3large_3072`

This lane is for golden contracts, critical decision records, eval cases, and high-precision disambiguation notes only.

## R2 folder contract

The folder prefix determines meaning and retrieval scope.

### `knowledge/skills/`

Stores skill definitions and skill-facing operational knowledge.

This is a first-class `knowledge_search` corpus.

Content must be owner-approved or generated from verified source records.

Do not store speculative skill ideas here.

### `recipes/`

Stores repeatable procedures, cookbooks, and task recipes.

Recipes should explain how to perform a task safely and repeatably.

A recipe must include verification steps when it touches production, deploys, database writes, file deletion, auth, billing, or external integrations.

### `knowledge/`

Stores stable platform knowledge that does not belong to a narrower folder.

Do not use this folder for volatile roadmap notes, current bugs, or generated guesses.

### `workflows/`

Stores workflow definitions and workflow explanations.

Only store workflows that are actually implemented, owner-approved, or clearly marked as drafts.

A workflow document must not imply that a workflow exists in production unless verified.

### `roadmap/`

Stores roadmap and planning notes.

Roadmap content is volatile by default.

Roadmap documents must include `truth_level: volatile` or `truth_level: semi_stable` and a short `review_after` date.

Agents must not treat roadmap content as evidence that a feature exists.

### `plans/`

Stores project plans and execution plans.

Plans are not source of truth for current implementation.

Plans must include status and review metadata.

### `docs/`

Stores verified documentation.

Docs should be durable, concise, and source-backed.

### `context/`

Stores temporary or session-like context.

This folder is optional in default retrieval because context can become stale quickly.

### `courses/`

Stores course and learning content.

Course content may be searched separately from operational platform knowledge.

### `memory/`

Do not use R2 `memory/` as the primary memory system.

Durable memory belongs in the memory vector lane.

R2 memory files are only backup/export/reference artifacts unless explicitly promoted.

### Tenant/client/person-specific folders

Folders such as `brands/`, `clients/`, `workspaces/`, and `studentprofiles/` must not be included in default platform-wide retrieval.

They may only be searched when the user's task explicitly requests that scope.

The main Inner Animal Media project reference must remain owner/platform focused.

## Default `knowledge_search` scope

Default `knowledge_search` searches only curated R2-backed document lanes.

Default included prefixes:

* `knowledge/skills/`
* `recipes/`
* `knowledge/`
* `workflows/`
* `roadmap/`
* `plans/`
* `docs/`

Optional prefixes:

* `context/`
* `courses/`

Excluded by default:

* `memory/`
* `brands/`
* `clients/`
* `workspaces/`
* `studentprofiles/`
* raw migrations
* code dumps
* generated build output
* old snapshots
* backups

`knowledge_search` must support explicit lane selection.

Example:

```json
{
  "query": "safe deploy verification",
  "lanes": ["skills", "recipes", "workflows"],
  "limit": 8
}
```

## Embedding policy

Embeddings are paid for only when content is approved for retrieval.

Do not embed files just because they exist.

Do not run whole-bucket syncs by default.

Do not re-embed unchanged content.

Every embedded chunk must have a content hash.

If the hash has not changed, skip embedding.

Search requires one query embedding per user query. Search must not re-read and re-embed R2 files.

## Required metadata

Every ingested document or chunk must preserve:

* `source_path`
* `source_url`
* `source_type`
* `content_hash`
* `embedding_model`
* `embedding_dims`
* `embedded_at`
* `truth_level`
* `review_after`, when volatile or semi-stable
* `owner` or `maintainer`, when relevant

The canonical `source_url` must use:

`https://rag.inneranimalmedia.com/{source_path}`

## Truth levels

### `golden`

Only for owner-approved contracts, critical architecture rules, decision records, and canonical eval cases.

Golden content must be stable, verified, and expensive to get wrong.

### `stable`

For durable project knowledge that is expected to remain true for months.

### `semi_stable`

For implementation details that are useful but may change.

Must include a review date.

### `volatile`

For roadmap, sprint notes, active work, temporary plans, or current status.

Volatile content must not be used as proof that something exists in production.

### `historical`

For old migrations, old decisions, old notes, and audit material.

Historical content must not be used as current truth.

## What must not be embedded by default

Do not embed the following into default retrieval:

* entire codebases
* full source files without review
* old migrations
* full database schema dumps
* partial table lists pretending to be schema maps
* generated build output
* logs
* snapshots
* stale roadmap notes
* Claude/Cursor summaries that were not verified
* row counts
* route status guesses
* model default guesses
* client/friend/person context that is not needed for the task
* anything with unclear ownership or source

## Code retrieval policy

The platform needs semantic code search, but it must not embed thousands of lines of raw code by default.

Code retrieval should use compact, generated, source-backed code intelligence records instead of full-code chunk dumps.

Allowed code retrieval records:

* file purpose cards
* route-to-handler maps
* exported symbol summaries
* component boundary summaries
* API endpoint summaries
* tool/function signatures
* dependency/import summaries
* configuration key summaries
* known guardrails tied to exact files
* small source excerpts only when necessary

Each code intelligence record must include:

* `repo`
* `branch`
* `commit_sha`, when available
* `file_path`
* `symbol_name`, when applicable
* `source_kind`
* `generated_from`
* `last_verified`
* `content_hash`
* `requires_source_verification: true`

Agents may use code retrieval to find the right file or symbol.

Agents must inspect the actual source file before editing, deleting, deploying, or making claims about current implementation.

Raw code chunks may only be embedded when:

1. the file is small,
2. the content is stable,
3. the chunk is directly useful for retrieval,
4. the chunk is not generated output,
5. the chunk includes exact source metadata,
6. the agent still verifies source before acting.

## Database retrieval policy

Do not embed large database inventories as general knowledge.

Do not embed old migrations into default retrieval.

Migrations are historical/audit records, not current schema truth.

For current schema, use:

1. live database introspection,
2. verified schema lane,
3. current schema snapshot generated from live source,
4. source code that currently uses the table.

The schema lane may help agents discover likely tables, but it must not authorize writes, deletes, migrations, or production decisions.

Project docs must not include partial table inventories.

If a database fact matters, the agent must verify it live.

## Deep archive policy

The deep archive lane uses 3072-dimensional embeddings and is reserved for the highest-value knowledge.

Allowed deep archive content:

* runtime contracts
* AutoRAG quality contracts
* database authority contracts
* architectural decision records
* canonical eval cases
* hard retrieval disambiguation notes
* critical tool approval contracts
* stable workflow contracts

Do not put volatile docs, sprint notes, raw code, raw schema, old migrations, roadmap notes, or ordinary project docs in deep archive.

Deep archive should remain small.

Target size: 25–50 records unless explicitly expanded.

## Retrieval behavior

Search tools must return:

* title
* snippet
* score
* source_path
* source_url
* source_type
* truth_level
* review_after, when present

Agents must cite or expose the source URL when using retrieved knowledge to answer operational questions.

When retrieved content conflicts with live source, live source wins.

When retrieved content conflicts with another retrieved item, prefer:

1. golden contract,
2. stable verified doc,
3. live source-backed generated record,
4. semi-stable doc,
5. volatile doc,
6. historical doc.

If uncertainty remains, ask for verification or inspect the live source.

## Ingestion behavior

Before ingesting a file:

1. Read the full file.
2. Confirm it belongs in the selected folder/lane.
3. Confirm it has a clear source and purpose.
4. Remove speculation or label it as volatile.
5. Ensure metadata exists.
6. Compute content hash.
7. Embed only new or changed chunks.
8. Store the canonical `rag.inneranimalmedia.com` source URL.

If the content cannot be trusted, do not embed it.

Create a rejected-claims or rejected-files report instead.

## Agent behavior requirements

Agents must not:

* treat retrieved text as permission to deploy,
* treat retrieved text as permission to delete,
* treat retrieved text as permission to migrate,
* treat old migrations as current schema,
* treat roadmap as implementation,
* treat partial docs as complete truth,
* treat generated summaries as source of truth,
* mention irrelevant clients or people in platform reference docs,
* hardcode tenant IDs, workspace IDs, user IDs, or model keys from retrieval.

Agents must:

* verify live state before dangerous actions,
* prefer source files for implementation truth,
* prefer live DB introspection for schema truth,
* keep retrieval scope narrow,
* return sources,
* report uncertainty,
* exclude unverified claims.

## Smallest useful implementation slice

The first production slice is:

1. Use R2 bucket `inneranimalmedia-autorag` as canonical document storage.
2. Use `https://rag.inneranimalmedia.com` as the canonical public source URL.
3. Ingest only `knowledge/skills/`, `recipes/`, and a small verified `docs/` set first.
4. Store chunks in `agentsam_documents_oai3large_1536`.
5. Implement `knowledge_search` against Supabase via Hyperdrive.
6. Use one `text-embedding-3-large` 1536-dimensional query embedding per search.
7. Filter by allowed folder prefixes.
8. Return source URLs from `rag.inneranimalmedia.com`.
9. Do not use Cloudflare Vectorize or legacy 1024-dimensional search in this hot path unless explicitly re-enabled.
10. Do not ingest whole codebase or migrations.

## Final standard

If a document would make an agent more confident without making it more correct, it does not belong in retrieval.

If a document cannot be verified, it does not belong in retrieval.

If a document is useful but unstable, it must be scoped, labeled, and reviewed.

If live truth is available, retrieval must point the agent toward live truth rather than pretending to replace it.
