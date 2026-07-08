/**
 * MailPage.tsx — IAM Dashboard Mail
 * Multi-account (Gmail + Resend), full CRUD, Agent Sam AI panel (Gemini-driven via D1 subagent profiles).
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { CollaborateWorkShell } from '../src/components/collaborate/CollaborateWorkShell';
import { CollaboratePageRail } from '../src/components/collaborate/CollaboratePageRail';
import { MailTimeInsightsPanel } from '../src/components/collaborate/MailTimeInsightsPanel';
import '../pages/launch-desk/collaborate-calendar.css';
import '../src/components/collaborate/mail-work-surface.css';
import {
  Archive, Bot, ChevronLeft, ChevronRight, Circle, Clock,
  Forward, Inbox, Mail, Paperclip, Plus, RefreshCw, Reply,
  Search, Send, Settings, Star, Tag, Trash2, X, Zap,
  CheckCircle, AlertTriangle, Filter, MoreHorizontal, Sparkles,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: string;           // 'gmail' | 'resend' | 'platform'
  label: string;
  address: string;
  provider: 'gmail' | 'resend' | 'platform';
  connected: boolean;
}

interface Email {
  id: string;
  from_address: string;
  to_address: string;
  subject: string;
  date_received: string;
  is_read: number;
  is_starred: number;
  is_archived: number;
  category?: string;
  has_attachments: number;
  account?: string;
}

interface EmailDetail {
  email: Email & { metadata?: Record<string, unknown> };
  body: string | null;
  attachments: { id: string; filename: string; content_type: string; size: number }[];
  thread: Email[];
}

interface ComposeState {
  from: string;
  to: string;
  subject: string;
  body: string;
  template_id: string;
  reply_to: string;
  in_reply_to: string;
  thread_id: string;
}

interface AgentResult {
  loading: boolean;
  action: string;
  result: Record<string, unknown> | null;
  error: string | null;
  model: string;
  agent_name: string;
}

type Folder = 'inbox' | 'starred' | 'archived' | 'sent' | 'templates';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(addr: string) {
  const s = String(addr || '').trim();
  if (!s) return '??';
  const base = s.includes('<') ? s.split('<')[0].trim() : s;
  const parts = base.replace(/['"]/g, '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function avatarColor(addr: string): string {
  const palette = ['var(--solar-cyan)', 'var(--solar-yellow)', 'var(--solar-orange)', '#8b5cf6', '#06b6d4'];
  return palette[(String(addr || '').trim().toLowerCase().charCodeAt(0) || 0) % palette.length];
}

function fmtDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function fmtSize(bytes: number) {
  const n = Number(bytes || 0);
  if (!isFinite(n) || n <= 0) return '—';
  const kb = n / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function isHtml(body: string) {
  const s = body.trim();
  return s.startsWith('<') || /<html[\s>]|<body[\s>]|<div[\s>]/i.test(s);
}

function accountQuery(activeAccount: string) {
  if (!activeAccount || activeAccount === 'all') return '';
  const acct = activeAccount.startsWith('gmail:') ? activeAccount.slice(6) : activeAccount;
  return `?account=${encodeURIComponent(acct)}`;
}

function EmailHtmlPreview({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resize = useCallback(() => {
    const frame = iframeRef.current;
    if (!frame?.contentDocument?.body) return;
    frame.style.height = `${Math.max(frame.contentDocument.body.scrollHeight + 24, 320)}px`;
  }, []);
  useEffect(() => {
    resize();
    const t = window.setTimeout(resize, 120);
    return () => window.clearTimeout(t);
  }, [html, resize]);
  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      sandbox="allow-same-origin"
      onLoad={resize}
      title="email-body"
      style={{
        width: '100%',
        minHeight: 320,
        flex: 1,
        border: 'none',
        background: '#fff',
        borderRadius: 8,
        display: 'block',
      }}
    />
  );
}

const SIDEBAR_MIN = 160; const SIDEBAR_MAX = 340;
const DETAIL_MIN = 300;  const DETAIL_MAX = 740;

// ─── Sub-components ───────────────────────────────────────────────────────────

function Btn({ onClick, title, children, active = false, danger = false, small = false }:
  { onClick: () => void; title?: string; children: React.ReactNode; active?: boolean; danger?: boolean; small?: boolean }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      gap: 6, height: small ? 28 : 32, padding: small ? '0 8px' : '0 12px',
      borderRadius: 8, border: '1px solid var(--border-subtle)',
      background: active ? 'var(--bg-hover)' : 'transparent',
      color: danger ? 'var(--solar-orange)' : active ? 'var(--text-main)' : 'var(--text-muted)',
      fontSize: small ? 11 : 12, fontWeight: 700, cursor: 'pointer',
      transition: 'background 0.12s, color 0.12s',
    }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = danger ? '#ef4444' : 'var(--text-main)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = active ? 'var(--bg-hover)' : 'transparent'; (e.currentTarget as HTMLElement).style.color = danger ? 'var(--solar-orange)' : active ? 'var(--text-main)' : 'var(--text-muted)'; }}
    >{children}</button>
  );
}

function UrgencyBadge({ urgency }: { urgency: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    critical: { bg: '#ef4444', label: 'Critical' },
    high:     { bg: 'var(--solar-orange)', label: 'High' },
    normal:   { bg: 'var(--solar-cyan)', label: 'Normal' },
    low:      { bg: 'var(--text-muted)', label: 'Low' },
    fyi:      { bg: '#8b5cf6', label: 'FYI' },
  };
  const s = map[String(urgency || '').toLowerCase()] || map.normal;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 18, padding: '0 7px', borderRadius: 99, background: s.bg + '22', color: s.bg, fontSize: 10, fontWeight: 800, letterSpacing: 0.4 }}>
      {s.label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MailPage() {
  const navigate = useNavigate();
  const [insightsOpen, setInsightsOpen] = useState(false);

  // Panels
  const [sidebarW, setSidebarW] = useState(() => {
    try { return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Number(localStorage.getItem('mail_sidebar_w') || 220))); } catch { return 220; }
  });
  const [detailW, setDetailW] = useState(() => {
    try { return Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, Number(localStorage.getItem('mail_detail_w') || 460))); } catch { return 460; }
  });
  const resizingRef = useRef<{ panel: 'sidebar' | 'detail'; startX: number; startW: number } | null>(null);

  // Accounts
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeAccount, setActiveAccount] = useState<string>('');

  // Email state
  const [folder, setFolder] = useState<Folder>('inbox');
  const [emails, setEmails] = useState<Email[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selected, setSelected] = useState<Email | null>(null);
  const [detail, setDetail] = useState<EmailDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState({ total: 0, unread: 0, starred: 0 });

  // Compose
  const [composing, setComposing] = useState(false);
  const [compose, setCompose] = useState<ComposeState>({
    from: '', to: '', subject: '', body: '', template_id: '', reply_to: '', in_reply_to: '', thread_id: '',
  });
  const [senders, setSenders] = useState<{ id: string; address: string; label?: string }[]>([]);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Agent Sam AI
  const [mailSurface, setMailSurface] = useState<'folders' | 'agentsam'>('folders');
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentInstruction, setAgentInstruction] = useState('');
  const [agent, setAgent] = useState<AgentResult>({ loading: false, action: '', result: null, error: null, model: '', agent_name: '' });

  // ── Load accounts (Gmail status + Resend senders) ──────────────────────────
  const loadAccounts = useCallback(async () => {
    const accs: Account[] = [];
    try {
      const gmailRes = await fetch('/api/mail/gmail/accounts', { credentials: 'same-origin' });
      if (gmailRes.ok) {
        const gd = await gmailRes.json();
        for (const g of gd.accounts || []) {
          const addr = String(g.address || g.id || '').trim();
          if (!addr) continue;
          accs.push({
            id: `gmail:${addr}`,
            label: 'Gmail',
            address: addr,
            provider: 'gmail',
            connected: true,
          });
        }
      }
    } catch { /* skip */ }
    if (accs.length === 0) {
      try {
        const statusRes = await fetch('/api/mail/gmail/status', { credentials: 'same-origin' });
        if (statusRes.ok) {
          const gd = await statusRes.json();
          if (gd.connected && gd.account) {
            accs.push({
              id: `gmail:${gd.account}`,
              label: 'Gmail',
              address: gd.account,
              provider: 'gmail',
              connected: true,
            });
          }
        }
      } catch { /* skip */ }
    }
    try {
      const sRes = await fetch('/api/mail/senders', { credentials: 'same-origin' });
      if (sRes.ok) {
        const sd = await sRes.json();
        setSenders(sd.senders || []);
        for (const s of sd.senders || []) {
          if (s.purpose !== 'gmail') {
            accs.push({ id: s.id, label: s.label || 'Resend', address: s.address, provider: 'resend', connected: true });
          }
        }
      }
    } catch { /* skip */ }
    setAccounts(accs);
    if (accs.length === 0) {
      setAccounts([{ id: 'platform', label: 'Platform', address: '', provider: 'platform', connected: true }]);
      setActiveAccount('platform');
    } else {
      setActiveAccount((prev) => (prev && accs.some((a) => a.id === prev) ? prev : accs[0].id));
    }
  }, []);

  // ── Load emails ────────────────────────────────────────────────────────────
  const loadEmails = useCallback(async () => {
    setLoadingList(true);
    try {
      const qs = accountQuery(activeAccount);
      const endpoint = folder === 'sent' ? '/api/mail/sent' : `/api/mail/${folder}`;
      const res = await fetch(`${endpoint}${qs}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      const list: Email[] = data.emails || [];
      setEmails(list);
      setStats(s => ({ ...s, total: data.total ?? list.length, unread: data.unread_count ?? s.unread }));
    } catch { setEmails([]); }
    finally { setLoadingList(false); }
  }, [folder, activeAccount]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/mail/stats${accountQuery(activeAccount)}`, { credentials: 'same-origin' });
      if (res.ok) { const d = await res.json(); setStats({ total: d.total, unread: d.unread, starred: d.starred }); }
    } catch { /* skip */ }
  }, [activeAccount]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadEmails(); loadStats(); setSelected(null); setDetail(null); }, [folder, activeAccount, loadEmails, loadStats]);

  // ── Load email detail ──────────────────────────────────────────────────────
  const openEmail = useCallback(async (email: Email) => {
    setSelected(email);
    setDetail(null);
    setAgent(a => ({ ...a, result: null, error: null }));
    setLoadingDetail(true);
    try {
      const acctQs = email.account ? `?account=${encodeURIComponent(email.account)}` : accountQuery(activeAccount);
      const res = await fetch(`/api/mail/email/${encodeURIComponent(email.id)}${acctQs}`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setDetail(d);
      if (!email.is_read) {
        setEmails(prev => prev.map(e => e.id === email.id ? { ...e, is_read: 1 } : e));
        const patchAcct = email.account || (activeAccount !== 'all' ? activeAccount.replace(/^gmail:/, '') : '');
        fetch(`/api/mail/email/${encodeURIComponent(email.id)}`, {
          method: 'PATCH', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_read: 1, ...(patchAcct ? { account: patchAcct } : {}) }),
        }).catch(() => {});
      }
    } catch { /* show error in detail */ }
    finally { setLoadingDetail(false); }
  }, [activeAccount]);

  // ── CRUD ops ───────────────────────────────────────────────────────────────
  const patchEmail = useCallback(async (id: string, patch: Partial<Email>, account?: string) => {
    setEmails(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    if (selected?.id === id) setSelected(s => s ? { ...s, ...patch } : s);
    const acct = account || selected?.account || '';
    await fetch(`/api/mail/email/${encodeURIComponent(id)}`, {
      method: 'PATCH', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...patch, ...(acct ? { account: acct } : {}) }),
    }).catch(() => {});
  }, [selected]);

  const archiveEmail = useCallback(async (email: Email) => {
    await patchEmail(email.id, { is_archived: 1 }, email.account);
    setEmails(prev => prev.filter(e => e.id !== email.id));
    if (selected?.id === email.id) { setSelected(null); setDetail(null); }
  }, [patchEmail, selected]);

  const deleteEmail = useCallback(async (email: Email) => {
    const acctQs = email.account
      ? `?account=${encodeURIComponent(email.account)}`
      : accountQuery(activeAccount);
    await fetch(`/api/mail/email/${encodeURIComponent(email.id)}${acctQs}`, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    setEmails(prev => prev.filter(e => e.id !== email.id));
    if (selected?.id === email.id) { setSelected(null); setDetail(null); }
  }, [selected, activeAccount]);

  const toggleStar = useCallback((email: Email) => {
    patchEmail(email.id, { is_starred: email.is_starred ? 0 : 1 }, email.account);
  }, [patchEmail]);

  // ── Send ───────────────────────────────────────────────────────────────────
  const sendEmail = useCallback(async () => {
    if (!compose.to || !compose.subject) { setSendResult({ ok: false, msg: 'To and Subject required' }); return; }
    setSending(true); setSendResult(null);
    try {
      const provider = compose.from.includes('@gmail') || compose.from.includes('gmail') ? 'gmail' : 'resend';
      const res = await fetch('/api/mail/send', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          from: compose.from || undefined,
          to: compose.to,
          subject: compose.subject,
          html: compose.body.includes('<') ? compose.body : `<p>${compose.body.replace(/\n/g, '<br>')}</p>`,
          text: compose.body,
          in_reply_to: compose.in_reply_to || undefined,
          thread_id: compose.thread_id || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'Send failed');
      setSendResult({ ok: true, msg: `Sent via ${d.provider || provider}` });
      setTimeout(() => { setComposing(false); setSendResult(null); setCompose(c => ({ ...c, to: '', subject: '', body: '', in_reply_to: '', thread_id: '' })); }, 1800);
    } catch (e: unknown) {
      setSendResult({ ok: false, msg: String((e as Error).message || e) });
    }
    setSending(false);
  }, [compose]);

  // ── Draft reply shortcut ───────────────────────────────────────────────────
  const startReply = useCallback((email: Email, d: EmailDetail | null) => {
    const meta = d?.email?.metadata as Record<string, string> | undefined;
    setCompose(c => ({
      ...c,
      to: email.from_address,
      subject: email.subject.startsWith('Re:') ? email.subject : `Re: ${email.subject}`,
      body: '',
      in_reply_to: meta?.message_id || '',
      thread_id: meta?.thread_id || '',
    }));
    setComposing(true);
  }, []);

  // ── Agent Sam ──────────────────────────────────────────────────────────────
  const callAgent = useCallback(async (action: string, instruction?: string) => {
    if (!selected && action !== 'triage_inbox' && action !== 'custom') return;
    setAgent({ loading: true, action, result: null, error: null, model: '', agent_name: '' });
    try {
      const body: Record<string, unknown> = { action: action === 'custom' ? 'custom' : action };
      const instr = instruction?.trim();
      if (instr) body.instruction = instr;
      if (action === 'triage_inbox') {
        body.emails = emails.slice(0, 30).map(e => ({
          id: e.id, subject: e.subject,
          from: e.from_address, preview: e.subject,
          date: e.date_received, is_read: e.is_read,
        }));
      } else {
        body.email = selected;
        body.thread = detail?.thread || [];
        if (detail?.body) body.email = { ...selected, body_preview: detail.body.slice(0, 3000) };
      }
      const res = await fetch('/api/mail/agent', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) throw new Error(d.error || 'Agent error');
      setAgent({ loading: false, action, result: d.result, error: null, model: d.model, agent_name: d.agent_name });
    } catch (e: unknown) {
      setAgent(a => ({ ...a, loading: false, error: String((e as Error).message || e) }));
    }
  }, [selected, detail, emails]);

  // ── Copy drafted body to compose ──────────────────────────────────────────
  const useAgentDraft = useCallback(() => {
    if (!agent.result) return;
    const r = agent.result as Record<string, string>;
    setCompose(c => ({
      ...c,
      subject: r.subject || c.subject,
      body: r.body_text || r.body_html || c.body,
    }));
    setComposing(true);
  }, [agent.result]);

  const renderAgentResult = useCallback((r: Record<string, unknown>) => (
    <div style={{ padding: '10px 14px', fontSize: 12, lineHeight: 1.6 }}>
      {r.summary && <p style={{ margin: '0 0 8px', color: 'var(--text-main)' }}>{String(r.summary)}</p>}
      {r.urgency && <div style={{ marginBottom: 6, display: 'flex', gap: 6, alignItems: 'center' }}><span style={{ color: 'var(--text-muted)', fontSize: 11 }}>Urgency:</span><UrgencyBadge urgency={String(r.urgency)} /></div>}
      {r.type && <div style={{ marginBottom: 6, fontSize: 11 }}><span style={{ color: 'var(--text-muted)' }}>Type: </span><span style={{ fontWeight: 700 }}>{String(r.type)}</span></div>}
      {Array.isArray(r.action_items) && r.action_items.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Action items</div>
          <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
            {(r.action_items as string[]).map((a, i) => <li key={i} style={{ marginBottom: 2 }}>{a}</li>)}
          </ul>
        </div>
      )}
      {Array.isArray(r.priorities) && r.priorities.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Priority inbox</div>
          <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
            {(r.priorities as { subject?: string; reason?: string }[]).map((p, i) => (
              <li key={i} style={{ marginBottom: 4 }}><strong>{p.subject || 'Message'}</strong>{p.reason ? ` — ${p.reason}` : ''}</li>
            ))}
          </ul>
        </div>
      )}
      {(r.body_text || r.subject) && (
        <div style={{ marginTop: 8, padding: 10, background: 'var(--bg-app)', borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
          {r.subject && <div style={{ fontWeight: 800, marginBottom: 4 }}>Subject: {String(r.subject)}</div>}
          <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)' }}>{String(r.body_text || '')}</div>
          <Btn onClick={useAgentDraft} small><CheckCircle size={11} />Use this draft</Btn>
        </div>
      )}
      {r.raw && <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{String(r.raw).slice(0, 1200)}</div>}
      {r.reply && <div style={{ marginTop: 8, whiteSpace: 'pre-wrap', color: 'var(--text-main)' }}>{String(r.reply)}</div>}
    </div>
  ), [useAgentDraft]);

  // ── Panel resize ───────────────────────────────────────────────────────────
  const startResize = useCallback((panel: 'sidebar' | 'detail', e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    resizingRef.current = { panel, startX: e.clientX, startW: panel === 'sidebar' ? sidebarW : detailW };
  }, [sidebarW, detailW]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      const dx = e.clientX - r.startX;
      if (r.panel === 'sidebar') {
        const w = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, r.startW + dx));
        setSidebarW(w);
        try { localStorage.setItem('mail_sidebar_w', String(w)); } catch {}
      } else {
        const w = Math.min(DETAIL_MAX, Math.max(DETAIL_MIN, r.startW - dx));
        setDetailW(w);
        try { localStorage.setItem('mail_detail_w', String(w)); } catch {}
      }
    };
    const up = () => { resizingRef.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, []);

  // ── Filtered email list ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? emails.filter(e =>
      e.from_address.toLowerCase().includes(q) ||
      e.subject.toLowerCase().includes(q) ||
      (e.to_address || '').toLowerCase().includes(q)
    ) : emails;
  }, [emails, search]);

  const FOLDERS: { id: Folder; label: string; icon: React.ReactNode }[] = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={14} /> },
    { id: 'starred', label: 'Starred', icon: <Star size={14} /> },
    { id: 'sent', label: 'Sent', icon: <Send size={14} /> },
    { id: 'archived', label: 'Archived', icon: <Archive size={14} /> },
  ];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <CollaborateWorkShell surface="mail">
    <div className={`mail-work-surface${insightsOpen ? ' insights-open' : ''}`}>
    <div className="mail-work-surface-main">

      {/* ── LEFT SIDEBAR ────────────────────────────────────────────────── */}
      <div className="mail-sidebar" style={{ width: sidebarW, minWidth: SIDEBAR_MIN, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              <Btn onClick={() => { loadEmails(); loadStats(); }} title="Refresh" small><RefreshCw size={13} /></Btn>
              <Btn onClick={() => { setComposing(true); setCompose(c => ({ ...c, to: '', subject: '', body: '' })); }} title="Compose" small><Plus size={13} />Compose</Btn>
            </div>
          </div>

          {/* Account switcher */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button type="button" onClick={() => setActiveAccount('all')} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 8px', borderRadius: 7, border: 'none', background: activeAccount === 'all' ? 'var(--bg-hover)' : 'transparent', color: 'var(--text-main)', fontSize: 11, fontWeight: activeAccount === 'all' ? 800 : 500, cursor: 'pointer', textAlign: 'left', flex: 1, minWidth: 0 }}>
                <Mail size={12} style={{ color: 'var(--solar-cyan)', flexShrink: 0 }} />All accounts
              </button>
              <a href="/api/integrations/gmail/connect?return_to=%2Fdashboard%2Fmail" title="Connect another Gmail account" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 7, background: 'var(--bg-hover)', color: 'var(--solar-cyan)', textDecoration: 'none', flexShrink: 0 }}>
                <Plus size={13} />
              </a>
            </div>
            {accounts.map(acc => (
              <button key={acc.id} type="button" onClick={() => setActiveAccount(acc.id)} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28, padding: '0 8px', borderRadius: 7, border: 'none', background: activeAccount === acc.id ? 'var(--bg-hover)' : 'transparent', color: acc.connected ? 'var(--text-main)' : 'var(--text-muted)', fontSize: 11, fontWeight: activeAccount === acc.id ? 800 : 400, cursor: 'pointer', textAlign: 'left', width: '100%', overflow: 'hidden' }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: acc.connected ? 'var(--solar-cyan)' : 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {acc.label}{acc.address ? ` · ${acc.address.split('@')[0]}` : ''}
                </span>
              </button>
            ))}
            {!accounts.some(a => a.provider === 'gmail' && a.connected) && (
              <a href="/api/integrations/gmail/connect?return_to=%2Fdashboard%2Fmail" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', borderRadius: 7, background: 'var(--bg-hover)', color: 'var(--solar-cyan)', fontSize: 10, fontWeight: 700, textDecoration: 'none', marginTop: 2 }}>
                <Plus size={11} />Connect Gmail
              </a>
            )}
          </div>
        </div>

        {/* Folders */}
        <div style={{ padding: '8px 8px 4px', flexShrink: 0 }}>
          {FOLDERS.map(f => (
            <button key={f.id} type="button" onClick={() => { setMailSurface('folders'); setFolder(f.id); }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 32, padding: '0 8px', borderRadius: 7, border: 'none', background: mailSurface === 'folders' && folder === f.id ? 'var(--bg-hover)' : 'transparent', color: mailSurface === 'folders' && folder === f.id ? 'var(--text-main)' : 'var(--text-muted)', fontSize: 12, fontWeight: mailSurface === 'folders' && folder === f.id ? 800 : 400, cursor: 'pointer', textAlign: 'left' }}>
              {f.icon}
              <span style={{ flex: 1 }}>{f.label}</span>
              {f.id === 'inbox' && stats.unread > 0 && (
                <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--solar-cyan)', color: '#000', borderRadius: 99, padding: '1px 6px' }}>{stats.unread}</span>
              )}
            </button>
          ))}
          <button
            type="button"
            className={mailSurface === 'agentsam' ? 'mail-agentsam-nav active' : 'mail-agentsam-nav'}
            onClick={() => { setMailSurface('agentsam'); setSelected(null); setDetail(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', height: 32,
              padding: '0 8px', borderRadius: 7, border: 'none', marginTop: 4,
              background: mailSurface === 'agentsam' ? undefined : 'transparent',
              color: mailSurface === 'agentsam' ? undefined : 'var(--text-muted)',
              fontSize: 12, fontWeight: mailSurface === 'agentsam' ? 800 : 600, cursor: 'pointer', textAlign: 'left',
            }}
          >
            <Bot size={14} />
            <span style={{ flex: 1 }}>AgentSam</span>
          </button>
        </div>

        {/* Stats footer */}
        <div style={{ marginTop: 'auto', padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', fontSize: 10, color: 'var(--text-muted)' }}>
          {stats.total} total · {stats.unread} unread · {stats.starred} starred
        </div>
      </div>

      {/* Sidebar resize handle */}
      <div onPointerDown={e => startResize('sidebar', e)} style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent', borderRight: '1px solid var(--border-subtle)' }} />

      {/* ── CENTER LIST ─────────────────────────────────────────────────── */}
      <div className="mail-list-pane" style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {mailSurface === 'agentsam' ? (
          <div className="mail-agentsam-pane" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="mail-agentsam-header" style={{ padding: '16px 18px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <Bot size={18} style={{ color: 'var(--solar-cyan)' }} />
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>AgentSam</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Agentic email assistant — triage, summarize, draft replies</div>
                </div>
                {agent.model && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px', borderRadius: 99, border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
                    {agent.model.split('/').pop()}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <Btn onClick={() => callAgent('triage_inbox')} small active={agent.action === 'triage_inbox' && agent.loading}>
                  <Sparkles size={11} />Triage inbox
                </Btn>
                <Btn onClick={() => selected && callAgent('summarize')} small>
                  <Sparkles size={11} />Summarize selected
                </Btn>
                <Btn onClick={() => selected && callAgent('draft_reply')} small>
                  <Zap size={11} />Draft reply
                </Btn>
              </div>
            </div>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-subtle)' }}>
              <textarea
                value={agentInstruction}
                onChange={e => setAgentInstruction(e.target.value)}
                placeholder="Ask AgentSam about your mail… e.g. “Summarize unread from clients this week”"
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-main)', fontSize: 12, padding: 10, resize: 'vertical', outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.5 }}
              />
              <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                <Btn
                  onClick={() => callAgent('custom', agentInstruction)}
                  small
                  active={agent.action === 'custom' && agent.loading}
                >
                  <Bot size={11} />Run
                </Btn>
              </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {agent.loading && (
                <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} />Thinking…
                </div>
              )}
              {agent.error && (
                <div style={{ padding: 16, color: '#ef4444', fontSize: 12, display: 'flex', gap: 6 }}>
                  <AlertTriangle size={13} />{agent.error}
                </div>
              )}
              {agent.result && !agent.loading && renderAgentResult(agent.result as Record<string, unknown>)}
              {!agent.loading && !agent.error && !agent.result && (
                <div style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6 }}>
                  Select a message in Inbox for per-email actions, or run <strong>Triage inbox</strong> to prioritize what needs attention.
                </div>
              )}
            </div>
          </div>
        ) : (
        <>
        {/* Toolbar */}
        <div className="mail-list-toolbar" style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px' }}>
          <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.1, textTransform: 'capitalize' }}>{folder}</span>
          <div style={{ flex: 1, position: 'relative', maxWidth: 280 }}>
            <Search size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: '100%', height: 30, padding: '0 9px 0 28px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, color: 'var(--text-main)', fontSize: 12, outline: 'none' }} />
          </div>
          {loadingList && <RefreshCw size={13} style={{ color: 'var(--text-muted)', animation: 'spin 0.8s linear infinite' }} />}
        </div>

        {/* Email list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.length === 0 && !loadingList && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No messages</div>
          )}
          {filtered.map(email => (
            <div key={email.id} onClick={() => openEmail(email)} className={`mail-list-row${selected?.id === email.id ? ' is-selected' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', transition: 'background 0.1s', userSelect: 'none' }}>
              {/* Avatar */}
              <div style={{ width: 34, height: 34, borderRadius: 99, background: avatarColor(email.from_address), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: '#000', flexShrink: 0 }}>
                {initials(email.from_address)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: email.is_read ? 500 : 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{email.from_address.split('<')[0].trim() || email.from_address}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>{fmtDate(email.date_received)}</span>
                </div>
                <div style={{ fontSize: 11, fontWeight: email.is_read ? 400 : 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: email.is_read ? 'var(--text-muted)' : 'var(--text-main)', marginBottom: 2 }}>{email.subject || '(no subject)'}</div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  {!email.is_read && <span style={{ width: 6, height: 6, borderRadius: 99, background: 'var(--solar-cyan)' }} />}
                  {email.is_starred === 1 && <Star size={10} style={{ color: 'var(--solar-yellow)', fill: 'var(--solar-yellow)' }} />}
                  {email.has_attachments === 1 && <Paperclip size={10} style={{ color: 'var(--text-muted)' }} />}
                  {email.category && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}>{email.category}</span>}
                </div>
              </div>
              {/* Row actions */}
              <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                <button type="button" title="Star" onClick={() => toggleStar(email)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: email.is_starred ? 'var(--solar-yellow)' : 'var(--text-muted)', padding: 3, borderRadius: 5 }}>
                  <Star size={13} style={{ fill: email.is_starred ? 'var(--solar-yellow)' : 'none' }} />
                </button>
                <button type="button" title="Archive" onClick={() => archiveEmail(email)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 3, borderRadius: 5 }}>
                  <Archive size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
        </>
        )}
      </div>

      {/* ── DETAIL PANEL ───────────────────────────────────────────────── */}
      {selected && mailSurface === 'folders' && (
        <>
          {/* Detail resize handle */}
          <div onPointerDown={e => startResize('detail', e)} style={{ width: 5, flexShrink: 0, cursor: 'col-resize', background: 'transparent', borderLeft: '1px solid var(--border-subtle)' }} />

          <div className="mail-detail-pane" style={{ width: detailW, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Detail header */}
            <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <button type="button" onClick={() => { setSelected(null); setDetail(null); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, borderRadius: 6 }}><ChevronLeft size={16} /></button>
              <div style={{ flex: 1 }} />
              <Btn onClick={() => startReply(selected, detail)} small><Reply size={12} />Reply</Btn>
              <Btn onClick={() => { setCompose(c => ({ ...c, to: '', subject: `Fwd: ${selected.subject}`, body: detail?.body ? `\n\n--- Forwarded ---\n${detail.body}` : '' })); setComposing(true); }} small><Forward size={12} />Forward</Btn>
              <Btn onClick={() => toggleStar(selected)} small active={selected.is_starred === 1}><Star size={12} style={{ fill: selected.is_starred ? 'var(--solar-yellow)' : 'none', color: selected.is_starred ? 'var(--solar-yellow)' : undefined }} /></Btn>
              <Btn onClick={() => archiveEmail(selected)} small><Archive size={12} /></Btn>
              <Btn onClick={() => deleteEmail(selected)} small danger><Trash2 size={12} /></Btn>
              <Btn onClick={() => { setAgentOpen(o => !o); }} small active={agentOpen}><Sparkles size={12} />AI</Btn>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* Subject */}
              <div style={{ padding: '16px 18px 10px' }}>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8, lineHeight: 1.35 }}>{selected.subject || '(no subject)'}</div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 11, color: 'var(--text-muted)' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{selected.from_address}</span>
                  <span>→ {selected.to_address || 'me'}</span>
                  <span style={{ marginLeft: 'auto' }}>{fmtDate(selected.date_received)}</span>
                </div>
              </div>

              {/* Agent Sam AI panel */}
              {agentOpen && (
                <div style={{ margin: '0 14px 10px', borderRadius: 10, border: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,255,200,0.06)' }}>
                    <Bot size={14} style={{ color: 'var(--solar-cyan)' }} />
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--solar-cyan)' }}>Agent Sam</span>
                    {agent.agent_name && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>· {agent.agent_name}</span>}
                    {agent.model && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 99, background: 'var(--bg-app)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)', marginLeft: 'auto' }}>{agent.model.split('/').pop()}</span>}
                  </div>
                  <div style={{ padding: '10px 14px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {['summarize', 'classify', 'draft_reply'].map(act => (
                      <Btn key={act} onClick={() => callAgent(act)} small active={agent.action === act && !agent.loading}>
                        {act === 'summarize' && <><Sparkles size={11} />Summarize</>}
                        {act === 'classify' && <><Tag size={11} />Classify</>}
                        {act === 'draft_reply' && <><Zap size={11} />Draft Reply</>}
                      </Btn>
                    ))}
                  </div>
                  {agent.loading && (
                    <div style={{ padding: '10px 14px', color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <RefreshCw size={13} style={{ animation: 'spin 0.8s linear infinite' }} />Thinking…
                    </div>
                  )}
                  {agent.error && (
                    <div style={{ padding: '10px 14px', color: '#ef4444', fontSize: 12, display: 'flex', gap: 6 }}>
                      <AlertTriangle size={13} />{agent.error}
                    </div>
                  )}
                  {agent.result && !agent.loading && renderAgentResult(agent.result as Record<string, unknown>)}
                </div>
              )}

              {/* Body */}
              {loadingDetail && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>
              )}
              {detail && (
                <div style={{ padding: '0 18px 18px', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                  {detail.body ? (
                    isHtml(detail.body) ? (
                      <EmailHtmlPreview html={detail.body} />
                    ) : (
                      <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13, lineHeight: 1.7, color: 'var(--text-main)', margin: 0, flex: 1 }}>{detail.body}</pre>
                    )
                  ) : (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '12px 0' }}>No body content</div>
                  )}

                  {/* Attachments */}
                  {detail.attachments.length > 0 && (
                    <div style={{ marginTop: 16, flexShrink: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Attachments ({detail.attachments.length})</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {detail.attachments.map(att => (
                          <a
                            key={att.id}
                            href={`/api/mail/attachment/${encodeURIComponent(selected.id)}/${encodeURIComponent(att.id)}${selected.account ? `?account=${encodeURIComponent(selected.account)}` : ''}`}
                            download={att.filename}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-main)', textDecoration: 'none' }}
                          >
                            <Paperclip size={11} />
                            <span>{att.filename}</span>
                            <span style={{ color: 'var(--text-muted)' }}>{fmtSize(att.size)}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Thread */}
                  {detail.thread.length > 1 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Thread ({detail.thread.length})</div>
                      {detail.thread.filter(t => t.id !== selected.id).map(t => (
                        <div key={t.id} style={{ padding: '8px 10px', background: 'var(--bg-elevated)', borderRadius: 8, border: '1px solid var(--border-subtle)', marginBottom: 6, fontSize: 11 }}>
                          <div style={{ fontWeight: 700, marginBottom: 2 }}>{t.from_address}</div>
                          <div style={{ color: 'var(--text-muted)' }}>{t.subject} · {fmtDate(t.date_received)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </>
      )}

    </div>

      {insightsOpen ? (
        <div className="mail-time-insights-rail">
          <MailTimeInsightsPanel />
        </div>
      ) : null}

      <CollaboratePageRail
        activeSurface="mail"
        insightsOpen={insightsOpen}
        onInsightsToggle={() => setInsightsOpen((v) => !v)}
        onTasksClick={() => navigate('/dashboard/collaborate?seg=tasks')}
      />

      {/* ── COMPOSE MODAL ──────────────────────────────────────────────── */}
      {composing && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 24, pointerEvents: 'none' }}>
          <div style={{ width: 520, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 14, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', overflow: 'hidden', pointerEvents: 'all', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,255,200,0.04)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, flex: 1 }}>New Message</span>
              <button type="button" onClick={() => setComposing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
            </div>
            <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {/* From */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 48, flexShrink: 0 }}>From</span>
                <select value={compose.from} onChange={e => setCompose(c => ({ ...c, from: e.target.value }))} style={{ flex: 1, height: 28, background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-main)', fontSize: 12, padding: '0 8px' }}>
                  <option value="">Platform default</option>
                  {senders.map(s => <option key={s.id} value={s.address}>{s.label ? `${s.label} <${s.address}>` : s.address}</option>)}
                </select>
              </div>
              {/* To */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 48, flexShrink: 0 }}>To</span>
                <input value={compose.to} onChange={e => setCompose(c => ({ ...c, to: e.target.value }))} placeholder="recipient@example.com" style={{ flex: 1, height: 28, background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-main)', fontSize: 12, padding: '0 8px', outline: 'none' }} />
              </div>
              {/* Subject */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', width: 48, flexShrink: 0 }}>Subject</span>
                <input value={compose.subject} onChange={e => setCompose(c => ({ ...c, subject: e.target.value }))} placeholder="Subject" style={{ flex: 1, height: 28, background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-main)', fontSize: 12, padding: '0 8px', outline: 'none' }} />
              </div>
              {/* Body */}
              <textarea value={compose.body} onChange={e => setCompose(c => ({ ...c, body: e.target.value }))} placeholder="Write your message…" rows={10} style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', borderRadius: 7, color: 'var(--text-main)', fontSize: 12, padding: '10px', resize: 'vertical', outline: 'none', fontFamily: 'var(--font-sans)', lineHeight: 1.6 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border-subtle)' }}>
              {sendResult && (
                <span style={{ fontSize: 11, color: sendResult.ok ? 'var(--solar-cyan)' : '#ef4444', flex: 1 }}>
                  {sendResult.ok ? <CheckCircle size={11} style={{ display: 'inline', marginRight: 4 }} /> : <AlertTriangle size={11} style={{ display: 'inline', marginRight: 4 }} />}
                  {sendResult.msg}
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <Btn onClick={() => setComposing(false)} small>Cancel</Btn>
                <Btn onClick={sendEmail} small active>{sending ? 'Sending…' : <><Send size={12} />Send</>}</Btn>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>
    </div>
    </CollaborateWorkShell>
  );
}

export default MailPage;
