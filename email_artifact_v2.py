#!/usr/bin/env python3
"""
email_artifact_v2.py — full rewrite, one script, Claude-level email card

What this does:
  OVERWRITE  dashboard/features/agent-chat/artifacts/EmailArtifactCard.tsx
             — AgentChatMarkdown body, clean dark card, quiet action row
  FIX        dashboard/features/agent-chat/components/AgentMessageList.tsx
             — correct JSX anchor (<AgentImageGenerationCard not import)
  ADD        dashboard/features/agent-chat/hooks/useAgentChatStream.ts
             — text-pattern email detection on SSE done event
  COMMIT → PUSH → DEPLOY

Idempotent: steps 1-4 from v1 already landed, handled by sentinels.
Follows rule_python_patch_safety_001.
"""

import os, sys, shutil, subprocess
from pathlib import Path

# ── Repo root guard ────────────────────────────────────────────────────────────
def find_root():
    for p in [Path.cwd(), *Path.cwd().parents]:
        if all((p / m).exists() for m in ['package.json', 'src/api/agent.js', 'wrangler.production.toml']):
            return p
find_root() or (print("❌  Not in repo root") or sys.exit(1))
ROOT = find_root()
os.chdir(ROOT)
print(f"✅  Repo: {ROOT}\n")

def bak(p): shutil.copy2(p, str(p) + '.bak'); print(f"     📦  {p.name}.bak")
def read(p): return p.read_text('utf-8').splitlines(keepends=True)
def write(p, lines): p.write_text(''.join(lines), 'utf-8')
def has(lines, s): return any(s in l for l in lines)
def find(lines, needle, start=0):
    for i in range(start, len(lines)):
        if needle in lines[i]: return i
    return -1

# ── Paths ──────────────────────────────────────────────────────────────────────
CARD      = ROOT / 'dashboard/features/agent-chat/artifacts/EmailArtifactCard.tsx'
MSGLIST   = ROOT / 'dashboard/features/agent-chat/components/AgentMessageList.tsx'
STREAM    = ROOT / 'dashboard/features/agent-chat/hooks/useAgentChatStream.ts'

# ── Step 1 — OVERWRITE EmailArtifactCard.tsx ──────────────────────────────────
print("── Step 1: EmailArtifactCard.tsx (Claude-level rewrite)")

CARD_CONTENT = r"""import React, { useState } from 'react';
import type { EmailArtifact } from '../types';
import AgentChatMarkdown from '../components/AgentChatMarkdown';

interface EmailArtifactCardProps {
  artifact: EmailArtifact;
}

export function EmailArtifactCard({ artifact }: EmailArtifactCardProps) {
  const { subject, body, to } = artifact;
  const [copyLabel, setCopyLabel] = useState<'Copy' | 'Copied ✓'>('Copy');
  const [sendState, setSendState] = useState<'idle'|'sending'|'sent'|'failed'>('idle');

  function handleCopy() {
    navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => {
      setCopyLabel('Copied ✓');
      setTimeout(() => setCopyLabel('Copy'), 1500);
    });
  }

  function handleOpenInMail() {
    window.open(
      `mailto:${to ?? ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    );
  }

  async function handleSend() {
    setSendState('sending');
    try {
      const r = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject, body, source: 'agent_chat' }),
      });
      setSendState(r.ok ? 'sent' : 'failed');
    } catch { setSendState('failed'); }
  }

  return (
    <div style={{
      margin: '10px 0 4px',
      border: '0.5px solid var(--color-border-secondary, rgba(255,255,255,0.12))',
      borderRadius: '12px',
      overflow: 'hidden',
      background: 'var(--color-background-secondary, rgba(255,255,255,0.03))',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px 8px',
        borderBottom: '0.5px solid var(--color-border-tertiary, rgba(255,255,255,0.07))',
      }}>
        <span style={{
          fontSize: '11px', fontWeight: 500, letterSpacing: '0.07em',
          textTransform: 'uppercase',
          color: 'var(--color-text-tertiary, rgba(255,255,255,0.32))',
        }}>
          Email draft
        </span>
        {to && (
          <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary, rgba(255,255,255,0.32))' }}>
            To: {to}
          </span>
        )}
      </div>

      {/* ── Subject ── */}
      <div style={{ padding: '12px 14px 10px' }}>
        <div style={{
          fontSize: '14px', fontWeight: 500,
          color: 'var(--color-text-primary)',
          lineHeight: 1.4,
        }}>
          {subject}
        </div>
      </div>

      {/* ── Body — rendered markdown ── */}
      <div style={{
        padding: '0 14px 4px',
        maxHeight: '320px',
        overflowY: 'auto',
        borderTop: '0.5px solid var(--color-border-tertiary, rgba(255,255,255,0.07))',
      }}>
        <div style={{ paddingTop: '10px', paddingBottom: '10px' }}>
          <AgentChatMarkdown>{body}</AgentChatMarkdown>
        </div>
      </div>

      {/* ── Action row ── */}
      <div style={{
        display: 'flex', gap: '2px', padding: '8px 10px',
        borderTop: '0.5px solid var(--color-border-tertiary, rgba(255,255,255,0.07))',
        background: 'var(--color-background-tertiary, rgba(0,0,0,0.15))',
      }}>
        <Btn icon="copy" onClick={handleCopy}>{copyLabel}</Btn>
        <Btn icon="mail" onClick={handleOpenInMail}>Open in Mail</Btn>
        <Btn
          icon="send"
          onClick={handleSend}
          disabled={sendState !== 'idle'}
          faded={sendState !== 'idle'}
        >
          {sendState === 'idle'    && 'Send via Resend'}
          {sendState === 'sending' && 'Sending…'}
          {sendState === 'sent'    && 'Sent ✓'}
          {sendState === 'failed'  && 'Failed — retry?'}
        </Btn>
      </div>
    </div>
  );
}

function Btn({ icon, onClick, disabled, faded, children }: {
  icon: string; onClick: () => void;
  disabled?: boolean; faded?: boolean;
  children: React.ReactNode;
}) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: '5px',
        fontSize: '12px', padding: '5px 9px', borderRadius: '7px',
        border: 'none', cursor: disabled ? 'default' : 'pointer',
        background: hov && !disabled
          ? 'var(--color-background-secondary, rgba(255,255,255,0.07))'
          : 'transparent',
        color: faded
          ? 'var(--color-text-tertiary, rgba(255,255,255,0.3))'
          : 'var(--color-text-secondary)',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      <i className={`ti ti-${icon}`} aria-hidden="true" style={{ fontSize: '14px' }} />
      {children}
    </button>
  );
}
"""

CARD.parent.mkdir(parents=True, exist_ok=True)
if CARD.exists():
    bak(CARD)
CARD.write_text(CARD_CONTENT, 'utf-8')
print(f"  ✅  Written: {CARD.relative_to(ROOT)}\n")

# ── Step 2 — FIX AgentMessageList.tsx ─────────────────────────────────────────
print("── Step 2: AgentMessageList.tsx (fixed JSX anchor)")
SENTINEL_ML = 'EmailArtifactCard'
IMPORT_ML   = "import { EmailArtifactCard } from '../artifacts/EmailArtifactCard';\n"
EMAIL_JSX   = [
    "                  {msg.emailArtifact ? (\n",
    "                    <div className=\"mb-3\">\n",
    "                      <EmailArtifactCard artifact={msg.emailArtifact} />\n",
    "                    </div>\n",
    "                  ) : null}\n",
]

lines = read(MSGLIST)
if has(lines, SENTINEL_ML):
    print("  ⏭   Already patched\n")
else:
    bak(MSGLIST)
    # Find JSX usage — skip the import line by requiring the < prefix
    jsx_idx = find(lines, '<AgentImageGenerationCard')
    if jsx_idx == -1:
        print("  ❌  <AgentImageGenerationCard not found"); sys.exit(1)

    # Find ) : null} within 15 lines after the component
    close_idx = next(
        (i for i in range(jsx_idx, min(jsx_idx + 15, len(lines))) if ') : null}' in lines[i]),
        -1
    )
    if close_idx == -1:
        print("  ❌  closing ) : null} not found"); sys.exit(1)

    lines = lines[:close_idx + 1] + EMAIL_JSX + lines[close_idx + 1:]

    # Add import after last import line
    last_imp = max(i for i, l in enumerate(lines) if l.strip().startswith('import '))
    if not has(lines, 'EmailArtifactCard'):
        lines = lines[:last_imp + 1] + [IMPORT_ML] + lines[last_imp + 1:]

    write(MSGLIST, lines)
    print(f"  ✅  Patched: {MSGLIST.relative_to(ROOT)}")
    print(f"       JSX insertion after line {close_idx + 1}\n")

# ── Step 3 — ADD text-detection fallback in useAgentChatStream.ts ─────────────
print("── Step 3: useAgentChatStream.ts (text-pattern email detection on done)")
SENTINEL_TD = 'emailArtifactFromText'

# Exact anchor from Cursor output — the done block
DONE_ANCHOR  = "if (evType === 'done') {"
DONE_FINALIZE = "streamFinalizedRef.current = true;\n            setIsLoading(false);"
DONE_CONTINUE = "          continue;\n        }"

DETECTION_BLOCK = """\
          // emailArtifactFromText: render email card from assistant text, no tool call needed
          try {
            const _subjMatch = assistantContent.match(/^subject[:\\s]+(.+)$/im);
            if (_subjMatch && assistantContent.length > 100) {
              const _subj = _subjMatch[1].trim();
              const _subjLineEnd = assistantContent.indexOf(_subjMatch[0]) + _subjMatch[0].length;
              const _body = assistantContent.slice(_subjLineEnd).replace(/^[\\n\\r]+/, '').trim();
              const _toMatch = assistantContent.match(/^to[:\\s]+([^\\n]+)/im);
              const _to = _toMatch ? _toMatch[1].trim() : undefined;
              if (_body.length > 20) {
                setMessages((prev) => {
                  const _last = [...prev];
                  const _lm = _last[_last.length - 1];
                  if (_lm && _lm.role === 'assistant' && !_lm.emailArtifact) {
                    _last[_last.length - 1] = {
                      ..._lm,
                      emailArtifact: { subject: _subj, body: _body, to: _to },
                    };
                  }
                  return _last;
                });
              }
            }
          } catch (_) { /* non-fatal */ }
"""

lines = read(STREAM)
if has(lines, SENTINEL_TD):
    print("  ⏭   Already patched\n")
else:
    bak(STREAM)
    # Find the done block, then find setIsLoading(false) inside it, insert detection after it
    done_idx = find(lines, DONE_ANCHOR)
    if done_idx == -1:
        print("  ❌  done block anchor not found"); sys.exit(1)

    # Find the continue; that closes this done block (within 20 lines)
    cont_idx = -1
    brace_depth = 0
    for i in range(done_idx, min(done_idx + 20, len(lines))):
        if '{' in lines[i]: brace_depth += lines[i].count('{')
        if '}' in lines[i]: brace_depth -= lines[i].count('}')
        if 'continue;' in lines[i] and brace_depth <= 1:
            cont_idx = i
            break

    if cont_idx == -1:
        print("  ❌  continue; not found in done block"); sys.exit(1)

    detect_lines = DETECTION_BLOCK.splitlines(keepends=True)
    lines = lines[:cont_idx] + detect_lines + lines[cont_idx:]
    write(STREAM, lines)
    print(f"  ✅  Patched: {STREAM.relative_to(ROOT)}")
    print(f"       Detection block inserted before line {cont_idx + 1}\n")

# ── Step 4 — Git, push, deploy ─────────────────────────────────────────────────
print("── Step 4: Git status")
r = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
print(r.stdout or '  (clean)\n')

print("── Commit")
subprocess.run(['git', 'add', '-A'], check=True)
r = subprocess.run(['git', 'commit', '-m',
    'feat(chat): email artifact v2 — markdown body, text-pattern detection, Claude-level card'],
    capture_output=True, text=True)
print(r.stdout or r.stderr)

print("── Push")
r = subprocess.run(['git', 'push', 'origin', 'main'], capture_output=True, text=True)
print(r.stdout or r.stderr)

print("── Deploy")
r = subprocess.run(['npm', 'run', 'deploy:full'], capture_output=True, text=True)
out = (r.stdout or '') + (r.stderr or '')
print(out[-2500:] if len(out) > 2500 else out)
print("  ✅  Deploy succeeded" if r.returncode == 0 else "  ❌  Deploy failed")

print("\n── Final status")
r = subprocess.run(['git', 'status', '--short'], capture_output=True, text=True)
print(r.stdout or '  ✅  Clean')

print("\n🚀  https://inneranimalmedia.com/dashboard/agent")
print("    Prompt: 'draft me a plain text onboarding email for Companions of CPAS'")
print("    Expected: email card renders below response with formatted body + action row")
