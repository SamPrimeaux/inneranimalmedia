---
title: Pattern — Client D1 legacy table hygiene
doc_type: platform_pattern
topic: d1_legacy_hygiene
lane_key: docs_knowledge_search
pattern_key: client_d1_legacy_table_hygiene
tags:
  - d1
  - migrations
  - handoff
  - schema
updated: 2026-06-19
---

# Pattern — Client D1 legacy table hygiene

Prevent schema bloat on client Workers by **dropping** unused tables and **deferring** drops until code stops referencing them.

## Three buckets

| Bucket | Action | Criteria |
|---|---|---|
| **Canonical** | Document + use in all new code | SSOT for domain |
| **Drop now** | `DROP TABLE IF EXISTS` migration | Zero references in `src/` Worker code |
| **Defer** | Document in handoff; drop after small code change | Still SELECT/INSERT in handlers |

## Drop-now checklist

1. `rg` / search `src/` for table name — no hits
2. Confirm not referenced by cron or webhook paths
3. Add idempotent migration under `db/migrations/`
4. Apply remote: `wrangler d1 execute ... --file=... --remote`
5. Verify: `sqlite_master` query returns zero rows

## Defer examples (common)

| Pattern | Fix first |
|---|---|
| Legacy stub table parallel to canonical | Point API to canonical table |
| Old social drafts table | Migrate handlers to `*_v2` table |
| Legacy contact table | Point inserts to `contact_requests_v2` |
| Duplicate nav table | Nav SSOT in `brand_settings` JSON column |

## Repo hygiene

- Do not re-seed dropped tables from old `db/seed_*.sql` files.
- Keep migrations as audit trail; archive demo-only schema files.

## Handoff doc

Each client repo should maintain a short HANDOFF.md: canonical tables, dropped list, defer list with owner file paths. IAM stores **pattern** here; client repo stores **table names**.

## Vectorization notes

**Synonyms:** drop legacy tables, D1 cleanup, schema bloat, canonical vs legacy, migration hygiene, demo table removal, handoff database.
