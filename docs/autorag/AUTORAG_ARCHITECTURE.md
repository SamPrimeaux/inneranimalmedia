TASK: Merge, repair, and R2-publish the AutoRAG architecture contract docs.

## Scope — READ ONLY THESE TWO FILES. IGNORE ALL OTHER DOCS.
  docs/autorag/AUTORAG_ARCHITECTURE.md
  docs/autorag/AUTORAG_ARCHITECTURE_ADDENDUM_MULTITENANCY.md

Do not read, reference, or reconcile any other file in docs/
unless it is explicitly listed above. There are outdated AutoRAG
docs in this repo — they are not authoritative. These two files
are the only source of truth for this task.

## Phase 1 — Merge + repair

Read both files in full. The addendum supersedes the
"Workspace Identity Constants" section in the base doc.

Produce a single merged file at:
  docs/autorag/AUTORAG_ARCHITECTURE.md

Rules for the merge:
- Replace the "Workspace Identity Constants" section entirely
  with the corrected content from the addendum
- Add a visible warning block at the top of the merged doc:

  > ⚠️ MULTI-TENANT RUNTIME CONTRACT
  > workspace_id and tenant_id are NEVER hardcoded. Always
  > derived from authenticated context. See §Workspace Identity.

- Add a "Document History" footer:
  | Version | Date | Change |
  |---|---|---|
  | 1.0 | 2026-05-25 | Initial architecture document |
  | 1.1 | 2026-05-25 | Addendum: multi-tenancy correction applied |

- Remove all references to 'ws_inneranimalmedia' or
  'tenant_sam_primeaux' from RUNTIME CONTRACT sections.
  They may only appear in a clearly labeled
  "Sam's local .env reference — never in code" callout.

- Verify every RUNTIME CONTRACT block is consistent with the
  multi-tenant derive-don't-receive principle. Fix any block
  that instructs hardcoding workspace identity.

- Delete docs/autorag/AUTORAG_ARCHITECTURE_ADDENDUM_MULTITENANCY.md
  after merge — absorbed into the base doc.

## Phase 2 — R2 overwrite (knowledge/ lane)

  wrangler r2 object put inneranimalmedia-autorag/knowledge/AUTORAG_ARCHITECTURE.md \
    --file docs/autorag/AUTORAG_ARCHITECTURE.md \
    --content-type "text/markdown"

Confirm exit 0 and object key in output before continuing.

## Phase 2.5 — R2 store dense docs (human admin inspection copies)

Upload the merged doc as a full human-readable copy:

  wrangler r2 object put inneranimalmedia-autorag/docs/AUTORAG_ARCHITECTURE.md \
    --file docs/autorag/AUTORAG_ARCHITECTURE.md \
    --content-type "text/markdown"

Then scan docs/auth/ for field guides and upload any found:

  wrangler r2 object put inneranimalmedia-autorag/docs/<filename> \
    --file docs/auth/<filename> \
    --content-type "text/markdown"

After all uploads confirm, run:
  wrangler r2 object list inneranimalmedia-autorag/docs/
  wrangler r2 object list inneranimalmedia-autorag/knowledge/

Print both lists.

NOTE: docs/ in R2 is human admin reads only. The ingest pipeline
does NOT embed the docs/ folder. Never add docs/ to folder scan.

## Phase 3 — Summary output

SECTION A — WHAT WAS DONE
  - Every change made to the merged doc (one bullet each)
  - Every file uploaded to R2 with object key and byte size
  - Any RUNTIME CONTRACT violations found and fixed

SECTION B — ADMIN TO-DO (pipeline pre-flight for Sam)
  - Required env vars (keys only, Sam fills values)
  - Exact script command to run
  - What success looks like vs failure
  - How to verify rows landed in Supabase after ingest
  - How to verify CF Vectorize received entries
  - What to check if zero rows appear after ingest

## Constraints
- .bak backup of AUTORAG_ARCHITECTURE.md before any write
- Repo root guard: confirm pwd contains package.json first
- No deploys. No migrations. No worker source changes.
- If any wrangler command fails, stop and print error — no silent retry
- docs/ in R2 is never an ingest target
