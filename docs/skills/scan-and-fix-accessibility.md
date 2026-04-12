# scan-and-fix-accessibility

Scan a live URL or localhost target for WCAG violations using Playwright-driven
MCP tooling, triage issues by severity, generate targeted code fixes, and
re-verify in a single agentic loop.

---

## When to Use

- Auditing a page for WCAG 2.0 / 2.1 / 2.2 compliance
- Diagnosing accessibility regressions before a deploy
- Generating patch-ready code fixes from a violation report
- Running post-fix verification without leaving the Agent Sam chat

---

## Tools Invoked

| Tool ID | Tool Name | Purpose |
|---------|-----------|---------|
| `tool_accessibility_expert` | `accessibilityExpert` | WCAG guideline lookup and remediation guidance |
| `tool_accessibility_scan` | `startAccessibilityScan` | Playwright-driven full-page accessibility scan |

Both tools are registered in `mcp_registered_tools` in `inneranimalmedia-business` D1.

---

## Agentic Workflow

### Step 1 — Trigger a Scan

Agent Sam calls `startAccessibilityScan` autonomously when you provide a target.
Supported invocation formats:

```
/run scan-and-fix-accessibility localhost:3000/login
/run scan-and-fix-accessibility https://inneranimals.com/checkout
/run scan-and-fix-accessibility www.meauxbility.org
```

Playwright launches a headless Chromium session, waits for JS hydration, crawls
the target, and returns a structured violation report categorized by severity.

---

### Step 2 — Triage Results

Agent Sam parses and ranks violations before generating any fix:

| Severity | Description | Example |
|----------|-------------|---------|
| Critical | Blocks task completion entirely | Missing form labels, keyboard traps |
| High | Major functional barrier | Insufficient color contrast, missing alt text |
| Medium | Degrades experience | Broken heading hierarchy, redundant ARIA |
| Low | Best practice deviation | Decorative image not marked `aria-hidden` |

---

### Step 3 — WCAG Guidance (Conditional)

If a violation requires clarification or edge-case handling, Agent Sam queries
`accessibilityExpert` before generating a fix. This step is skipped when the
violation maps cleanly to a known pattern.

Example queries routed to `accessibilityExpert`:

```
"What WCAG 2.1 AA requirement covers error state messaging on mobile forms?"
"Is contrast enforcement different for large text vs body copy?"
"Does WCAG 2.2 change any keyboard navigation requirements from 2.1?"
```

---

### Step 4 — Generate Code Fixes

Agent Sam produces diff-ready patches for each violation.

**Missing Alt Text — WCAG 1.1.1**
```html
<!-- before -->
<img src="logo.png">

<!-- after -->
<img src="logo.png" alt="Inner Animals wordmark">
```

**Insufficient Color Contrast — WCAG 1.4.3**
```css
/* before — ratio 2.8:1 (fail) */
color: #999999;
background: #ffffff;

/* after — ratio 4.6:1 (pass) */
color: #666666;
background: #ffffff;
```

**Missing Form Label — WCAG 3.3.2**
```html
<!-- before -->
<input type="email" placeholder="Email">

<!-- after -->
<label for="email">Email Address</label>
<input type="email" id="email" aria-required="true">
```

**Non-Semantic Interactive Element — WCAG 2.1.1**
```html
<!-- before -->
<div onclick="handleSubmit()">Submit</div>

<!-- after -->
<button type="submit" onclick="handleSubmit()">Submit</button>
```

---

### Step 5 — Re-Verify

After you apply fixes, Agent Sam re-runs `startAccessibilityScan` against the
same target automatically. The diff between scan 1 and scan 2 is surfaced
inline. Any remaining or regression violations are flagged before the task closes.

```
Re-scan localhost:3000/login — verifying fixes applied
```

---

### Step 6 — Report

Agent Sam outputs a structured summary on completion:

```
Scan complete — localhost:3000/login
  Critical : 3 resolved, 0 remaining
  High     : 1 resolved, 0 remaining
  Medium   : 2 resolved, 1 remaining  (heading hierarchy — flagged for review)
  Low      : 4 resolved, 0 remaining
```

Remaining issues include severity level, WCAG criterion reference, and the
file/line location where Playwright identified the element.

---

## Playwright Integration Notes

- Scans run in a headless Chromium session via `startAccessibilityScan`
- Dynamic content (modals, dropdowns, JS-rendered forms) is captured after
  hydration — no static HTML snapshots
- Localhost targets require the dev server to be running on the scan host;
  use `terminal_execute` to start it if needed before invoking the scan
- Re-scans use the same session config as the initial scan for consistent diffs

---

## WCAG Quick Reference

| Criterion | Requirement |
|-----------|-------------|
| 1.1.1 | All non-text content has a text alternative |
| 1.4.3 | Text contrast ratio >= 4.5:1 (3:1 for large text) |
| 2.1.1 | All functionality operable via keyboard |
| 3.3.2 | Labels or instructions provided for user input |
| 1.3.1 | Heading hierarchy reflects document structure |

---

## Example Session

```
User:
  Fix accessibility issues on localhost:3000/login

Agent Sam:
  [startAccessibilityScan] localhost:3000/login
  Scan complete — 3 critical, 1 high, 2 medium found.

  Critical
    - <label> missing on #email input        WCAG 3.3.2
    - <div> used as button, no keyboard nav  WCAG 2.1.1
    - Logo image missing alt attribute       WCAG 1.1.1

  High
    - Body text contrast 2.8:1 on #hero      WCAG 1.4.3

  [patches generated above — apply and confirm]

User:
  done

Agent Sam:
  [startAccessibilityScan] localhost:3000/login
  Re-scan complete.
  All critical and high issues resolved.
  1 medium remaining: heading hierarchy skips h2 -> h4 on line 84.
```

---

## D1 Registration

Registered in `mcp_registered_tools` (`inneranimalmedia-business`):

| Field | `accessibilityExpert` | `startAccessibilityScan` |
|-------|-----------------------|--------------------------|
| id | `tool_accessibility_expert` | `tool_accessibility_scan` |
| tool_category | `accessibility` | `accessibility` |
| sort_priority | 40 | 41 |
| risk_level | `none` | `low` |
| handler_type | `builtin` | `builtin` |
| playwright | — | true |
