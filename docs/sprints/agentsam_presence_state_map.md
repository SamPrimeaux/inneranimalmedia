# Agent Sam Presence State Map
# Source of truth for all animated states, icons, copy, and SSE derivation.
# Reference this file in Cursor Sessions 1, 3, and 5 only.

---

## Step 1 — Copy new files into repo

```bash
cp ~/Downloads/agentsam_sse_ux_p0.md \
   /Users/samprimeaux/inneranimalmedia/docs/sprints/agentsam_sse_ux_p0.md

cp ~/Downloads/agentsam_sse_ux_p0_addendum.md \
   /Users/samprimeaux/inneranimalmedia/docs/sprints/agentsam_sse_ux_p0_addendum.md

cp ~/Downloads/agentsam_presence_state_map.md \
   /Users/samprimeaux/inneranimalmedia/docs/sprints/agentsam_presence_state_map.md

cp ~/Downloads/20260519_plan_tasks_add_running_status.sql \
   /Users/samprimeaux/inneranimalmedia/migrations/20260519_plan_tasks_add_running_status.sql
```

## Step 2 — Apply D1 migration (terminal, no Cursor needed)

```bash
cd /Users/samprimeaux/inneranimalmedia

wrangler d1 migrations apply inneranimalmedia-business \
  --remote \
  --migration-file migrations/20260519_plan_tasks_add_running_status.sql
```

Confirm output says `1 migration applied` before opening Cursor at all.

---

## Type Definitions

```ts
// dashboard/features/agent-presence/iamPresenceStateMap.ts

export type AgentPresenceIcon =
  | 'spark'
  | 'scan'
  | 'terminal'
  | 'diff'
  | 'pixel'
  | 'path'
  | 'files'
  | 'browser';

export type AgentPresenceTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger';

export type AgentPresenceState =
  | 'idle'
  | 'thinking'
  | 'planning'
  | 'reading'
  | 'writing'
  | 'tool'
  | 'terminal'
  | 'browser'
  | 'database'
  | 'files'
  | 'drawing'
  | 'imaging'
  | 'waiting_approval'
  | 'complete'
  | 'failed';
```

---

## Presence State Map

```ts
export const iamPresenceStateMap = {
  idle: {
    icon: 'spark' as AgentPresenceIcon,
    motion: 'idle',
    tone: 'neutral' as AgentPresenceTone,
    label: 'Idle',
    copy: [
      'Ready when you are.',
      'Waiting for the next instruction.',
    ],
  },

  thinking: {
    icon: 'spark' as AgentPresenceIcon,
    motion: 'thinking',
    tone: 'accent' as AgentPresenceTone,
    label: 'Thinking',
    copy: [
      'Thinking through the cleanest path.',
      'Synthesizing the next move.',
      'Breaking the work into useful steps.',
      'Choosing the right workflow.',
    ],
  },

  planning: {
    icon: 'spark' as AgentPresenceIcon,
    motion: 'planning',
    tone: 'accent' as AgentPresenceTone,
    label: 'Planning',
    copy: [
      'Building the task plan.',
      'Organizing the work into steps.',
      'Preparing the execution path.',
      'Turning this into a trackable plan.',
    ],
  },

  reading: {
    icon: 'scan' as AgentPresenceIcon,
    motion: 'reading',
    tone: 'accent' as AgentPresenceTone,
    label: 'Reading',
    copy: [
      'Inspecting the relevant files.',
      'Reading the current workspace state.',
      'Scanning for the right context.',
      'Loading the source of truth.',
    ],
  },

  writing: {
    icon: 'diff' as AgentPresenceIcon,
    motion: 'writing',
    tone: 'accent' as AgentPresenceTone,
    label: 'Writing',
    copy: [
      'Preparing a focused patch.',
      'Editing the selected files.',
      'Writing the implementation cleanly.',
      'Generating a reviewable diff.',
    ],
  },

  terminal: {
    icon: 'terminal' as AgentPresenceIcon,
    motion: 'terminal',
    tone: 'accent' as AgentPresenceTone,
    label: 'Terminal',
    copy: [
      'Running the command.',
      'Streaming terminal output.',
      'Checking command results.',
      'Executing the next step.',
    ],
  },

  browser: {
    icon: 'browser' as AgentPresenceIcon,
    motion: 'browser',
    tone: 'accent' as AgentPresenceTone,
    label: 'Browser',
    copy: [
      'Inspecting the page visually.',
      'Checking the browser state.',
      'Reviewing the live interface.',
      'Navigating the workspace view.',
    ],
  },

  database: {
    icon: 'scan' as AgentPresenceIcon,
    motion: 'database',
    tone: 'accent' as AgentPresenceTone,
    label: 'Database',
    copy: [
      'Querying the database.',
      'Checking D1 state.',
      'Inspecting table structure.',
      'Reading stored execution data.',
    ],
  },

  files: {
    icon: 'files' as AgentPresenceIcon,
    motion: 'files',
    tone: 'accent' as AgentPresenceTone,
    label: 'Files',
    copy: [
      'Working with files.',
      'Checking stored assets.',
      'Preparing the artifact.',
      'Updating the file workspace.',
    ],
  },

  drawing: {
    icon: 'path' as AgentPresenceIcon,
    motion: 'drawing',
    tone: 'accent' as AgentPresenceTone,
    label: 'Drawing',
    copy: [
      'Drawing the diagram.',
      'Tracing the visual plan.',
      'Building the canvas structure.',
      'Sketching the system flow.',
    ],
  },

  imaging: {
    icon: 'pixel' as AgentPresenceIcon,
    motion: 'imaging',
    tone: 'accent' as AgentPresenceTone,
    label: 'Image',
    copy: [
      'Creating the visual asset.',
      'Generating the image.',
      'Composing the output.',
      'Preparing the media result.',
    ],
  },

  tool: {
    icon: 'scan' as AgentPresenceIcon,
    motion: 'tool',
    tone: 'accent' as AgentPresenceTone,
    label: 'Tool',
    copy: [
      'Using the selected tool.',
      'Running the next tool call.',
      'Processing tool output.',
    ],
  },

  waiting_approval: {
    icon: 'spark' as AgentPresenceIcon,
    motion: 'approval',
    tone: 'warning' as AgentPresenceTone,
    label: 'Approval',
    copy: [
      'Waiting for your approval.',
      'Paused for confirmation.',
      'Nothing runs until you confirm.',
      'Ready for your decision.',
    ],
  },

  complete: {
    icon: 'spark' as AgentPresenceIcon,
    motion: 'complete',
    tone: 'success' as AgentPresenceTone,
    label: 'Complete',
    copy: [
      'Done.',
      'Completed successfully.',
      'Finished cleanly.',
    ],
  },

  failed: {
    icon: 'spark' as AgentPresenceIcon,
    motion: 'failed',
    tone: 'danger' as AgentPresenceTone,
    label: 'Failed',
    copy: [
      'Something failed.',
      'The step needs attention.',
      'Execution stopped with an error.',
    ],
  },
} as const;
```

---

## iamDerivePresenceState Function

```ts
// dashboard/features/agent-presence/iamDerivePresenceState.ts

import type { AgentPresenceState } from './iamPresenceStateMap';

export function iamDerivePresenceState(event: Record<string, unknown>): AgentPresenceState {
  const type    = String(event?.type    || '').toLowerCase();
  const handler = String(event?.handler_type || event?.handler || '').toLowerCase();
  const tool    = String(event?.tool_name    || event?.name    || event?.tool || '').toLowerCase();
  const title   = String(event?.title        || event?.task_title || event?.message || '').toLowerCase();

  const signal = `${handler} ${tool} ${title}`;

  if (!type) return 'idle';

  // Lifecycle
  if (type === 'thinking_start' || type === 'thinking')           return 'thinking';
  if (type === 'plan_thinking'  || type === 'plan_created')       return 'planning';
  if (type === 'approval_required' || type === 'plan_confirmation_required') return 'waiting_approval';
  if (type === 'plan_complete'  || type === 'done' || type === 'complete')   return 'complete';
  if (type === 'error'          || type === 'tool_error' || type === 'failed') return 'failed';

  // task_start — handler_type is strongest signal
  if (type === 'task_start') {
    if (/terminal|shell|bash|exec|command/.test(signal))                      return 'terminal';
    if (/db_query|database|d1|sql|supabase|postgres|table/.test(signal))      return 'database';
    if (/browser|playwright|cdt|screenshot|navigate|click/.test(signal))      return 'browser';
    if (/image|thumbnail|media|visual.asset|generate.image/.test(signal))     return 'imaging';
    if (/excalidraw|diagram|draw|canvas|flowchart|wireframe/.test(signal))    return 'drawing';
    if (/r2|bucket|asset|upload|download|artifact|file.browser|storage/.test(signal)) return 'files';
    if (/monaco|write|create|save|edit|patch|diff/.test(signal))              return 'writing';
    if (/read|fetch|get|inspect|load|open|grep|search/.test(signal))          return 'reading';
    if (/mcp_tool|tool/.test(signal))                                         return 'tool';
    return 'thinking';
  }

  // tool_start — tool name carries semantic context
  if (type === 'tool_start') {
    if (/browser|playwright|cdt|navigate|screenshot|click|highlight|dom|css/.test(signal))        return 'browser';
    if (/terminal|shell|bash|run|exec|command|wrangler|npm|node|python|build|deploy/.test(signal)) return 'terminal';
    if (/d1|sql|supabase|postgres|database|query|table|schema|migration/.test(signal))            return 'database';
    if (/image|thumbnail|media|asset.preview|visual.asset|generate.image/.test(signal))           return 'imaging';
    if (/excalidraw|diagram|draw|canvas|flowchart|wireframe/.test(signal))                        return 'drawing';
    if (/r2|bucket|upload|download|artifact|asset|storage|file.browser/.test(signal))             return 'files';
    if (/monaco|write|create|save|edit|patch|diff|replace|commit/.test(signal))                   return 'writing';
    if (/read|fetch|get|inspect|load|open|grep|search|list|scan/.test(signal))                    return 'reading';
    return 'tool';
  }

  // Progress events preserve previous state upstream
  if (type === 'tool_delta' || type === 'task_delta' || type === 'progress') {
    return (event?.previousPresenceState as AgentPresenceState) || 'thinking';
  }

  return 'thinking';
}
```

---

## CSS Data-State Selectors
# Add to: dashboard/features/agent-presence/presenceMotion.css

```css
/* Presence state → animation binding */
.iam-presence-logo[data-state="idle"]              { animation: agent-sam-plan-shimmer 4s ease-in-out infinite; }
.iam-presence-logo[data-state="thinking"]          { animation: agent-sam-plan-shimmer 1.8s ease-in-out infinite; }
.iam-presence-logo[data-state="planning"]          { animation: agent-sam-ring-pulse 2.2s ease-in-out infinite; }
.iam-presence-logo[data-state="reading"]           { animation: presence-read 1.4s linear infinite; }
.iam-presence-logo[data-state="writing"]           { animation: presence-write 1.2s ease-in-out infinite; }
.iam-presence-logo[data-state="terminal"]          { animation: presence-terminal 0.8s steps(2) infinite; }
.iam-presence-logo[data-state="browser"]           { animation: presence-browser 2s ease-in-out infinite; }
.iam-presence-logo[data-state="database"]          { animation: presence-db 1.6s ease-in-out infinite; }
.iam-presence-logo[data-state="tool"]              { animation: agent-sam-plan-shimmer 1.4s ease-in-out infinite; }
.iam-presence-logo[data-state="files"]             { animation: presence-files 1.7s ease-in-out infinite; }
.iam-presence-logo[data-state="drawing"]           { animation: presence-draw 2.2s ease-in-out infinite; }
.iam-presence-logo[data-state="imaging"]           { animation: presence-image 1.7s ease-in-out infinite; }
.iam-presence-logo[data-state="waiting_approval"]  { animation: agent-sam-amber-pulse 1.2s ease-in-out infinite; }
.iam-presence-logo[data-state="complete"]          { animation: presence-complete 0.4s ease-out forwards; }
.iam-presence-logo[data-state="failed"]            { animation: presence-fail 0.3s ease-out forwards; }

/* New keyframes — append after existing ones */
@keyframes presence-read     { to { transform: rotate(360deg); } }
@keyframes presence-write    { 0%,100%{transform:translateX(-4px)} 50%{transform:translateX(4px)} }
@keyframes presence-terminal { 0%,49%{opacity:1} 50%,100%{opacity:0.2} }
@keyframes presence-browser  { 0%,100%{transform:translateY(-3px);opacity:.5} 50%{transform:translateY(3px);opacity:1} }
@keyframes presence-db       { 0%,100%{transform:scale(.9);opacity:.6} 50%{transform:scale(1.1);opacity:1} }
@keyframes presence-files    { 0%,100%{transform:translateY(0);opacity:.5} 50%{transform:translateY(-5px);opacity:1} }
@keyframes presence-draw     { 0%{opacity:.4} 48%,66%{opacity:1} 100%{opacity:.4} }
@keyframes presence-image    { 0%,100%{transform:scale(.66);opacity:.3} 46%{transform:scale(1.22);opacity:1} }
@keyframes presence-complete { 0%{transform:scale(1.2);opacity:1} 100%{transform:scale(1);opacity:.7} }
@keyframes presence-fail     { 0%,20%,40%{transform:translateX(-3px)} 10%,30%{transform:translateX(3px)} 100%{transform:translateX(0);opacity:.5} }
```

---

## Semantic Assignment Table

| State            | Icon       | Trigger tools / signals                                      |
|------------------|------------|--------------------------------------------------------------|
| idle             | spark      | No active stream                                             |
| thinking         | spark      | thinking_start, thinking, generic task_start                 |
| planning         | spark      | plan_thinking, plan_created                                  |
| reading          | scan       | read / fetch / get / inspect / grep / search tools           |
| writing          | diff       | monaco / write / create / save / edit / patch / diff tools   |
| terminal         | terminal   | bash / shell / wrangler / python / npm / build tools         |
| browser          | browser    | playwright / cdt / navigate / screenshot / click tools       |
| database         | scan       | d1 / sql / supabase / postgres / query / table tools         |
| files            | files      | r2 / bucket / upload / download / artifact / storage tools   |
| drawing          | path       | excalidraw / diagram / canvas / flowchart tools              |
| imaging          | pixel      | image / thumbnail / media / generate image tools             |
| tool             | scan       | any unclassified tool_start                                  |
| waiting_approval | spark      | approval_required, plan_confirmation_required                |
| complete         | spark      | plan_complete, done                                          |
| failed           | spark      | error, tool_error                                            |

---

## Icon → Animation Quick Reference

| Icon key   | Visual feel               | Primary states                    |
|------------|---------------------------|-----------------------------------|
| spark      | rays pulse, core breathes | thinking, planning, idle, approval, complete, failed |
| scan       | ring rotates, crosshair   | reading, database, tool           |
| terminal   | cursor blinks, prompt slides | terminal                       |
| diff       | sweep moves across lines  | writing                           |
| pixel      | blocks bloom in sequence  | imaging                           |
| path       | line draws itself         | drawing                           |
| files      | sheets pulse upward       | files                             |
| browser    | scanline + node ping      | browser                           |
