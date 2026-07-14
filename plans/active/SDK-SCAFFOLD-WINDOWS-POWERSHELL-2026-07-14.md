# SDK — Scaffold wizard fails for Windows/PowerShell (Connor onboarding)

**Ticket:** `tkt_agentsam_sdk_scaffold_windows_2026_07_14`  
**Status:** `active` · **Priority:** P0 (high)  
**Project:** `proj_agentsam_sdk` · **Subsystem:** `scaffold`  
**Tags:** `windows`, `powershell`, `connor`, `onboarding`, `cli`, `ux`  
**Repo:** `agentsam-sdk` (publish surface `@inneranimalmedia/agentsam-sdk`)  
**Required passes:** 2 — one native PowerShell on Windows (or Windows CI), one Unix sanity check

## Observed 2026-07-14 (Connor)

1. **`agentsam-scaffold` bin entry** auto-stripped by `npm pkg fix` — package `name`/bin format invalid.
2. **Shell command is display-only, not a REPL** — typing `/buddy` into PowerShell tried to execute as a filesystem path.
3. **Next-steps mix prose + commands** — labels like `Optional:`, `When ready:` pasted verbatim into PowerShell and broke.
4. **`npx run smoke`** installed a random npm package named `run` instead of running a project script.
5. **No Windows test path** — scaffold wizard untested on native PowerShell.

## Root fix

| Area | Fix |
|------|-----|
| Package | Valid `bin` map that survives `npm pkg fix`; CI asserts bins present after pack |
| Shell | Interactive REPL (or explicit “copy these exact lines”) — never imply PowerShell is the agent shell |
| Next steps | **Numbered commands only** — no prose labels interleaved with copy-paste lines |
| Smoke | Documented exact command (`npm run smoke` / `npx --yes …`) — never `npx run …` |
| CI | Windows PowerShell job that runs scaffold → print next steps → fails if steps are non-runnable |

## Acceptance

1. Fresh Windows PowerShell: install → `agentsam-scaffold` (or documented entry) completes without bin errors.
2. Next-steps block is commands-only; paste of entire block does not invent invalid paths.
3. Smoke instruction runs the project script, does not `npm install run`.
4. GitHub Actions (or equivalent) Windows job green **and** macOS/linux smoke still green (dual-pass).

## Dual-pass close

```bash
npm run record:ticket-e2e-pass -- --ticket=tkt_agentsam_sdk_scaffold_windows_2026_07_14 --detail='PASS1: Windows CI / native PS transcript …'
npm run record:ticket-e2e-pass -- --ticket=tkt_agentsam_sdk_scaffold_windows_2026_07_14 --detail='PASS2: Unix scaffold still green …'
npm run assert:ticket-shippable -- --ticket=tkt_agentsam_sdk_scaffold_windows_2026_07_14 --set-shipped
```
