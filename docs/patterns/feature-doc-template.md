---
title: Pattern — Feature documentation template
doc_type: platform_pattern
topic: feature_doc_template
lane_key: docs_knowledge_search
pattern_key: feature_doc_template
vertical: platform
tags:
  - documentation
  - vectorization
  - rag
updated: 2026-06-19
---

# Pattern — Feature documentation template

Standard shape for one main product surface per markdown file. Optimized for H2 chunking into `agentsam_documents_oai3large_1536` + Vectorize.

## Frontmatter (required)

```yaml
doc_type: feature | platform_pattern | client_project_brief
feature_id: kebab-case-id
product: client_or_platform_key
title: Human-readable name
status: live | mixed | partial | stub | future
last_verified: YYYY-MM-DD
tags: [domain, capability]
surfaces:
  routes: [/dashboard/...]
  frontend: [relative/paths]
  backend: [src/api/...]
  d1_tables: [table_name]
```

## Section order

1. **Summary** — one paragraph, production readiness
2. **User goals** — staff tasks
3. **Routes and navigation**
4. **Data model (canonical)** — SSOT tables + "do not use" legacy
5. **API contract** — method/path table
6. **Frontend behavior**
7. **Backend behavior** — side effects (R2, KV, email, Stripe)
8. **Operational commands**
9. **Constraints and safety**
10. **Known gaps**
11. **Vectorization notes** — synonyms for retrieval

## Rules

- One feature per file; stable `##` headings for chunk boundaries.
- Put binding IDs and tenant strings in **client brief**, not pattern docs.
- Mark mock vs live explicitly (Reports, Overview anti-patterns).
- Never embed secrets, API keys, or full PII in docs destined for RAG.

## Vectorization notes

**Synonyms:** feature doc, platform documentation, RAG chunks, knowledge base article, handoff doc template.
