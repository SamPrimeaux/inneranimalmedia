# Agent Sam Command Fabric Doctrine

Last drafted: 2026-06-25
Status: review draft
Owner: Sam Primeaux / Inner Animal Media
Scope: `agentsam_commands`, command matching, approval, dispatch, execution telemetry, and operator cockpit UX.

---

## 1. Executive summary

`agentsam_commands` is the canonical registry of actions Agent Sam may propose, surface, route, execute, measure, or require approval for.

It is not a chat log.
It is not a terminal history table.
It is not a free-form scratchpad.
It is the capability registry for Agent Sam.

The command fabric should behave like this:

```text
catalog -> match -> permission -> approval -> dispatch -> telemetry -> learning
```

The goal is to make Agent Sam safer, more useful, and more measurable by giving every operational action a typed home with risk, routing, approval, and performance metadata.

---

## 2. Core doctrine

```text
agentsam_commands = canonical command/action/capability registry
agentsam_command_pattern = matcher / alias / natural-language pattern layer
agentsam_command_allowlist = permission layer
agentsam_command_run = proposed or executed command ledger
agentsam_approval_queue = human approval gate
agentsam_scripts = reusable scripts callable by command rows
agentsam_workflows = multi-step workflow graphs callable by command rows
```

Plain chat must not create `agentsam_command_run` rows.

Only command proposals, tool executions, workflow executions, script executions, terminal proposals, or approved operational actions should create `agentsam_command_run` rows.

A user saying “what is PyTorch?” is not a command run.
A user saying “run the D1 schema audit” can become a command run.
A user clicking `/d1-list` can become a command run.
A workflow step executing `r2:inventory` can become a command run.

---

## 3. Table responsibilities

### 3.1 `agentsam_commands`

Purpose: canonical capability registry.

This table answers:

```text
What can Agent Sam do?
What is the human-facing name?
What slug invokes it?
How risky is it?
Does it require approval?
Where does it route?
Is it a tool, workflow, script, or in-app action?
Should it show in slash menu, allowlist, or Cmd+K palette?
How often has it worked?
How long does it usually take?
What route/model/tool lane should own it?
```

Expected row types:

```text
tool      -> calls a tool dispatcher via tool_key
workflow  -> calls agentsam_workflows via workflow_key
script    -> calls agentsam_scripts / executeAgentsamScript via script slug or tool_key
in_app    -> calls internal product behavior, such as plan/thread/designstudio handlers
reference -> docs or implementation guidance only; should not be executable without an adapter
```

Required expectations for active rows:

```text
id is stable
slug is stable within workspace_id
display_name is human-readable
category is meaningful
risk_level is one of low, medium, high, critical
router_type is explicit
mapped_command is present, even if it points to an internal key
show_in_palette is intentional
requires_confirmation / requires_approval match risk
```

### 3.2 `agentsam_command_pattern`

Purpose: natural language / alias layer.

This table should map user phrases, shorthand aliases, and trigger patterns to canonical commands.

Examples:

```text
"list d1 tables" -> /d1-list or /d1-info depending context
"check vector indexes" -> command doctor or vectorize info command
"run cms theme audit" -> cms-theme-audit
```

This table should not duplicate canonical command metadata. It should point to command IDs or slugs.

### 3.3 `agentsam_command_allowlist`

Purpose: permission layer.

This table answers:

```text
Who can use this command?
Which workspace can use it?
Is this allowed globally, tenant-specific, or user-specific?
Is the command visible but locked?
```

The allowlist should not determine risk. Risk belongs on `agentsam_commands`.

### 3.4 `agentsam_command_run`

Purpose: actual proposal/execution ledger.

A row should exist only when the system has identified a real command/action proposal or execution.

Good rows:

```text
User selected /d1-list from palette.
Agent proposed /r2-bucket-delete and sent it to approval.
Agent executed cms-theme-audit script.
Workflow graph executed designstudio:convert-glb.
Terminal command proposal was accepted and executed.
```

Bad rows:

```text
Plain greeting.
General explanation question.
Brainstorming conversation with no proposed command.
Chat message that only mentions a command conceptually.
```

Minimum desired fields for useful runs:

```text
id
workspace_id
tenant_id
user_id when available
user_input or trigger source
selected_command_id
selected_command_slug
risk_level
requires_confirmation
approval_status
success
exit_code or error status
result_json or output_text
model_id / provider when model-assisted
duration_ms
input_tokens / output_tokens / cost_usd when applicable
created_at
```

### 3.5 `agentsam_approval_queue`

Purpose: human approval gate for risky actions.

A row should exist when a command/action needs human approval before mutation or destructive execution.

Approval queue rows should link back to at least one of:

```text
command_run_id
workflow_run_id
execution_step_id
tool_key
```

High and critical commands should almost always require explicit approval unless there is a narrow, documented owner-only exception.

### 3.6 `agentsam_scripts`

Purpose: reusable automation units.

Scripts are repeatable implementation bodies that commands can route into.

Examples:

```text
scripts/audit_command_pipeline_alignment.py
scripts/inneranimalmedia/export_agentsam_commands.py
scripts/smoke/smoke_command_pipeline.py
scripts/designstudio/cad-job-runner.mjs
scripts/r2-dashboard-manifest-reconcile.mjs
```

Command rows should not become giant script definitions. Commands should point to scripts where repeatable automation already exists.

### 3.7 `agentsam_workflows`

Purpose: multi-step graph execution.

A command row can route into a workflow when the action needs ordered steps, branching, state, retries, or telemetry across multiple operations.

---

## 4. Router contract

`router_type` decides the dispatch path.

```text
router_type=tool
  Requires tool_key.
  Dispatches through dispatchByToolCode.

router_type=workflow
  Requires workflow_key.
  Dispatches through executeWorkflowGraph.

router_type=script
  Requires script identity, preferably tool_key or a dedicated script_slug.
  Dispatches through executeAgentsamScript.

router_type=in_app
  Requires an in-app key via tool_key, mapped_command, or slug.
  Dispatches through internal handlers such as plan/thread/designstudio behavior.
```

`route_key` is routing metadata, not command identity.

Correct mental model:

```text
command.router_type decides executor family
command.tool_key / workflow_key / script key decides execution target
command.route_key helps model/profile/routing selection
command.slug is human/product invocation identity
```

Do not make `route_key` a single-column foreign key to prompt routes. Route resolution is tenant-aware and runtime-context-aware.

---

## 5. Risk and approval doctrine

Risk levels:

```text
low      -> read-only, inspect/list/get/status/logs, no mutation
medium   -> creates or updates non-destructive resources, may cost money, may alter state
high     -> deploys, modifies production-ish settings, touches credentials, broad writes, queue consumers, domains
critical -> delete, purge, restore, credential replacement, destructive or irreversible action
```

Approval expectations:

```text
low:
  Usually no approval.
  Confirmation optional.

medium:
  Usually confirmation required for mutation.
  Approval required when it affects production, money, auth, or public surfaces.

high:
  Approval required by default.

critical:
  Approval required by default.
  UI must display destructive framing clearly.
```

No command with `risk_level IN ('high', 'critical')` should be executable without approval unless there is a documented owner-only exception.

---

## 6. Command run creation rules

Create `agentsam_command_run` only when at least one of these is true:

```text
A command row was selected by ID or slug.
A command pattern resolved to a command row.
A workflow step intentionally invoked a command row.
A tool proposal references a command row.
A terminal command proposal is being tracked as an operational action.
An approval queue item is being created for a specific action.
```

Do not create `agentsam_command_run` when:

```text
The user is casually chatting.
The user asks a general educational question.
The assistant mentions possible commands without proposing one.
The system is only doing model reasoning.
The message is a plan draft with no selected command/action.
```

Recommended status lifecycle:

```text
matched -> proposed -> approval_pending -> approved -> executing -> succeeded
matched -> proposed -> approval_pending -> rejected
matched -> proposed -> cancelled
matched -> proposed -> executing -> failed
```

Current schemas may not have every status field yet. Until then, represent status through existing fields such as `approval_status`, `success`, `exit_code`, `result_json`, and timestamps.

---

## 7. Cmd+K / slash / operator UX doctrine

The command palette should make command risk obvious before execution.

Recommended UI groups:

```text
Safe Read
  list, inspect, get, status, logs, preview

Mutation
  create, update, upload, run, trigger, deploy, convert

Danger Zone
  delete, purge, restore, credentials, token updates, destructive changes

In-App
  plan, thread, CMS, Design Studio, browser/session actions

Workflow
  multi-step graph actions

Script
  repeatable automation scripts
```

Each palette row should show:

```text
display_name
slug
category/subcategory
risk chip
approval chip
router type
last-used or success signal when available
short description
```

Critical commands should never appear visually identical to read-only commands.

---

## 8. Telemetry doctrine

Command telemetry should make Agent Sam improve over time.

`agentsam_commands` counters should reflect aggregate health:

```text
use_count
success_count
failure_count
avg_duration_ms
last_used_at
estimated_cost_usd
```

`agentsam_command_run` should capture per-run detail:

```text
selected command
arguments
approval status
execution output
success/failure
latency
cost
tokens
model/provider/tool path
```

Telemetry should support questions like:

```text
Which commands fail most often?
Which commands are expensive?
Which commands are risky but commonly used?
Which commands should be scripts?
Which commands should be workflows?
Which commands should be hidden from palette?
Which route/model is best for this command type?
```

---

## 9. Audit checks

The command doctor should run these checks.

### 9.1 Duplicate active slugs

```sql
SELECT workspace_id, slug, COUNT(*) AS n
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
GROUP BY workspace_id, slug
HAVING COUNT(*) > 1;
```

### 9.2 Missing executor target

```sql
SELECT id, slug, router_type, tool_key, workflow_key, mapped_command
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
AND (
  (router_type = 'tool' AND COALESCE(tool_key, '') = '')
  OR (router_type = 'workflow' AND COALESCE(workflow_key, '') = '')
  OR (router_type = 'script' AND COALESCE(tool_key, slug, '') = '')
);
```

### 9.3 High/critical command without approval

```sql
SELECT id, slug, risk_level, requires_confirmation, requires_approval
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
AND risk_level IN ('high', 'critical')
AND COALESCE(requires_confirmation, 0) = 0
AND COALESCE(requires_approval, 0) = 0;
```

### 9.4 Visible command without description

```sql
SELECT id, slug, display_name
FROM agentsam_commands
WHERE COALESCE(is_active, 1) = 1
AND COALESCE(show_in_palette, 1) = 1
AND COALESCE(description, '') = '';
```

### 9.5 Command-run pollution

```sql
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN commands_json IS NULL OR commands_json = '[]' THEN 1 ELSE 0 END) AS empty_commands_json,
  SUM(CASE WHEN selected_command_id IS NULL AND selected_command_slug IS NULL THEN 1 ELSE 0 END) AS no_selected_command,
  SUM(CASE WHEN intent_category IS NULL OR intent_category = 'misc' THEN 1 ELSE 0 END) AS null_or_misc_intent,
  SUM(CASE WHEN approval_status = 'not_required' THEN 1 ELSE 0 END) AS not_required_approval,
  SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS success_zero
FROM agentsam_command_run;
```

### 9.6 Recent suspicious command runs

```sql
SELECT
  id,
  substr(user_input, 1, 140) AS user_input_preview,
  intent_category,
  commands_json,
  selected_command_id,
  selected_command_slug,
  risk_level,
  requires_confirmation,
  approval_status,
  success,
  exit_code,
  created_at
FROM agentsam_command_run
WHERE selected_command_id IS NULL
   OR selected_command_slug IS NULL
   OR commands_json IS NULL
   OR commands_json = '[]'
ORDER BY created_at DESC
LIMIT 50;
```

### 9.7 Workflow target missing

```sql
SELECT c.id, c.slug, c.workflow_key
FROM agentsam_commands c
LEFT JOIN agentsam_workflows w
  ON w.workflow_key = c.workflow_key
 AND COALESCE(w.is_active, 1) = 1
WHERE COALESCE(c.is_active, 1) = 1
  AND c.router_type = 'workflow'
  AND w.workflow_key IS NULL;
```

---

## 10. Recommended CLI shape

Create one operator entrypoint instead of scattered scripts.

```bash
python tools_py/iam_cli.py commands audit
python tools_py/iam_cli.py commands export
python tools_py/iam_cli.py commands smoke
python tools_py/iam_cli.py commands doctor
python tools_py/iam_cli.py commands inspect /d1-list
python tools_py/iam_cli.py commands risks
python tools_py/iam_cli.py commands pollution
```

Suggested package shape:

```text
tools_py/
  iam_cli.py
  config.py
  d1.py
  markdown.py
  commands/
    audit.py
    export.py
    smoke.py
    doctor.py
    pollution.py
```

First useful command:

```bash
python tools_py/iam_cli.py commands doctor
```

It should output:

```text
Command registry summary
Duplicate slugs
Missing executor targets
High/critical commands without approval
Palette-visible commands without descriptions
Workflow commands with missing workflow targets
Recent command_run pollution
Approval queue health
Top failing commands
Top slow commands
```

---

## 11. Relationship to Python/tooling roadmap

This command fabric is the natural home for the Python/operator tooling layer.

The Python layer should not replace the Worker runtime. It should inspect, audit, backfill, export, smoke test, and report on it.

Best Python uses:

```text
D1/Supabase parity audits
command registry audits
RAG/vector smoke tests
cost reports
routing evals
GLB/media asset checks
approval queue reports
command run pollution checks
operator Markdown/JSON reports
```

This is why `agentsam_commands` matters: it gives Python scripts a canonical map of what the platform can do.

---

## 12. Implementation priorities

### P0: make command-run pollution impossible

Guard all insert paths into `agentsam_command_run`.

Rule:

```text
No selected command, no command_run row.
```

A row may be created for a proposal before approval, but it must still reference a command or explicit terminal/tool proposal.

### P1: create command doctor

Wrap existing audit/export/smoke behavior into one CLI.

Use existing scripts as source material:

```text
scripts/audit_command_pipeline_alignment.py
scripts/inneranimalmedia/export_agentsam_commands.py
scripts/smoke/smoke_command_pipeline.py
```

### P2: fix script-study validation bug

`study-agentsam-commands-for-scripts.mjs` should define `tenantId` and `workspaceId` before checking them.

Correct shape:

```js
const tenantId = requireIdentity("IAM_TENANT_ID", process.env.IAM_TENANT_ID);
const workspaceId = requireIdentity("IAM_WORKSPACE_ID", process.env.IAM_WORKSPACE_ID);
const userId = requireIdentity("IAM_USER_ID", process.env.IAM_USER_ID);
```

The extra `if (!tenantId || !workspaceId || !userId)` block is unnecessary if `requireIdentity` already throws.

### P3: add UI risk grouping

Update Cmd+K / command palette to visually separate:

```text
Safe Read
Mutation
Danger Zone
In-App
Workflow
Script
```

### P4: connect telemetry back into palette

Surface command health in UI:

```text
success rate
avg duration
last used
approval required
risk
```

### P5: script/workflow consolidation

Promote repeated command clusters into `agentsam_scripts` or `agentsam_workflows`.

Use command rows as entrypoints, not as giant implementations.

---

## 13. Non-goals

Do not turn `agentsam_commands` into a generic message table.

Do not store giant script bodies directly in command rows.

Do not use `route_key` as command identity.

Do not let critical commands execute from palette without obvious approval framing.

Do not let plain chat pollute command telemetry.

Do not require every command to be executable. Some rows may be references or implementation guides, but those should be clearly marked and should not dispatch through executable paths without adapters.

---

## 14. Review questions

Use these questions to review the current implementation:

```text
1. Which code paths insert into agentsam_command_run?
2. Can any plain chat path insert into agentsam_command_run?
3. Are all high/critical active commands approval gated?
4. Are router_type/tool_key/workflow_key combinations valid?
5. Are reference-only commands marked so they cannot accidentally execute?
6. Does Cmd+K visually distinguish safe reads from destructive actions?
7. Do command counters update only after real execution?
8. Are repeated command clusters being promoted into scripts/workflows?
9. Does command telemetry feed routing/model decisions?
10. Can Sam run one command to audit the whole command fabric?
```

---

## 15. Target end state

Agent Sam should have a command fabric that feels like this:

```text
Ask naturally.
Agent Sam detects whether it is chat, plan, command, tool, script, or workflow.
Safe reads can run quickly.
Risky actions become explicit proposals.
Destructive actions require approval.
Every real action is logged.
Every run improves telemetry.
Repeated actions become scripts.
Multi-step actions become workflows.
The palette becomes a safe operator cockpit instead of a random command list.
```

That is the standard.
