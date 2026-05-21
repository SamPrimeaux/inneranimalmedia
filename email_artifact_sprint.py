#!/usr/bin/env python3
"""
email_artifact_sprint.py
Sprint: EmailArtifactCard — structured email output surface in Agent Sam chat

Follows rule_python_patch_safety_001:
  - .bak backup before every write
  - line-by-line insertion, no regex replace on multi-line blocks
  - idempotent (sentinel checks before patching)
  - repo root guard

Touches 6 files:
  CREATE  dashboard/features/agent-chat/artifacts/EmailArtifactCard.tsx
  MODIFY  dashboard/features/agent-chat/types.ts          (Message + EmailArtifact)
  MODIFY  dashboard/features/agent-chat/streamParsing.ts  (isEmailDraftEvent helper)
  MODIFY  dashboard/features/agent-chat/hooks/useAgentChatStream.ts
  MODIFY  dashboard/features/agent-chat/components/AgentMessageList.tsx
  MODIFY  src/api/agent.js
"""

import os, sys, shutil, subprocess
from pathlib import Path

# ── Repo root guard ────────────────────────────────────────────────────────────
MARKERS = ['package.json', 'wrangler.production.toml', 'src/api/agent.js']

def find_root():
    for p in [Path.cwd(), *Path.cwd().parents]:
        if all((p / m).exists() for m in MARKERS):
            return p
    return None

ROOT = find_root()
if not ROOT:
    print("❌  Not in inneranimalmedia repo. cd to repo root first.")
    sys.exit(1)
print(f"✅  Repo root: {ROOT}\n")
os.chdir(ROOT)

# ── Helpers ────────────────────────────────────────────────────────────────────
def bak(path: Path):
    dst = path.with_suffix(path.suffix + '.bak')
    shutil.copy2(path, dst)
    print(f"     📦  backed up → {dst.name}")

def read(path: Path) -> list[str]:
    return path.read_text('utf-8').splitlines(keepends=True)

def write(path: Path, lines: list[str]):
    path.write_text(''.join(lines), 'utf-8')

def patched(lines: list[str], sentinel: str) -> bool:
    return any(sentinel in l for l in lines)

def find_line(lines: list[str], needle: str, start: int = 0) -> int:
    for i in range(start, len(lines)):
        if needle in lines[i]:
            return i
    return -1

def abort(msg: str):
    print(f"\n❌  {msg}")
    sys.exit(1)

# ── File paths ─────────────────────────────────────────────────────────────────
ARTIFACTS_DIR  = ROOT / 'dashboard/features/agent-chat/artifacts'
EMAIL_CARD     = ARTIFACTS_DIR / 'EmailArtifactCard.tsx'
STREAM_PARSING = ROOT / 'dashboard/features/agent-chat/streamParsing.ts'
USE_STREAM     = ROOT / 'dashboard/features/agent-chat/hooks/useAgentChatStream.ts'
MSG_LIST       = ROOT / 'dashboard/features/agent-chat/components/AgentMessageList.tsx'
AGENT_JS       = ROOT / 'src/api/agent.js'

# types.ts — find by content since path can vary
TYPES_TS = None
for candidate in [
    ROOT / 'dashboard/features/agent-chat/types.ts',
    ROOT / 'dashboard/features/agent-chat/hooks/types.ts',
    ROOT / 'dashboard/types.ts',
]:
    if candidate.exists() and 'imageGenerationState' in candidate.read_text('utf-8'):
        TYPES_TS = candidate
        break
if not TYPES_TS:
    for p in ROOT.rglob('types.ts'):
        txt = p.read_text('utf-8')
        if 'imageGenerationState' in txt and 'export interface Message' in txt:
            TYPES_TS = p
            break
if not TYPES_TS:
    abort("Could not locate types.ts with Message interface.")
print(f"  📄  types.ts → {TYPES_TS.relative_to(ROOT)}\n")

# ── Step 1 — CREATE EmailArtifactCard.tsx ─────────────────────────────────────
print("── Step 1: Create EmailArtifactCard.tsx")
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

CARD_TSX = """\
import React, { useState } from 'react';
import type { EmailArtifact } from '../types';

interface EmailArtifactCardProps {
  artifact: EmailArtifact;
}

export function EmailArtifactCard({ artifact }: EmailArtifactCardProps) {
  const { subject, body, to } = artifact;
  const [copyLabel, setCopyLabel] = useState<'Copy' | 'Copied ✓'>('Copy');
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  function handleCopy() {
    navigator.clipboard.writeText(body).then(() => {
      setCopyLabel('Copied ✓');
      setTimeout(() => setCopyLabel('Copy'), 1500);
    });
  }

  function handleOpenInMail() {
    const enc = encodeURIComponent;
    window.open(`mailto:${to ?? ''}?subject=${enc(subject)}&body=${enc(body)}`);
  }

  async function handleSendResend() {
    setSendState('sending');
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body, source: 'agent_chat' }),
      });
      setSendState(res.ok ? 'sent' : 'failed');
    } catch {
      setSendState('failed');
    }
  }

  const btn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '5px',
    fontSize: '12px', background: 'transparent', border: 'none',
    cursor: 'pointer', padding: '4px 8px', borderRadius: '6px',
    color: 'var(--color-text-secondary)',
    transition: 'background 0.12s',
  };

  return (
    <div style={{
      border: '0.5px solid var(--color-border-secondary, rgba(255,255,255,0.12))',
      borderRadius: '12px', padding: '16px', marginTop: '8px',
      background: 'var(--color-surface-raised, rgba(255,255,255,0.03))',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em',
          color: 'var(--color-text-muted, rgba(255,255,255,0.35))', textTransform: 'uppercase' }}>
          Email draft
        </span>
        {to && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-muted, rgba(255,255,255,0.35))' }}>
            To: {to}
          </span>
        )}
      </div>

      {/* Subject */}
      <div style={{ fontSize: '15px', fontWeight: 500,
        color: 'var(--color-text-primary)', marginBottom: '10px' }}>
        {subject}
      </div>

      {/* Divider */}
      <div style={{ height: '0.5px',
        background: 'var(--color-border-tertiary, rgba(255,255,255,0.08))',
        marginBottom: '10px' }} />

      {/* Body */}
      <div style={{ fontSize: '13px', lineHeight: 1.7,
        color: 'var(--color-text-secondary)', whiteSpace: 'pre-wrap',
        maxHeight: '280px', overflowY: 'auto' }}>
        {body}
      </div>

      {/* Action row */}
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap',
        borderTop: '0.5px solid var(--color-border-tertiary, rgba(255,255,255,0.08))',
        paddingTop: '12px', marginTop: '12px' }}>
        <button style={btn}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={handleCopy}>
          <i className="ti ti-copy" aria-hidden="true" style={{ fontSize: '14px' }} />
          {copyLabel}
        </button>

        <button style={btn}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={handleOpenInMail}>
          <i className="ti ti-mail" aria-hidden="true" style={{ fontSize: '14px' }} />
          Open in Mail
        </button>

        <button
          style={{ ...btn, opacity: sendState !== 'idle' ? 0.6 : 1,
            cursor: sendState !== 'idle' ? 'default' : 'pointer' }}
          onMouseEnter={e => { if (sendState === 'idle') e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          onClick={handleSendResend}
          disabled={sendState !== 'idle'}>
          <i className="ti ti-send" aria-hidden="true" style={{ fontSize: '14px' }} />
          {sendState === 'idle' && 'Send via Resend'}
          {sendState === 'sending' && 'Sending…'}
          {sendState === 'sent' && 'Sent ✓'}
          {sendState === 'failed' && 'Failed — retry?'}
        </button>
      </div>
    </div>
  );
}
"""

if EMAIL_CARD.exists():
    print("  ⏭   EmailArtifactCard.tsx already exists — skipping\n")
else:
    EMAIL_CARD.write_text(CARD_TSX, 'utf-8')
    print(f"  ✅  Created: {EMAIL_CARD.relative_to(ROOT)}\n")

# ── Step 2 — MODIFY types.ts ───────────────────────────────────────────────────
print("── Step 2: Patch types.ts")
SENTINEL_TYPES = 'emailArtifact?: EmailArtifact'

lines = read(TYPES_TS)
if patched(lines, SENTINEL_TYPES):
    print("  ⏭   Already patched\n")
else:
    bak(TYPES_TS)
    # 2a — Insert EmailArtifact interface before Message interface
    msg_idx = find_line(lines, 'export interface Message {')
    if msg_idx == -1:
        abort("'export interface Message {' not found in types.ts")
    INTERFACE_BLOCK = (
        "export interface EmailArtifact {\n"
        "  subject: string;\n"
        "  body: string;\n"
        "  to?: string;\n"
        "  from?: string;\n"
        "}\n\n"
    ).splitlines(keepends=True)
    lines = lines[:msg_idx] + INTERFACE_BLOCK + lines[msg_idx:]

    # 2b — Add emailArtifact field after imageGenerationState
    img_idx = find_line(lines, 'imageGenerationState?: ImageGenerationState')
    if img_idx == -1:
        abort("'imageGenerationState' not found in Message interface after insert")
    NEW_FIELD = (
        "  /** Email draft artifact from Agent Sam email composition (SSE `email_draft`). */\n"
        "  emailArtifact?: EmailArtifact | null;\n"
    ).splitlines(keepends=True)
    lines = lines[:img_idx + 1] + NEW_FIELD + lines[img_idx + 1:]
    write(TYPES_TS, lines)
    print(f"  ✅  Patched: {TYPES_TS.relative_to(ROOT)}\n")

# ── Step 3 — MODIFY streamParsing.ts (append) ─────────────────────────────────
print("── Step 3: Patch streamParsing.ts")
SENTINEL_PARSING = 'isEmailDraftEvent'

lines = read(STREAM_PARSING)
if patched(lines, SENTINEL_PARSING):
    print("  ⏭   Already patched\n")
else:
    bak(STREAM_PARSING)
    APPEND = (
        "\n// ── Email draft event ────────────────────────────────────────────────────────\n"
        "export interface EmailDraftEvent {\n"
        "  type: 'email_draft';\n"
        "  subject: string;\n"
        "  body: string;\n"
        "  to?: string;\n"
        "  from?: string;\n"
        "}\n\n"
        "export function isEmailDraftEvent(data: unknown): data is EmailDraftEvent {\n"
        "  if (!data || typeof data !== 'object') return false;\n"
        "  const d = data as Record<string, unknown>;\n"
        "  return (\n"
        "    d.type === 'email_draft' &&\n"
        "    typeof d.subject === 'string' &&\n"
        "    typeof d.body === 'string'\n"
        "  );\n"
        "}\n"
    )
    lines.append(APPEND)
    write(STREAM_PARSING, lines)
    print(f"  ✅  Patched: {STREAM_PARSING.relative_to(ROOT)}\n")

# ── Step 4 — MODIFY useAgentChatStream.ts ─────────────────────────────────────
print("── Step 4: Patch useAgentChatStream.ts")
SENTINEL_HOOK = "evType === 'email_draft'"
# Insert before the comment that marks tool_start / tool_done handling
ANCHOR_HOOK = '// tool_start / tool_done: handled below'

EMAIL_HANDLER = (
    "        if (evType === 'email_draft') {\n"
    "          const d = data as { subject?: string; body?: string; to?: string; from?: string };\n"
    "          setMessages((prev) => {\n"
    "            const last = [...prev];\n"
    "            const lastMsg = last[last.length - 1];\n"
    "            if (lastMsg && lastMsg.role === 'assistant') {\n"
    "              last[last.length - 1] = {\n"
    "                ...lastMsg,\n"
    "                emailArtifact: {\n"
    "                  subject: d.subject ?? '',\n"
    "                  body: d.body ?? '',\n"
    "                  to: d.to,\n"
    "                  from: d.from,\n"
    "                },\n"
    "              };\n"
    "            }\n"
    "            return last;\n"
    "          });\n"
    "          continue;\n"
    "        }\n"
)

lines = read(USE_STREAM)
if patched(lines, SENTINEL_HOOK):
    print("  ⏭   Already patched\n")
else:
    bak(USE_STREAM)
    anchor_idx = find_line(lines, ANCHOR_HOOK)
    if anchor_idx == -1:
        abort(f"Anchor not found in useAgentChatStream.ts: '{ANCHOR_HOOK}'")
    insert = EMAIL_HANDLER.splitlines(keepends=True)
    lines = lines[:anchor_idx] + insert + lines[anchor_idx:]
    write(USE_STREAM, lines)
    print(f"  ✅  Patched: {USE_STREAM.relative_to(ROOT)}\n")

# ── Step 5 — MODIFY AgentMessageList.tsx ──────────────────────────────────────
print("── Step 5: Patch AgentMessageList.tsx")
SENTINEL_MSGLIST = 'EmailArtifactCard'
# Anchor: find AgentImageGenerationCard, then the closing ") : null}" of that block
ANCHOR_IMG = 'AgentImageGenerationCard'

EMAIL_JSX = (
    "                  {msg.emailArtifact ? (\n"
    "                    <div className=\"mb-3\">\n"
    "                      <EmailArtifactCard artifact={msg.emailArtifact} />\n"
    "                    </div>\n"
    "                  ) : null}\n"
)
IMPORT_LINE = "import { EmailArtifactCard } from '../artifacts/EmailArtifactCard';\n"

lines = read(MSG_LIST)
if patched(lines, SENTINEL_MSGLIST):
    print("  ⏭   Already patched\n")
else:
    bak(MSG_LIST)
    img_idx = find_line(lines, ANCHOR_IMG)
    if img_idx == -1:
        abort(f"Anchor not found in AgentMessageList.tsx: '{ANCHOR_IMG}'")
    # Find next ") : null}" after img_idx (within 15 lines)
    close_idx = -1
    for i in range(img_idx, min(img_idx + 15, len(lines))):
        if ') : null}' in lines[i]:
            close_idx = i
            break
    if close_idx == -1:
        abort("Could not find ') : null}' closing the AgentImageGenerationCard block")
    # Insert EmailArtifactCard JSX after the closing line
    jsx_lines = EMAIL_JSX.splitlines(keepends=True)
    lines = lines[:close_idx + 1] + jsx_lines + lines[close_idx + 1:]
    # Add import after last existing import line
    last_import = -1
    for i, l in enumerate(lines):
        if l.strip().startswith('import '):
            last_import = i
    if last_import != -1 and not patched(lines, 'EmailArtifactCard'):
        lines = lines[:last_import + 1] + [IMPORT_LINE] + lines[last_import + 1:]
    write(MSG_LIST, lines)
    print(f"  ✅  Patched: {MSG_LIST.relative_to(ROOT)}\n")

# ── Step 6 — MODIFY src/api/agent.js ──────────────────────────────────────────
print("── Step 6: Patch src/api/agent.js")
SENTINEL_AGENTJS = 'email_draft'
ANCHOR_TOOL_DONE = "emit('tool_done', {"

EMAIL_EMIT = (
    "      // ── email_draft artifact ──────────────────────────────────────────────────\n"
    "      const _emailTools = ['resend_send_email','send_email','gmail_send','email_send','mail_send'];\n"
    "      if (_emailTools.includes(call.name) && !execErr) {\n"
    "        try {\n"
    "          const _raw = String(toolOutput || '');\n"
    "          let _subj = '', _body = _raw.slice(0, 2000), _to = '';\n"
    "          try {\n"
    "            const _j = JSON.parse(_raw);\n"
    "            if (_j.subject) _subj = String(_j.subject);\n"
    "            if (_j.to)      _to   = String(_j.to);\n"
    "            if (_j.body || _j.text || _j.html)\n"
    "              _body = String(_j.body || _j.text || _j.html);\n"
    "          } catch (_) {\n"
    "            const _sm = _raw.match(/subject[\"'\\s:]+([^\\n\"']+)/i);\n"
    "            const _tm = _raw.match(/^to[\"'\\s:]+([^\\n\"']+)/im);\n"
    "            if (_sm) _subj = _sm[1].trim();\n"
    "            if (_tm) _to   = _tm[1].trim();\n"
    "          }\n"
    "          if (_subj || _body.length > 20)\n"
    "            emit('email_draft', { subject: _subj, body: _body, to: _to });\n"
    "        } catch (_) { /* non-fatal */ }\n"
    "      }\n"
)

lines = read(AGENT_JS)
if patched(lines, SENTINEL_AGENTJS):
    print("  ⏭   Already patched\n")
else:
    bak(AGENT_JS)
    anchor_idx = find_line(lines, ANCHOR_TOOL_DONE)
    if anchor_idx == -1:
        abort(f"Anchor not found in agent.js: '{ANCHOR_TOOL_DONE}'")
    # Find closing }); of this emit block (scan up to 25 lines forward)
    close_idx = -1
    for i in range(anchor_idx + 1, min(anchor_idx + 25, len(lines))):
        s = lines[i].strip()
        if s in ('});', ');') :
            close_idx = i
            break
    if close_idx == -1:
        abort("Could not find closing '}); ' of emit('tool_done') block")
    emit_lines = EMAIL_EMIT.splitlines(keepends=True)
    lines = lines[:close_idx + 1] + emit_lines + lines[close_idx + 1:]
    write(AGENT_JS, lines)
    print(f"  ✅  Patched: {AGENT_JS.relative_to(ROOT)}\n")

# ── Step 7 — Git, push, deploy ────────────────────────────────────────────────
print("── Step 7: Git status (pre-commit)")
r = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
print(r.stdout or '  (nothing)\n')

print("── Committing")
subprocess.run(['git', 'add', '-A'], check=True)
r = subprocess.run(
    ['git', 'commit', '-m',
     'feat(chat): email artifact card — structured email surface with copy/mail/resend/log actions'],
    capture_output=True, text=True,
)
print(r.stdout or r.stderr)

print("── Pushing to main")
r = subprocess.run(['git', 'push', 'origin', 'main'], capture_output=True, text=True)
print(r.stdout or r.stderr)
if r.returncode != 0:
    print(f"  ⚠️  Push issue:\n{r.stderr}")

print("── Deploying (npm run deploy:full)")
r = subprocess.run(['npm', 'run', 'deploy:full'], capture_output=True, text=True)
out = (r.stdout or '') + (r.stderr or '')
print(out[-2000:] if len(out) > 2000 else out)
if r.returncode != 0:
    print("  ❌  Deploy failed — check output above")
else:
    print("  ✅  Deploy succeeded")

print("\n── Final git status")
r = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
print(r.stdout or '  ✅  Clean working tree')

print("\n🚀  Done — test at: https://inneranimalmedia.com/dashboard/agent")
print("    Trigger an email composition and the card should render below the message.")
