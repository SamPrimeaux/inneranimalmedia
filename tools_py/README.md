# Agent Sam Python Operator Cockpit

This folder is the cheap inspection and control layer around expensive model work.

It reduces code-generation waste by doing deterministic work before and after model calls:

```text
scan -> narrow context -> focused model edit -> verify -> report
```

The CLI currently uses only Python standard library.

## Quick start

Run from repo root:

```bash
python3 tools_py/iam_cli.py commands doctor
python3 tools_py/iam_cli.py commands export
python3 tools_py/iam_cli.py commands pollution
python3 tools_py/iam_cli.py context pack "fix command-run pollution"
python3 tools_py/iam_cli.py costs report --last 7d
python3 tools_py/iam_cli.py proto mobile command-palette
python3 tools_py/iam_cli.py verify patch --quick
```

Reports are written under:

```text
artifacts/operator_cockpit/
```

## Why this saves money

Without the cockpit, models spend tokens finding files, guessing state, and retrying failed patches.

With the cockpit, Python first creates a focused report or context pack. The model receives the smallest useful problem statement and edits fewer files.

## Command fabric tools

### commands doctor

```bash
python3 tools_py/iam_cli.py commands doctor
```

Checks:

```text
registry summary
duplicate active slugs
missing executor targets
high or critical commands without approval
visible commands without descriptions
workflow commands with missing workflow rows
command_run pollution summary
recent suspicious command_run rows
top failing commands
top slow commands
```

### commands export

```bash
python3 tools_py/iam_cli.py commands export
```

Exports active `agentsam_commands` to Markdown and JSON.

### commands pollution

```bash
python3 tools_py/iam_cli.py commands pollution
```

Focused audit for `agentsam_command_run` rows that look like plain chat or incomplete command proposals.

### commands smoke

```bash
python3 tools_py/iam_cli.py commands smoke
```

The smoke wrapper is read-only by default and prints the explicit flag needed before running the existing D1-writing smoke script.

## Context packs

```bash
python3 tools_py/iam_cli.py context pack "fix command-run pollution"
```

Creates a Markdown file with likely relevant file excerpts. Give that pack to the coding model instead of asking it to inspect the whole repo.

## Cost reports

```bash
python3 tools_py/iam_cli.py costs report --last 24h
python3 tools_py/iam_cli.py costs report --last 7d
python3 tools_py/iam_cli.py costs report --last 60m
```

Groups usage by model/tool and highlights failed spend.

## Prototype scaffolds

```bash
python3 tools_py/iam_cli.py proto mobile command-palette
```

Creates:

```text
prototypes/command-palette/index.html
prototypes/command-palette/styles.css
prototypes/command-palette/mock-data.json
```

## Patch verification

```bash
python3 tools_py/iam_cli.py verify patch --quick
python3 tools_py/iam_cli.py verify patch
```

The quick check compiles the CLI. The broader check runs dashboard build and command doctor.

## Environment

The CLI attempts to load:

```text
.env.cloudflare
.env.agentsam.local
.env.local
```

Defaults:

```text
DB: inneranimalmedia-business
Config: wrangler.production.toml
Remote: yes
```

Overrides:

```bash
python3 tools_py/iam_cli.py --local commands doctor
python3 tools_py/iam_cli.py --no-env-wrapper commands doctor
```

## Doctrine

This CLI implements the review doctrine in:

```text
docs/platform/agentsam-command-fabric-doctrine-2026-06.md
```

Core rule:

```text
agentsam_commands is the canonical command registry.
agentsam_command_run is the proposal/execution ledger.
Plain chat must not create command_run rows.
```
