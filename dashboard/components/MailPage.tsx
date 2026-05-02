import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail,
  Star,
  Archive,
  Trash2,
  Reply,
  Forward,
  Send,
  RefreshCw,
  ChevronLeft,
  Search,
  Plus,
  X,
  Paperclip,
  Circle,
  CheckCircle,
  Tag,
  Filter,
  Inbox,
  Clock,
} from 'lucide-react';

interface Email {
  id: string; from_address: string; to_address: string;
  subject: string; date_received: string; is_read: number;
  is_starred: number; is_archived: number; category?: string;
  has_attachments: number;
}

interface EmailDetail {
  email: Email & { metadata?: any };
  body: string | null;
  attachments: { id: string; filename: string; content_type: string; size: number }[];
  thread: Email[];
}

interface ComposeState {
  from: string; to: string; subject: string;
  body: string; template_id: string; reply_to: string;
}

type Folder = 'inbox' | 'starred' | 'archived' | 'sent' | 'templates';

type Sender = {
  id: string;
  address: string;
  display_name?: string;
  label?: string;
  purpose?: string;
};

type Template = {
  id: string;
  name: string;
  category?: string;
  subject?: string;
  variables?: string;
  is_active?: number;
};

function initials(addr: string) {
  const s = String(addr || '').trim();
  if (!s) return '??';
  const base = s.includes('<') ? s.split('<')[0].trim() : s;
  const parts = base.replace(/["']/g, '').split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (base.includes('@')) return base.slice(0, 2).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

function avatarColor(addr: string) {
  const c = String(addr || '').trim().toLowerCase().charCodeAt(0) || 0;
  const palette = [
    'var(--solar-cyan)',
    'var(--solar-yellow)',
    'var(--solar-orange)',
    '#8b5cf6',
    '#06b6d4',
  ];
  return palette[c % palette.length];
}

function fmtSize(bytes: number) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const kb = n / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${Math.round(mb * 10) / 10} MB`;
  const gb = mb / 1024;
  return `${Math.round(gb * 10) / 10} GB`;
}

function isLikelyHtml(body: string) {
  const s = body.trim();
  if (!s) return false;
  if (s.startsWith('<')) return true;
  return /<html[\s>]|<body[\s>]|<div[\s>]|<p[\s>]/i.test(s);
}

function fmtListDate(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (24 * 3600 * 1000));
  if (diffDays >= 0 && diffDays < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', year: '2-digit' });
}

function categoryBadgeStyle(category?: string) {
  const c = String(category || '').toLowerCase();
  if (c === 'inquiry') return { background: 'rgba(59,130,246,0.15)', color: '#60a5fa' };
  if (c === 'support') return { background: 'rgba(234,179,8,0.15)', color: 'var(--solar-yellow)' };
  if (c === 'spam') return { background: 'rgba(239,68,68,0.15)', color: 'var(--solar-red)' };
  if (c === 'newsletter') return { background: 'rgba(139,92,246,0.15)', color: '#a78bfa' };
  return { background: 'var(--bg-elevated)', color: 'var(--text-muted)' };
}

interface Toast { id: number; msg: string; type: 'ok' | 'err'; }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const add = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts(p => [...p, { id, msg, type }]);
    window.setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3400);
  }, []);
  const remove = useCallback((id: number) => {
    setToasts((p) => p.filter((t) => t.id !== id));
  }, []);
  return { toasts, add, remove };
}

function folderTitle(folder: Folder) {
  if (folder === 'inbox') return 'Inbox';
  if (folder === 'starred') return 'Starred';
  if (folder === 'archived') return 'Archived';
  if (folder === 'sent') return 'Sent';
  return 'Templates';
}

const styles = {
  outer: {
    display: 'flex',
    height: '100%',
    overflow: 'hidden',
    background: 'var(--bg-app)',
    color: 'var(--text-main)',
    fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  } as React.CSSProperties,
  sidebar: {
    width: 220,
    flexShrink: 0,
    background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  } as React.CSSProperties,
  center: {
    flex: 1,
    minWidth: 0,
    borderRight: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  } as React.CSSProperties,
  detail: {
    width: 440,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    background: 'var(--bg-app)',
  } as React.CSSProperties,
};

export function MailPage() {
  const [folder, setFolder] = useState<Folder>('inbox');
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [emailDetail, setEmailDetail] = useState<EmailDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [stats, setStats] = useState<{ total: number; unread: number; starred: number; categories: Array<{ category: string; count: number }> }>(
    { total: 0, unread: 0, starred: 0, categories: [] },
  );
  const [senders, setSenders] = useState<Sender[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [search, setSearch] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [gmailConnected, setGmailConnected] = useState<boolean | null>(null);
  const [gmailAccount, setGmailAccount] = useState<string | null>(null);
  const [composing, setComposing] = useState<ComposeState>({
    from: '',
    to: '',
    subject: '',
    body: '',
    template_id: '',
    reply_to: '',
  });
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [threadOpen, setThreadOpen] = useState(false);
  const { toasts, add: toast, remove: removeToast } = useToast();

  const detailAbortRef = useRef<AbortController | null>(null);
  const listAbortRef = useRef<AbortController | null>(null);

  const categories = useMemo(() => {
    const rows = Array.isArray(stats.categories) ? stats.categories : [];
    const cleaned = rows
      .filter((r) => r && typeof (r as any).count !== 'undefined')
      .map((r) => ({ category: String((r as any).category || '').trim(), count: Number((r as any).count || 0) }))
      .filter((r) => r.category);
    return cleaned.sort((a, b) => b.count - a.count);
  }, [stats.categories]);

  const filteredEmails = useMemo(() => {
    const q = search.trim().toLowerCase();
    const cat = filterCategory ? String(filterCategory).toLowerCase() : null;
    let list = emails;
    if (cat) list = list.filter((e) => String(e.category || '').toLowerCase() === cat);
    if (!q) return list;
    return list.filter((e) => {
      const f = String(e.from_address || '').toLowerCase();
      const s = String(e.subject || '').toLowerCase();
      return f.includes(q) || s.includes(q);
    });
  }, [emails, search, filterCategory]);

  const setFolderAndReset = useCallback((f: Folder) => {
    setFolder(f);
    setPage(1);
    setSearch('');
    setFilterCategory(null);
    setSelectedEmail(null);
    setEmailDetail(null);
    setThreadOpen(false);
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/mail/stats', { credentials: 'same-origin' });
      const d = await r.json().catch(() => null);
      if (r.ok && d) {
        setStats({
          total: Number(d.total || 0),
          unread: Number(d.unread || 0),
          starred: Number(d.starred || 0),
          categories: Array.isArray(d.categories) ? d.categories : [],
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadSenders = useCallback(async () => {
    try {
      const r = await fetch('/api/mail/senders', { credentials: 'same-origin' });
      const d = await r.json().catch(() => null);
      if (r.ok && d && Array.isArray(d.senders)) {
        const list = d.senders as Sender[];
        setSenders(list);
        setComposing((p) => (p.from ? p : { ...p, from: list?.[0]?.address || '' }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const r = await fetch('/api/mail/templates', { credentials: 'same-origin' });
      const d = await r.json().catch(() => null);
      if (r.ok && d && Array.isArray(d.templates)) {
        setTemplates(d.templates as Template[]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadSenders();
    void loadTemplates();
    void loadStats();
    (async () => {
      try {
        const r = await fetch('/api/mail/gmail/status', { credentials: 'same-origin' });
        const d = await r.json().catch(() => null);
        if (r.ok && d) {
          setGmailConnected(!!d.connected);
          setGmailAccount(d.account ? String(d.account) : null);
        } else {
          setGmailConnected(false);
          setGmailAccount(null);
        }
      } catch {
        setGmailConnected(false);
        setGmailAccount(null);
      }
    })();
  }, [loadSenders, loadTemplates, loadStats]);

  const loadFolder = useCallback(async () => {
    if (listAbortRef.current) listAbortRef.current.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;

    setLoading(true);
    setSendError(null);
    try {
      const qs = new URLSearchParams();
      if (page > 1) qs.set('page', String(page));
      if (folder === 'inbox' && filterCategory) qs.set('category', filterCategory);
      if (folder === 'inbox' && filterCategory == null && search.trim() && false) {
        // client side search only (no server query param)
      }

      let endpoint = '/api/mail/inbox';
      if (folder === 'starred') endpoint = '/api/mail/starred';
      if (folder === 'archived') endpoint = '/api/mail/archived';
      if (folder === 'sent') endpoint = '/api/mail/sent';
      if (folder === 'templates') endpoint = '/api/mail/templates';

      const url = qs.toString() ? `${endpoint}?${qs}` : endpoint;
      const r = await fetch(url, { credentials: 'same-origin', signal: ac.signal });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error((d && d.error) ? String(d.error) : `Request failed (${r.status})`);

      if (folder === 'templates') {
        const tpls: Template[] = Array.isArray(d?.templates) ? d.templates : [];
        setTemplates(tpls);
        setEmails([]);
        setTotal(tpls.length);
        setUnreadCount(0);
      } else if (folder === 'sent') {
        const rows = Array.isArray(d?.emails) ? d.emails : [];
        // Map sent logs into Email shape for list rendering.
        const mapped: Email[] = rows.map((x: any) => ({
          id: String(x.id || ''),
          from_address: String(x.from_address || ''),
          to_address: String(x.to_address || ''),
          subject: String(x.subject || ''),
          date_received: String(x.created_at || ''),
          is_read: 1,
          is_starred: 0,
          is_archived: 0,
          category: String(x.status || 'sent'),
          has_attachments: 0,
        })).filter((e: Email) => e.id);
        setEmails(mapped);
        setTotal(mapped.length);
        setUnreadCount(0);
      } else {
        setEmails(Array.isArray(d?.emails) ? d.emails : []);
        setTotal(Number(d?.total || 0));
        if (folder === 'inbox') setUnreadCount(Number(d?.unread_count || 0));
      }

      void loadStats();
    } catch (e: any) {
      if (String(e?.name || '') === 'AbortError') return;
      toast(String(e?.message || 'Failed to load mail'), 'err');
      setEmails([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [folder, page, filterCategory, toast, loadStats, search]);

  useEffect(() => {
    void loadFolder();
    return () => {
      if (listAbortRef.current) listAbortRef.current.abort();
    };
  }, [loadFolder]);

  useEffect(() => {
    if (!selectedEmail) {
      setEmailDetail(null);
      setThreadOpen(false);
      return;
    }

    if (folder === 'sent' || folder === 'templates') {
      setEmailDetail(null);
      setThreadOpen(false);
      return;
    }

    if (detailAbortRef.current) detailAbortRef.current.abort();
    const ac = new AbortController();
    detailAbortRef.current = ac;

    setDetailLoading(true);
    setSendError(null);
    (async () => {
      try {
        const r = await fetch(`/api/mail/email/${encodeURIComponent(selectedEmail.id)}`, { credentials: 'same-origin', signal: ac.signal });
        const d = await r.json().catch(() => null);
        if (!r.ok) throw new Error((d && d.error) ? String(d.error) : `Request failed (${r.status})`);
        setEmailDetail(d as EmailDetail);
        setEmails((prev) => prev.map((e) => (e.id === selectedEmail.id ? { ...e, is_read: 1 } : e)));
      } catch (e: any) {
        if (String(e?.name || '') === 'AbortError') return;
        toast(String(e?.message || 'Failed to load email'), 'err');
        setEmailDetail(null);
      } finally {
        setDetailLoading(false);
      }
    })();

    return () => {
      if (detailAbortRef.current) detailAbortRef.current.abort();
    };
  }, [selectedEmail, folder, toast]);

  const reload = useCallback(() => {
    void loadFolder();
    if (selectedEmail && folder !== 'sent' && folder !== 'templates') {
      setSelectedEmail((p) => (p ? { ...p } : p));
    }
  }, [loadFolder, selectedEmail, folder]);

  const toggleStar = useCallback(async (email: Email) => {
    const next = email.is_starred ? 0 : 1;
    setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, is_starred: next } : e)));
    try {
      const r = await fetch(`/api/mail/email/${encodeURIComponent(email.id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_starred: next }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(String((d as any)?.error || 'Failed to update'));
      }
      void loadStats();
    } catch (e: any) {
      setEmails((prev) => prev.map((e) => (e.id === email.id ? { ...e, is_starred: email.is_starred } : e)));
      toast(String(e?.message || 'Failed to update star'), 'err');
    }
  }, [toast, loadStats]);

  const archiveEmail = useCallback(async (id: string) => {
    const prev = emails;
    setEmails((p) => p.filter((e) => e.id !== id));
    if (selectedEmail?.id === id) {
      setSelectedEmail(null);
      setEmailDetail(null);
    }
    try {
      const r = await fetch(`/api/mail/email/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_archived: 1 }),
      });
      if (!r.ok) throw new Error('Failed to archive');
      void loadStats();
      if (folder === 'inbox') setUnreadCount((c) => Math.max(0, c - 1));
    } catch (e: any) {
      setEmails(prev);
      toast(String(e?.message || 'Failed to archive'), 'err');
    }
  }, [emails, selectedEmail, toast, folder, loadStats]);

  const deleteEmail = useCallback(async (id: string) => {
    const prev = emails;
    setEmails((p) => p.filter((e) => e.id !== id));
    if (selectedEmail?.id === id) {
      setSelectedEmail(null);
      setEmailDetail(null);
    }
    try {
      const r = await fetch(`/api/mail/email/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      if (!r.ok) throw new Error('Failed to delete');
      void loadStats();
    } catch (e: any) {
      setEmails(prev);
      toast(String(e?.message || 'Failed to delete'), 'err');
    }
  }, [emails, selectedEmail, toast, loadStats]);

  const openCompose = useCallback((seed?: Partial<ComposeState>) => {
    setSendError(null);
    setComposeOpen(true);
    setComposing((p) => ({
      from: p.from || senders?.[0]?.address || '',
      to: '',
      subject: '',
      body: '',
      template_id: '',
      reply_to: '',
      ...p,
      ...seed,
    }));
  }, [senders]);

  const openReply = useCallback(() => {
    if (!emailDetail?.email) return;
    const em = emailDetail.email;
    openCompose({
      to: String(em.from_address || ''),
      subject: `Re: ${String(em.subject || '').trim()}`,
      reply_to: (emailDetail as any)?.email?.message_id ? String((emailDetail as any).email.message_id) : (composing.reply_to || ''),
    });
  }, [emailDetail, openCompose, composing.reply_to]);

  const openForward = useCallback(() => {
    if (!emailDetail?.email) return;
    const em = emailDetail.email;
    openCompose({
      subject: `Fwd: ${String(em.subject || '').trim()}`,
      body: emailDetail.body ? `\n\n--- Forwarded message ---\nFrom: ${em.from_address}\nTo: ${em.to_address}\nSubject: ${em.subject}\n\n${emailDetail.body}` : '',
    });
  }, [emailDetail, openCompose]);

  const applyTemplateToCompose = useCallback(async (templateId: string) => {
    setComposing((p) => ({ ...p, template_id: templateId }));
    if (!templateId) return;

    // We don't have a template detail endpoint; use /api/mail/send with template_id later.
    const tpl = templates.find((t) => t.id === templateId);
    if (tpl?.subject && !composing.subject.trim()) {
      setComposing((p) => ({ ...p, subject: String(tpl.subject || '').trim() }));
    }
  }, [templates, composing.subject]);

  const saveDraft = useCallback(async () => {
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch('/api/mail/draft', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: composing.from,
          to: composing.to,
          subject: composing.subject,
          html: composing.body,
          text: composing.body,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String((d as any)?.error || 'Draft save failed'));
      toast('Draft saved', 'ok');
      setComposeOpen(false);
      setComposing((p) => ({ ...p, to: '', subject: '', body: '', template_id: '', reply_to: '' }));
      setFolder('sent');
      setSelectedEmail(null);
      setEmailDetail(null);
      void loadFolder();
    } catch (e: any) {
      const msg = String(e?.message || 'Draft save failed');
      setSendError(msg);
      toast(msg, 'err');
    } finally {
      setSending(false);
    }
  }, [composing, toast, loadFolder]);

  const sendEmail = useCallback(async () => {
    setSending(true);
    setSendError(null);
    try {
      const r = await fetch('/api/mail/send', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: composing.from,
          to: composing.to,
          subject: composing.subject,
          html: composing.body,
          text: composing.body,
          template_id: composing.template_id || undefined,
          vars: {},
          reply_to: composing.reply_to || undefined,
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String((d as any)?.error || 'Send failed'));
      toast('Email sent', 'ok');
      setComposeOpen(false);
      setComposing((p) => ({ ...p, to: '', subject: '', body: '', template_id: '', reply_to: '' }));
      setFolder('sent');
      setSelectedEmail(null);
      setEmailDetail(null);
      void loadFolder();
    } catch (e: any) {
      const msg = String(e?.message || 'Send failed');
      setSendError(msg);
      toast(msg, 'err');
    } finally {
      setSending(false);
    }
  }, [composing, toast, loadFolder]);

  const ComposeButtonIcon = Mail;

  return (
    <div style={styles.outer}>
      {/* LEFT SIDEBAR */}
      <div style={styles.sidebar}>
        <div style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => openCompose()}
            style={{
              flex: 1,
              height: 38,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              border: '1px solid rgba(0,0,0,0)',
              borderRadius: 10,
              cursor: 'pointer',
              background: 'var(--solar-cyan)',
              color: '#fff',
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: 0.3,
            }}
          >
            <ComposeButtonIcon size={16} strokeWidth={1.75} />
            Compose
          </button>
          <button
            type="button"
            title="Refresh"
            onClick={reload}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              border: '1px solid var(--border-subtle)',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RefreshCw size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div style={{ padding: '6px 0', flex: '1 1 auto', overflowY: 'auto' }}>
          {([
            { key: 'inbox', label: 'Inbox', icon: Inbox },
            { key: 'starred', label: 'Starred', icon: Star },
            { key: 'archived', label: 'Archived', icon: Archive },
            { key: 'sent', label: 'Sent', icon: Send },
            { key: 'templates', label: 'Templates', icon: Clock },
          ] as Array<{ key: Folder; label: string; icon: any }>).map((item) => {
            const active = folder === item.key;
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                onClick={() => setFolderAndReset(item.key)}
                style={{
                  padding: '10px 16px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  borderLeft: active ? '3px solid var(--solar-cyan)' : '3px solid transparent',
                  background: active ? 'var(--bg-hover)' : 'transparent',
                  color: active ? 'var(--solar-cyan)' : 'var(--text-muted)',
                  userSelect: 'none',
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
              >
                <Icon size={16} strokeWidth={1.75} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: active ? 700 : 600 }}>
                  {item.label}
                </div>
                {item.key === 'inbox' && unreadCount > 0 && (
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      background: 'rgba(0,255,255,0.15)',
                      color: 'var(--solar-cyan)',
                      padding: '2px 8px',
                      borderRadius: 999,
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    {unreadCount}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: 11, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div>{stats.total} total · {stats.unread} unread</div>
          {gmailConnected === false && (
            <a
              href="/api/mail/gmail/start"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 32,
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-main)',
                fontWeight: 800,
                fontSize: 11,
                textDecoration: 'none',
              }}
            >
              Connect Gmail
            </a>
          )}
          {gmailConnected === true && gmailAccount && (
            <div style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Gmail: <span style={{ color: 'var(--text-main)', fontWeight: 800 }}>{gmailAccount}</span>
            </div>
          )}
        </div>
      </div>

      {/* CENTER LIST */}
      <div style={styles.center}>
        <div
          style={{
            height: 48,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 12px 0 16px',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-app)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.2 }}>
            {folderTitle(folder)}
          </div>

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 240, maxWidth: '42vw' }}>
              <Search size={14} strokeWidth={1.75} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search from/subject…"
                style={{
                  width: '100%',
                  height: 32,
                  padding: '0 10px 0 32px',
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 10,
                  color: 'var(--text-main)',
                  outline: 'none',
                  fontSize: 12,
                }}
              />
            </div>
            <button
              type="button"
              title="Compose"
              onClick={() => openCompose()}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                cursor: 'pointer',
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Plus size={16} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {categories.length > 0 && folder === 'inbox' && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: 11 }}>
              <Filter size={14} strokeWidth={1.75} />
              Category
            </div>
            <button
              type="button"
              onClick={() => setFilterCategory(null)}
              style={{
                fontSize: 10,
                padding: '2px 8px',
                borderRadius: 999,
                border: '1px solid var(--border-subtle)',
                background: filterCategory == null ? 'var(--bg-hover)' : 'var(--bg-elevated)',
                color: filterCategory == null ? 'var(--solar-cyan)' : 'var(--text-muted)',
                cursor: 'pointer',
                fontWeight: 700,
              }}
            >
              All
            </button>
            {categories.slice(0, 8).map((c) => (
              <button
                key={c.category}
                type="button"
                onClick={() => setFilterCategory(c.category)}
                style={{
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 999,
                  border: '1px solid var(--border-subtle)',
                  background: String(filterCategory || '').toLowerCase() === c.category.toLowerCase() ? 'var(--bg-hover)' : 'var(--bg-elevated)',
                  color: String(filterCategory || '').toLowerCase() === c.category.toLowerCase() ? 'var(--solar-cyan)' : 'var(--text-muted)',
                  cursor: 'pointer',
                  fontWeight: 700,
                }}
              >
                {c.category} · {c.count}
              </button>
            ))}
          </div>
        )}

        <div style={{ flex: '1 1 auto', overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 16 }}>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} style={{ padding: '12px 16px', border: '1px solid var(--border-subtle)', borderRadius: 12, background: 'var(--bg-elevated)', marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 999, background: 'var(--bg-hover)' }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 10, width: '60%', background: 'var(--bg-hover)', borderRadius: 999, marginBottom: 8 }} />
                      <div style={{ height: 10, width: '80%', background: 'var(--bg-hover)', borderRadius: 999 }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : folder === 'templates' ? (
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--text-main)' }}>Templates</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{templates.length} active</div>
              </div>
              {templates.length === 0 ? (
                <div style={{ padding: 24, border: '1px solid var(--border-subtle)', borderRadius: 12, textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Clock size={22} strokeWidth={1.6} style={{ opacity: 0.8 }} />
                  <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>No templates</div>
                  <div style={{ marginTop: 6, fontSize: 11 }}>Create templates in the backend to use them here.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {templates
                    .filter((t) => {
                      const q = search.trim().toLowerCase();
                      if (!q) return true;
                      return String(t.name || '').toLowerCase().includes(q) || String(t.category || '').toLowerCase().includes(q);
                    })
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => openCompose({ template_id: t.id })}
                        style={{
                          textAlign: 'left',
                          border: '1px solid var(--border-subtle)',
                          background: 'var(--bg-elevated)',
                          borderRadius: 12,
                          padding: 12,
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Tag size={16} strokeWidth={1.7} style={{ color: 'var(--text-muted)' }} />
                          <div style={{ fontWeight: 800, fontSize: 12, color: 'var(--text-main)' }}>{t.name}</div>
                          <div style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-muted)' }}>{t.category || 'general'}</div>
                        </div>
                        {t.subject && (
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                            Subject: <span style={{ color: 'var(--text-main)' }}>{t.subject}</span>
                          </div>
                        )}
                        <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                          Click to compose with this template
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          ) : filteredEmails.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
              <div style={{ textAlign: 'center', padding: 16 }}>
                <Mail size={28} strokeWidth={1.6} style={{ opacity: 0.7 }} />
                <div style={{ marginTop: 10, fontSize: 13, fontWeight: 700, color: 'var(--text-main)' }}>No emails</div>
                <div style={{ marginTop: 6, fontSize: 11 }}>Try switching folders or clearing filters.</div>
              </div>
            </div>
          ) : (
            <div>
              {filteredEmails.map((email) => {
                const selected = selectedEmail?.id === email.id;
                const unread = !email.is_read;
                return (
                  <div
                    key={email.id}
                    onClick={() => {
                      setSelectedEmail(email);
                      setThreadOpen(false);
                    }}
                    style={{
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      cursor: 'pointer',
                      background: selected ? 'var(--bg-hover)' : unread ? 'var(--bg-elevated)' : 'var(--bg-app)',
                      borderLeft: selected ? '3px solid var(--solar-cyan)' : '3px solid transparent',
                      display: 'flex',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 999,
                        background: avatarColor(email.from_address),
                        color: '#001018',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 900,
                        letterSpacing: 0.4,
                        flexShrink: 0,
                      }}
                      title={email.from_address}
                    >
                      {initials(email.from_address)}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: unread ? 800 : 600,
                            color: 'var(--text-main)',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {email.from_address || '—'}
                        </div>
                        <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
                          {fmtListDate(email.date_received)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: unread ? 800 : 600,
                            color: 'var(--text-main)',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {email.subject || '(no subject)'}
                        </div>
                        {!!email.category && (
                          <div
                            style={{
                              marginLeft: 'auto',
                              fontSize: 10,
                              padding: '2px 7px',
                              borderRadius: 999,
                              border: '1px solid var(--border-subtle)',
                              ...categoryBadgeStyle(email.category),
                              flexShrink: 0,
                              fontWeight: 800,
                              textTransform: 'lowercase',
                            }}
                          >
                            {email.category}
                          </div>
                        )}
                      </div>

                      {email.has_attachments ? (
                        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                          <Paperclip size={14} strokeWidth={1.75} />
                          Attachments
                        </div>
                      ) : null}
                    </div>

                    <button
                      type="button"
                      title={email.is_starred ? 'Unstar' : 'Star'}
                      onClick={(e) => {
                        e.stopPropagation();
                        void toggleStar(email);
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        border: '1px solid var(--border-subtle)',
                        background: 'transparent',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: email.is_starred ? 'var(--solar-yellow)' : 'var(--text-muted)',
                        flexShrink: 0,
                      }}
                    >
                      <Star size={16} strokeWidth={1.75} fill={email.is_starred ? 'var(--solar-yellow)' : 'none'} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {total > 50 && folder !== 'sent' && folder !== 'templates' && (
          <div style={{ height: 40, flexShrink: 0, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                color: page <= 1 ? 'var(--text-muted)' : 'var(--text-main)',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Previous
            </button>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Page {page} of {Math.max(1, Math.ceil(total / 50))}
            </div>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= Math.ceil(total / 50)}
              style={{
                height: 28,
                padding: '0 10px',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                color: page >= Math.ceil(total / 50) ? 'var(--text-muted)' : 'var(--text-main)',
                cursor: page >= Math.ceil(total / 50) ? 'not-allowed' : 'pointer',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* RIGHT DETAIL */}
      <div style={styles.detail}>
        {!selectedEmail ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-muted)' }}>
              <Mail size={32} strokeWidth={1.6} style={{ opacity: 0.75 }} />
              <div style={{ marginTop: 10, fontSize: 13, fontWeight: 800, color: 'var(--text-main)' }}>Select an email to read</div>
              <div style={{ marginTop: 6, fontSize: 11 }}>Choose a message from the list.</div>
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                height: 48,
                flexShrink: 0,
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 10px',
                background: 'var(--bg-app)',
              }}
            >
              <button
                type="button"
                title="Back"
                onClick={() => setSelectedEmail(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ChevronLeft size={16} strokeWidth={1.75} />
              </button>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  title="Reply"
                  onClick={openReply}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Reply size={16} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  title="Forward"
                  onClick={openForward}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Forward size={16} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  title={selectedEmail.is_starred ? 'Unstar' : 'Star'}
                  onClick={() => void toggleStar(selectedEmail)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: selectedEmail.is_starred ? 'var(--solar-yellow)' : 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Star size={16} strokeWidth={1.75} fill={selectedEmail.is_starred ? 'var(--solar-yellow)' : 'none'} />
                </button>
                <button
                  type="button"
                  title="Archive"
                  onClick={() => void archiveEmail(selectedEmail.id)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Archive size={16} strokeWidth={1.75} />
                </button>
                <button
                  type="button"
                  title="Delete"
                  onClick={() => void deleteEmail(selectedEmail.id)}
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Trash2 size={16} strokeWidth={1.75} />
                </button>
              </div>
            </div>

            <div style={{ padding: 16, borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-main)', marginBottom: 10 }}>
                {selectedEmail.subject || '(no subject)'}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  From: <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{selectedEmail.from_address || '—'}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  To: <span style={{ color: 'var(--text-main)', fontWeight: 700 }}>{selectedEmail.to_address || '—'}</span>
                </div>
              </div>
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                {selectedEmail.date_received ? new Date(selectedEmail.date_received).toLocaleString() : '—'}
              </div>

              {!!selectedEmail.category && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 10,
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 999,
                    border: '1px solid var(--border-subtle)',
                    ...categoryBadgeStyle(selectedEmail.category),
                    fontWeight: 900,
                    textTransform: 'lowercase',
                  }}
                >
                  <Tag size={14} strokeWidth={1.75} />
                  {selectedEmail.category}
                </div>
              )}

              {(emailDetail?.attachments?.length || 0) > 0 && (
                <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {emailDetail!.attachments.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '6px 10px',
                        borderRadius: 999,
                        border: '1px solid var(--border-subtle)',
                        background: 'var(--bg-elevated)',
                        color: 'var(--text-main)',
                        fontSize: 11,
                      }}
                      title={`${a.content_type} · ${fmtSize(a.size)}`}
                    >
                      <Paperclip size={14} strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
                      <span style={{ fontWeight: 800 }}>{a.filename}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{fmtSize(a.size)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {!!(emailDetail?.thread?.length) && (
              <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  onClick={() => setThreadOpen((v) => !v)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-elevated)',
                    borderRadius: 12,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    color: 'var(--text-main)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                  }}
                >
                  <Circle size={14} strokeWidth={1.75} style={{ color: threadOpen ? 'var(--solar-cyan)' : 'var(--text-muted)' }} />
                  <div style={{ fontSize: 12, fontWeight: 900 }}>Thread ({emailDetail.thread.length} messages)</div>
                  <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                    {threadOpen ? 'Hide' : 'Show'}
                  </div>
                </button>

                {threadOpen && (
                  <div style={{ marginTop: 10, border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
                    {emailDetail.thread.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedEmail(t)}
                        style={{
                          padding: '10px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          cursor: 'pointer',
                          background: 'var(--bg-app)',
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                      >
                        {t.is_read ? (
                          <CheckCircle size={16} strokeWidth={1.7} style={{ color: 'var(--text-muted)' }} />
                        ) : (
                          <Circle size={16} strokeWidth={1.7} style={{ color: 'var(--solar-cyan)' }} />
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: t.is_read ? 700 : 900, color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.from_address || '—'}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {t.subject || '(no subject)'}
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtListDate(t.date_received)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: 16 }}>
              {detailLoading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                  <RefreshCw size={18} strokeWidth={1.75} style={{ marginRight: 10 }} />
                  Loading…
                </div>
              ) : emailDetail?.body ? (
                isLikelyHtml(emailDetail.body) ? (
                  <iframe
                    title="email-body"
                    srcDoc={emailDetail.body}
                    sandbox="allow-same-origin"
                    style={{
                      width: '100%',
                      height: '100%',
                      border: 'none',
                      background: '#fff',
                      borderRadius: 8,
                    }}
                  />
                ) : (
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: 'var(--text-main)',
                      margin: 0,
                    }}
                  >
                    {emailDetail.body}
                  </pre>
                )
              ) : (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  Email body not available
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* COMPOSE MODAL */}
      {composeOpen && (
        <>
          <button
            type="button"
            aria-label="Close compose"
            onClick={() => { if (!sending) setComposeOpen(false); }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'transparent',
              backdropFilter: 'none',
              zIndex: 500,
              border: 'none',
              cursor: sending ? 'not-allowed' : 'pointer',
            }}
          />
          <div
            style={{
              position: 'fixed',
              bottom: 0,
              right: 24,
              width: 560,
              maxWidth: 'calc(100vw - 32px)',
              maxHeight: '80vh',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '12px 12px 0 0',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
              zIndex: 501,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid var(--border-subtle)' }}>
              <div style={{ fontSize: 12, fontWeight: 900, color: 'var(--text-main)' }}>
                New Message
              </div>
              <button
                type="button"
                title="Close"
                onClick={() => { if (!sending) setComposeOpen(false); }}
                style={{
                  marginLeft: 'auto',
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  cursor: sending ? 'not-allowed' : 'pointer',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={16} strokeWidth={1.75} />
              </button>
            </div>

            <div style={{ padding: '0 16px' }}>
              {([
                {
                  label: 'From',
                  render: (
                    <select
                      value={composing.from}
                      onChange={(e) => setComposing((p) => ({ ...p, from: e.target.value }))}
                      style={{
                        width: '100%',
                        height: 40,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-main)',
                        outline: 'none',
                        fontSize: 13,
                      }}
                    >
                      {senders.length === 0 ? (
                        <option value="">No senders configured</option>
                      ) : (
                        senders.map((s) => (
                          <option key={s.id} value={s.address}>
                            {(s.display_name && s.display_name.trim())
                              ? `${s.display_name.trim()} <${s.address}>`
                              : s.address}
                          </option>
                        ))
                      )}
                    </select>
                  ),
                },
                {
                  label: 'To',
                  render: (
                    <input
                      value={composing.to}
                      onChange={(e) => setComposing((p) => ({ ...p, to: e.target.value }))}
                      placeholder="Recipients..."
                      style={{
                        width: '100%',
                        height: 40,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-main)',
                        outline: 'none',
                        fontSize: 13,
                      }}
                    />
                  ),
                },
                {
                  label: 'Subject',
                  render: (
                    <input
                      value={composing.subject}
                      onChange={(e) => setComposing((p) => ({ ...p, subject: e.target.value }))}
                      placeholder="Subject..."
                      style={{
                        width: '100%',
                        height: 40,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-main)',
                        outline: 'none',
                        fontSize: 13,
                      }}
                    />
                  ),
                },
                {
                  label: 'Template',
                  render: (
                    <select
                      value={composing.template_id}
                      onChange={(e) => void applyTemplateToCompose(e.target.value)}
                      style={{
                        width: '100%',
                        height: 40,
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-main)',
                        outline: 'none',
                        fontSize: 13,
                      }}
                    >
                      <option value="">—</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.category ? `${t.category} · ${t.name}` : t.name}
                        </option>
                      ))}
                    </select>
                  ),
                },
              ] as Array<{ label: string; render: React.ReactNode }>).map((row, idx) => (
                <div
                  key={row.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    borderBottom: idx === 3 ? 'none' : '1px solid var(--border-subtle)',
                    minHeight: 44,
                  }}
                >
                  <div style={{ width: 60, textAlign: 'right', color: 'var(--text-muted)', fontSize: 12 }}>
                    {row.label}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {row.render}
                  </div>
                </div>
              ))}
            </div>

            <textarea
              value={composing.body}
              onChange={(e) => setComposing((p) => ({ ...p, body: e.target.value }))}
              placeholder="Write your message…"
              style={{
                flex: '1 1 auto',
                minHeight: 200,
                padding: 16,
                border: 'none',
                background: 'transparent',
                resize: 'none',
                color: 'var(--text-main)',
                fontSize: 13,
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />

            <div style={{ height: 48, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10 }}>
              <button
                type="button"
                onClick={() => { if (!sending) setComposeOpen(false); }}
                style={{
                  height: 32,
                  padding: '0 10px',
                  borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: sending ? 'not-allowed' : 'pointer',
                  fontWeight: 800,
                  fontSize: 11,
                }}
              >
                Discard
              </button>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                {sendError && (
                  <div style={{ fontSize: 11, color: 'var(--solar-red)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {sendError}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void saveDraft()}
                  disabled={sending}
                  style={{
                    height: 32,
                    padding: '0 10px',
                    borderRadius: 10,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-panel)',
                    color: sending ? 'var(--text-muted)' : 'var(--text-main)',
                    cursor: sending ? 'not-allowed' : 'pointer',
                    fontWeight: 900,
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <Archive size={14} strokeWidth={1.75} style={{ color: 'var(--text-muted)' }} />
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={() => void sendEmail()}
                  disabled={sending}
                  style={{
                    height: 32,
                    padding: '0 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0)',
                    background: 'var(--solar-cyan)',
                    color: '#fff',
                    cursor: sending ? 'not-allowed' : 'pointer',
                    fontWeight: 900,
                    fontSize: 11,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    opacity: sending ? 0.7 : 1,
                  }}
                >
                  {sending ? <RefreshCw size={14} strokeWidth={1.75} /> : <Send size={14} strokeWidth={1.75} />}
                  Send
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* TOASTS */}
      {toasts.length > 0 && (
        <div style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 650, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {toasts.slice(-4).map((t) => (
            <div
              key={t.id}
              style={{
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-panel)',
                color: 'var(--text-main)',
                borderRadius: 12,
                padding: '10px 12px',
                boxShadow: '0 14px 38px rgba(0,0,0,0.35)',
                minWidth: 240,
                maxWidth: 360,
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              {t.type === 'ok' ? (
                <CheckCircle size={16} strokeWidth={1.75} style={{ color: 'var(--solar-cyan)' }} />
              ) : (
                <Circle size={16} strokeWidth={1.75} style={{ color: 'var(--solar-red)' }} />
              )}
              <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.msg}</div>
              <button
                type="button"
                onClick={() => {
                  removeToast(t.id);
                }}
                style={{
                  marginLeft: 'auto',
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  background: 'transparent',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                title="Dismiss"
              >
                <X size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

