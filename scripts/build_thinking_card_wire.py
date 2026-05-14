#!/usr/bin/env python3
"""
build_thinking_card_wire.py
1. Copies ThinkingCard.tsx into dashboard/src/components/
2. Wires ThinkingCard state + SSE events into ChatAssistant.tsx
3. Adds onApprovalRequired callback to surface command_run_id to App.tsx

Run from repo root:
  python3 scripts/build_thinking_card_wire.py
"""

import os, re, shutil, sys

ROOT = os.getcwd()

def rp(rel): return os.path.join(ROOT, rel)
def read(rel): 
    with open(rp(rel), encoding='utf-8') as f: return f.read()
def write(rel, src):
    with open(rp(rel), 'w', encoding='utf-8') as f: f.write(src)
def patch(rel, old, new, label, regex=False):
    src = read(rel)
    if regex:
        out, n = re.subn(old, new, src, flags=re.DOTALL)
    else:
        n = src.count(old)
        out = src.replace(old, new)
    if n == 0:
        print(f'  WARN  no match: {label}')
        return False
    write(rel, out)
    print(f'  PATCH ({n}): {label}')
    return True

# ── 0. Copy ThinkingCard.tsx into repo ───────────────────────────────────────
SRC_CARD = rp('scripts/ThinkingCard.tsx')
DST_CARD = rp('dashboard/src/components/ThinkingCard.tsx')

if not os.path.exists(SRC_CARD):
    print('ERROR: scripts/ThinkingCard.tsx not found. Move it there first.')
    sys.exit(1)

shutil.copy2(SRC_CARD, DST_CARD)
print(f'  COPY: ThinkingCard.tsx → dashboard/src/components/')

CA = 'dashboard/features/agent-chat/ChatAssistant.tsx'

# ── 1. Add ThinkingCard import ────────────────────────────────────────────────
patch(
    CA,
    "import { AgentMessageList } from './components/AgentMessageList';",
    "import { AgentMessageList } from './components/AgentMessageList';\n"
    "import { ThinkingCard } from '../../src/components/ThinkingCard';\n"
    "import type { ThinkingCardState, ThinkingStep } from '../../src/components/ThinkingCard';",
    'ChatAssistant — import ThinkingCard',
)

# ── 2. Add onApprovalRequired to props interface ──────────────────────────────
patch(
    CA,
    '  onLoadingChange?: (loading: boolean) => void;',
    '  onLoadingChange?: (loading: boolean) => void;\n'
    '  /** Called when SSE emits approval_required with a command_run_id. */\n'
    '  onApprovalRequired?: (commandRunId: string) => void;',
    'ChatAssistant — add onApprovalRequired prop',
)

# ── 3. Destructure new prop ───────────────────────────────────────────────────
patch(
    CA,
    '  onLoadingChange,',
    '  onLoadingChange,\n  onApprovalRequired,',
    'ChatAssistant — destructure onApprovalRequired',
)

# ── 4. Add ThinkingCard state after isLoading state ──────────────────────────
THINKING_STATE = (
    '\n  const [thinkingState, setThinkingState] =\n'
    "    useState<ThinkingCardState | null>(null);\n"
    '  const thinkingStartRef = useRef<number>(0);\n'
)
patch(
    CA,
    '  useEffect(() => { onLoadingChange?.(isLoading); }, [isLoading, onLoadingChange]);',
    '  useEffect(() => { onLoadingChange?.(isLoading); }, [isLoading, onLoadingChange]);'
    + THINKING_STATE,
    'ChatAssistant — add thinkingState + ref',
)

# ── 5. Wire SSE events ────────────────────────────────────────────────────────
# Find the SSE event dispatch — look for where tool_start / thinking_start
# events are likely handled. We search for the consumeAgentChatSseBody call
# and the callback pattern.

src = read(CA)

# Find the onEvent / event handler pattern — try several common patterns
SSE_ANCHORS = [
    # Pattern A: switch/if block on event type string
    "if (ev.type === 'tool_start'",
    "case 'tool_start':",
    "if (type === 'tool_start')",
    # Pattern B: the done handler (we'll inject before it)
    "if (ev.type === 'done'",
    "case 'done':",
    "if (type === 'done')",
]

found_anchor = None
for anchor in SSE_ANCHORS:
    if anchor in src:
        found_anchor = anchor
        break

THINKING_SSE_HANDLERS = """
      if (ev.type === 'thinking_start') {
        thinkingStartRef.current = Date.now();
        setThinkingState({ steps: [], thinkingText: '', status: 'thinking', startedAt: Date.now() });
      }
      if (ev.type === 'thinking') {
        setThinkingState(prev => prev
          ? { ...prev, status: 'thinking', thinkingText: (prev.thinkingText || '') + (ev.text || '') }
          : { steps: [], thinkingText: ev.text || '', status: 'thinking', startedAt: Date.now() });
      }
      if (ev.type === 'tool_start') {
        const stepId = ev.tool_name || ev.node_key || String(Date.now());
        setThinkingState(prev => {
          const base = prev ?? { steps: [], thinkingText: '', status: 'working', startedAt: Date.now() };
          const exists = base.steps.find(s => s.id === stepId);
          if (exists) return base;
          return { ...base, status: 'working', steps: [...base.steps, { id: stepId, name: stepId, status: 'running' }] };
        });
      }
      if (ev.type === 'tool_done' || ev.type === 'workflow_step') {
        const stepId = ev.tool_name || ev.node_key || '';
        const preview = String(ev.output_preview || ev.result || '').slice(0, 120);
        setThinkingState(prev => {
          if (!prev) return prev;
          const steps: ThinkingStep[] = prev.steps.map(s =>
            s.id === stepId ? { ...s, status: ev.ok === false ? 'error' : 'done', preview: preview || s.preview } : s
          );
          if (stepId && !steps.find(s => s.id === stepId)) {
            steps.push({ id: stepId, name: stepId, status: ev.ok === false ? 'error' : 'done', preview });
          }
          return { ...prev, steps };
        });
      }
      if (ev.type === 'tool_error') {
        const stepId = ev.tool_name || ev.node_key || '';
        setThinkingState(prev => {
          if (!prev) return prev;
          return { ...prev, steps: prev.steps.map(s => s.id === stepId ? { ...s, status: 'error' } : s) };
        });
      }
      if (ev.type === 'tool_blocked') {
        const stepId = ev.tool_name || ev.node_key || '';
        setThinkingState(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            status: 'blocked',
            steps: prev.steps.map(s => s.id === stepId ? { ...s, status: 'blocked' } : s),
          };
        });
      }
      if (ev.type === 'workflow_complete') {
        setThinkingState(prev => prev ? { ...prev, status: 'done' } : prev);
      }
      if (ev.type === 'workflow_error') {
        setThinkingState(prev => prev ? { ...prev, status: 'error' } : prev);
      }
      if (ev.type === 'approval_required') {
        const crid = ev.command_run_id || ev.approval_id || null;
        if (crid) onApprovalRequired?.(String(crid));
        setThinkingState(prev => prev ? { ...prev, status: 'blocked' } : prev);
      }
      if (ev.type === 'done') {
        setThinkingState(prev => prev ? { ...prev, status: 'done' } : prev);
      }
      if (ev.type === 'error') {
        setThinkingState(prev => prev ? { ...prev, status: 'error' } : prev);
      }
"""

if found_anchor:
    patch(
        CA,
        found_anchor,
        THINKING_SSE_HANDLERS.rstrip() + '\n      ' + found_anchor,
        f'ChatAssistant — inject ThinkingCard SSE handlers before "{found_anchor}"',
    )
else:
    # Fallback: find consumeAgentChatSseBody and add a wrapper comment
    print('  WARN: SSE event anchor not found — manual step required.')
    print('        Find where SSE events are dispatched (consumeAgentChatSseBody callback)')
    print('        and add the handlers from scripts/thinking_sse_handlers.js')
    handlers_path = rp('scripts/thinking_sse_handlers.js')
    with open(handlers_path, 'w') as f:
        f.write('// Paste these handlers into your SSE event dispatch block:\n')
        f.write(THINKING_SSE_HANDLERS)
    print(f'        Handlers written to: {handlers_path}')

# ── 6. Clear thinkingState on new send ───────────────────────────────────────
# Find the send handler and reset thinkingState when a new message is sent
patch(
    CA,
    'if ((!text && attachments.length === 0) || (isLoading && !overrideMessage) || !selectedModelKey) return;',
    'if ((!text && attachments.length === 0) || (isLoading && !overrideMessage) || !selectedModelKey) return;\n'
    '    setThinkingState(null);',
    'ChatAssistant — clear thinkingState on new send',
)

# ── 7. Render ThinkingCard above streaming text ───────────────────────────────
# Find AgentMessageList usage and inject ThinkingCard before it
patch(
    CA,
    '<AgentMessageList',
    '{thinkingState && (\n'
    '          <ThinkingCard\n'
    '            steps={thinkingState.steps}\n'
    '            thinkingText={thinkingState.thinkingText}\n'
    '            status={thinkingState.status}\n'
    '            startedAt={thinkingState.startedAt}\n'
    '          />\n'
    '        )}\n'
    '        <AgentMessageList',
    'ChatAssistant — render ThinkingCard above AgentMessageList',
)

# ── 8. Wire App.tsx: onApprovalRequired → setActiveCommandRunId ──────────────
APP = 'dashboard/App.tsx'
patch(
    APP,
    '              onLoadingChange={setAgentIsStreaming}',
    '              onLoadingChange={setAgentIsStreaming}\n'
    '              onApprovalRequired={setActiveCommandRunId}',
    'App.tsx — wire onApprovalRequired to both ChatAssistant mounts',
)

print("""
Done. Build check:
  npm run build:vite-only

If SSE anchor was not found, the thinking card state + render are wired
but events won't fire yet — paste thinking_sse_handlers.js into your
consumeAgentChatSseBody callback manually, then rebuild.

Commit when green:
  git add dashboard/src/components/ThinkingCard.tsx \\
          dashboard/features/agent-chat/ChatAssistant.tsx \\
          dashboard/App.tsx
  git commit -m "feat(agent): ThinkingCard — collapsible execution trace with SSE wiring"
  git push origin main
""")
