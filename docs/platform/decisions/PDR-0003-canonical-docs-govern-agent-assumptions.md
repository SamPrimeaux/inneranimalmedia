# PDR-0003 — Canonical docs govern agent assumptions

**Status:** Accepted  
**Date:** 2026-07-09  
**Scope:** Platform

## Context

AI agents have used chat memory and README operational sections to infer product identity, causing repeated re-explanation and incorrect cross-product assumptions.

## Decision

- **Memory** holds preferences (e.g. dark mode, SSH git).
- **Documentation** holds principles and product truth.
- Agents must load platform constitution, product registry, and relevant product docs **before** planning or coding.
- Git-tracked Markdown is canonical for doctrine; R2/vector indexes are discovery layers only.

## Consequences

- Required reading order in root `README.md`.
- New product surfaces require registry + manifest entries before broad agent work.
- Stale docs must be marked or superseded — not silently rewritten.

## Supersedes

Nothing.
