# Python Operator Cockpit

Status: implementation draft
Branch: `agentsam-python-operator-cockpit`
Scope: Python tooling that reduces model spend during code generation, prototypes, audits, and edits.

---

## Purpose

Python should be the cheap pre-agent and post-agent layer around expensive model calls.

```text
Python scans.
Python narrows context.
Cheap model plans.
Expensive model edits only the needed files.
Python verifies.
Telemetry records cost and result.
```

This prevents expensive models from wasting tokens on repo discovery, obvious diagnostics, repeated context gathering, and retry loops.

---

## First implementation

The first cockpit entrypoint is:

```text
tools_py/iam_cli.py
```

It is intentionally standard-library-only for now.

Run from repo root:

```bash
python3 tools_py/iam_cli.py --help
```

---

## Commands included

### Command fabric doctor

```bash
python3 tools_py/iam_cli.py commands doctor
```

Produces Markdown and JSON reports for:

```text
agentsam_commands registry health
command-run pollution
duplicate slugs
missing executor targets
risky commands without approval
palette-visible commands without descriptions
workflow commands with missing workflow rows
top failing commands
top slow commands
```

### Command catalog export

```bash
python3 tools_py/iam_cli.py commands export
```

Exports active `agentsam_commands` as JSON and Markdown grouped by category/subcategory.

### Command-run pollution audit

```bash
python3 tools_py/iam_cli.py commands pollution
```

Focused check for `agentsam_command_run` rows that lack a selected command or look like plain chat.

### Command pipeline smoke wrapper

```bash
python3 tools_py/iam_cli.py commands smoke
```

Default behavior is safe: it refuses to run the existing D1-writing smoke unless explicitly called with:

```bash
python3 tools_py/iam_cli.py commands smoke --write
```

### Context pack generation

```bash
python3 tools_py/iam_cli.py context pack "fix command-run pollution"
```

Creates a focused Markdown pack with likely relevant files and excerpts.

This is the file to give a coding model before asking for edits.

### Cost report

```bash
python3 tools_py/iam_cli.py costs report --last 7d
```

Reads `agentsam_usage_events` and groups spend by model/tool/status.

### Prototype scaffold

```bash
python3 tools_py/iam_cli.py proto mobile command-palette
```

Creates a mobile-first HTML/CSS/JSON prototype scaffold under `prototypes/`.

### Patch verification

```bash
python3 tools_py/iam_cli.py verify patch --quick
python3 tools_py/iam_cli.py verify patch
```

Quick mode compiles the CLI. Full mode runs dashboard build plus command doctor.

---

## Money-saving workflow

Use this pattern for code edits:

```bash
python3 tools_py/iam_cli.py commands doctor
python3 tools_py/iam_cli.py context pack "fix the command issue shown in the doctor report"
```

Then ask the coding agent to patch only what appears in the context pack.

After patch:

```bash
python3 tools_py/iam_cli.py verify patch --quick
python3 tools_py/iam_cli.py commands doctor
```

For bigger UI changes:

```bash
python3 tools_py/iam_cli.py proto mobile command-palette
```

Then let the model refine the generated prototype instead of inventing the whole screen.

---

## Relationship to command fabric doctrine

This cockpit implements the standard defined in:

```text
docs/platform/agentsam-command-fabric-doctrine-2026-06.md
```

Core rule:

```text
No selected command, no command_run row.
Plain chat must not create agentsam_command_run rows.
```

---

## Next build steps

1. Run `python3 tools_py/iam_cli.py verify patch --quick` locally.
2. Run `python3 tools_py/iam_cli.py commands doctor` against remote D1.
3. Review the generated Markdown report under `artifacts/operator_cockpit/commands/`.
4. Use report findings to patch command-run pollution paths.
5. Add screenshot/visual diff verification for iPhone 13 Pro dashboard surfaces.
6. Add RAG/vector doctor commands.
7. Add Design Studio GLB/media doctor commands.
8. Feed command health and model cost back into routing policy.
