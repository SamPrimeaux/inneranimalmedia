# Agent Sam — `.agentsamignore` and `.agentsamrules`

Small, explicit counterparts to Cursor’s `.cursorignore` and `.cursorrules`, scoped to **Inner Animal Media / Agent Sam** behavior (indexing, file discovery, tool context, worker + dashboard agents).

---

## 1. File names (repo root and per workspace)

| File | Role |
|------|------|
| **`.agentsamignore`** | Paths and globs **excluded** from Agent Sam context: indexing, `@` file pickers, bulk repo reads, optional R2/git scan lists. Syntax aligned with **`.gitignore`-style** (one pattern per line, `#` comments, `!` negation optional). |
| **`.agentsamrules`** | **Natural-language + optional structured front-matter** instructions for Agent Sam (tone, deploy rules, locked files, D1 keys to read first). Same *spirit* as `.cursorrules`, **IAM-specific** content only. |

**Optional nested copies** (if you enable hierarchical merge later):

- `packages/foo/.agentsamignore` — patterns apply under `packages/foo/` when hierarchical mode is on.

---

## 2. How they relate to `.cursorignore` / `.cursorrules`

- **Cursor** tools (Cursor IDE) keep using **`.cursorignore`** / **`.cursorrules`**.
- **Agent Sam** (dashboard, worker agent, MCP-assisted flows) reads **`.agentsamignore`** / **`.agentsamrules`** so IAM behavior can diverge without editing Cursor-only files.
- **Recommended default:** in `.agentsamrules`, one short bullet: “Also respect `.cursorrules` for overlap” **only if** you want dual compliance; otherwise keep IAM rules self-contained to avoid drift.

---

## 3. Database naming convention (tables)

Use a **single prefix** for all Agent Sam policy tables so they sort together in migrations and D1 console:

**Prefix: `agentsam_`** (no dots; matches file stem `agentsam`).

Suggested core tables:

### 3.1 `agentsam_ignore_pattern`

Row = one glob or path fragment for one scope.

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | e.g. `aig_` + uuid |
| `workspace_id` | TEXT NULL | NULL = tenant/global default; else scoped to a workspace/project |
| `tenant_id` | TEXT NULL | If you multi-tenant IAM at row level |
| `pattern` | TEXT NOT NULL | Glob or path (same rules as `.agentsamignore` lines) |
| `is_negation` | INTEGER 0/1 | `1` = `!` pattern (re-include) |
| `order_index` | INTEGER | Merge order within scope |
| `source` | TEXT | `file` \| `db` \| `api` — where this row was synced from |
| `created_at` | TEXT | ISO / sqlite datetime |
| `updated_at` | TEXT | |

**Unique suggestion:** `(workspace_id, pattern, is_negation)` or soft-unique via app logic if patterns can repeat across sources.

### 3.2 `agentsam_rules_document`

One **logical** rules doc per scope (like one `.agentsamrules` file).

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PK | e.g. `ard_` + uuid |
| `workspace_id` | TEXT NULL | NULL = global IAM default |
| `tenant_id` | TEXT NULL | |
| `title` | TEXT | e.g. `default`, `production-guardrails` |
| `body_markdown` | TEXT NOT NULL | Full rules text |
| `version` | INTEGER | Monotonic per `workspace_id`+`title` |
| `is_active` | INTEGER 1/0 | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

### 3.3 `agentsam_rules_revision` (optional v2)

Append-only history for audit / rollback.

| Column | Type |
|--------|------|
| `id` | TEXT PK |
| `document_id` | TEXT FK → `agentsam_rules_document.id` |
| `body_markdown` | TEXT |
| `version` | INTEGER |
| `created_at` | TEXT |
| `created_by` | TEXT NULL | user id |

---

## 4. Merge / resolution order (recommended)

1. **Tenant global** DB rows (`workspace_id` NULL) — lowest priority.  
2. **Workspace** DB rows.  
3. **Repo files** `.agentsamignore` / `.agentsamrules` at workspace root (and nested if hierarchical).  
4. **Highest priority:** explicit **API PATCH** “session override” (optional future table `agentsam_session_override`) for one-off debugging.

**Ignore:** later patterns override earlier only where gitignore semantics say so; document the exact library you use (e.g. same as `ignore` npm or custom glob).

**Rules:** concatenate **active** `body_markdown` in order: global → workspace → file; or **replace** if you prefer file wins entirely (pick one and document).

---

## 5. Worker / product integration (sketch)

- **On agent turn:** worker loads merged **rules** string into system context (truncated + hashed for logs).  
- **On file listing / index:** apply merged **ignore** patterns.  
- **Sync job (optional):** parse repo `.agentsamignore` / `.agentsamrules` on push or periodic scan → upsert `source='file'` rows for dashboard editing.

---

## 6. Why not reuse table names like `cursor_ignore`?

- Avoid implying affiliation or confusion with Cursor’s product.  
- **`agentsam_`** makes ownership obvious in SQL, MCP tools, and docs.

---

## 7. Proposed migration filename pattern

`migrations/NNN_agentsam_ignore_rules.sql`

Do not run until Sam approves the exact columns against live D1 `PRAGMA table_info`.

## 8. Full Cursor-parity review SQL (all `agentsam_*` tables + themes)

Bundled for D1 Studio paste/compare:

- `scripts/d1-cursor-parity-schema-review.sql`

Includes policy, allowlists, trust origins, feature flags, agent runs, index jobs, subagent profiles, ignore/rules tables, optional `cms_themes` alters, and commented theme `INSERT`s.

## 9. Session log (Agent Sam scope)

Human audit trail for dashboard/product agent work (distinct from Cursor IDE edits):

- **`docs/agentsam-sessions-log.md`** — capabilities, template, prepend-newest entries; optional linkage to `agentsam_agent_run` / `agent_sessions`.
