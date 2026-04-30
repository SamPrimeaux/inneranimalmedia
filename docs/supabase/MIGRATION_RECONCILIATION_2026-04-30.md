# Supabase migration reconciliation (2026-04-30)

This document records the state of **local** vs **remote** Supabase migrations for `inneranimalmedia-agentsam-dashboard`, so context is not lost while history is reconciled.

## Active vs dead project

| | Project ref | Notes |
|---|-------------|--------|
| **Active (only target for this repo)** | `dpmuvynqixblxsilnlut` | `inneranimalmedia-business-supabase`, org `syccscyruabhkctnpguw`. Confirmed in `supabase/.temp/project-ref` and `supabase/.temp/linked-project.json`. |
| **Dead / outdated** | `sexdnwlyuhkyvseunqlx` | Do not use. Remove or override shell env (`SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`) that still point here. |

## CLI rule for this repository

The shell may set `SUPABASE_PROJECT_ID=sexdnwlyuhkyvseunqlx`, which overrides `supabase link` and sends CLI traffic at the wrong project.

**Rule:** run every Supabase CLI command from this repo as:

```bash
cd /Users/samprimeaux/inneranimalmedia-agentsam-dashboard
env -u SUPABASE_PROJECT_ID supabase <subcommand> ...
```

## Local migration files (`supabase/migrations/`)

| File | Parsed local version (CLI) | On remote history? |
|------|-----------------------------|----------------------|
| `20260424_fix_supabase_trigger_signatures.sql` | `20260424` | No matching remote row (local-only until pushed/reconciled). |
| `20260430120000_agentsam_dashboard_tester_rls.sql` | `20260430120000` | No matching remote row (local-only). |

### Pending decision: `20260430120000_agentsam_dashboard_tester_rls.sql`

Leave **local-only** until you explicitly either:

- apply it via **Supabase SQL Editor** or **MCP** (manual control), or  
- finish migration reconciliation and then `env -u SUPABASE_PROJECT_ID supabase db push` if that becomes the chosen path.

Do **not** assume it has been applied on `dpmuvynqixblxsilnlut` until verified in the dashboard or with a schema query.

## Remote applied migration versions (25)

These exist in the remote `supabase_migrations.schema_migrations` history. **Corresponding `supabase/migrations/<version>_*.sql` files are not in this repo’s git** (not recoverable from current history).

| Remote version | Time (UTC) |
|----------------|------------|
| `20260324153714` | 2026-03-24 15:37:14 |
| `20260324153721` | 2026-03-24 15:37:21 |
| `20260324154646` | 2026-03-24 15:46:46 |
| `20260329164837` | 2026-03-29 16:48:37 |
| `20260403023513` | 2026-04-03 02:35:13 |
| `20260416181342` | 2026-04-16 18:13:42 |
| `20260416190452` | 2026-04-16 19:04:52 |
| `20260416190458` | 2026-04-16 19:04:58 |
| `20260416190505` | 2026-04-16 19:05:05 |
| `20260424202458` | 2026-04-24 20:24:58 |
| `20260424202508` | 2026-04-24 20:25:08 |
| `20260424204245` | 2026-04-24 20:42:45 |
| `20260424204344` | 2026-04-24 20:43:44 |
| `20260424204537` | 2026-04-24 20:45:37 |
| `20260424204548` | 2026-04-24 20:45:48 |
| `20260424204600` | 2026-04-24 20:46:00 |
| `20260424204612` | 2026-04-24 20:46:12 |
| `20260424204625` | 2026-04-24 20:46:25 |
| `20260424205426` | 2026-04-24 20:54:26 |
| `20260430101912` | 2026-04-30 10:19:12 |
| `20260430102058` | 2026-04-30 10:20:58 |
| `20260430172056` | 2026-04-30 17:20:56 |
| `20260430201726` | 2026-04-30 20:17:26 |
| `20260430202923` | 2026-04-30 20:29:23 |
| `20260430203053` | 2026-04-30 20:30:53 |

Original migration **filenames** on disk are unknown here; only the version keys above are authoritative on the server.

## Why `supabase db push` is blocked

The Supabase CLI requires that **every migration version already recorded on the remote** has a matching local file under `supabase/migrations/`. Because **25 remote versions have no local files**, `db push` aborts with:

`Remote migration versions not found in local migrations directory.`

Until those files are restored (or a deliberate baseline strategy is agreed and applied **without** destructive remote repair), **`env -u SUPABASE_PROJECT_ID supabase db push` must not be expected to succeed.**

## Remote schema snapshot (documentation)

Artifact path:

`docs/supabase/remote_schema_public_agentsam_2026-04-30.sql`

**Intended generator** (this CLI version uses `-f` and comma-separated schemas; shell `>` is equivalent if you omit `-f`):

```bash
env -u SUPABASE_PROJECT_ID supabase db dump --linked \
  -s public,agentsam \
  -f docs/supabase/remote_schema_public_agentsam_2026-04-30.sql --yes
```

If automated generation failed (e.g. Docker Desktop not running), the SQL file may be a **placeholder** with instructions until you re-run the command on a machine where `supabase db dump` completes.

## Explicit non-actions (baseline safety)

Do **not** yet (unless a future runbook says otherwise):

- `supabase migration repair` (especially against production history)
- `supabase db push` until local/remote migration alignment is resolved
- destructive SQL against production without review

## Related artifacts

| Path | Purpose |
|------|---------|
| `docs/supabase/MIGRATION_RECONCILIATION_2026-04-30.md` | This runbook |
| `docs/supabase/remote_schema_public_agentsam_2026-04-30.sql` | Schema snapshot or placeholder + regen command |

Refresh `migration list` before major changes:

```bash
env -u SUPABASE_PROJECT_ID supabase migration list
```
