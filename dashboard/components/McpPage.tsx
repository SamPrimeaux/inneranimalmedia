/**
 * McpPage — /dashboard/mcp
 *
 * 4-agent cloud operations board:
 *   - Architect  → Plan, design, brainstorm
 *   - Builder    → Code, generate, implement
 *   - Inspector  → Debug, test, audit
 *   - Operator   → Deploy, monitor, ship
 *
 * Fully wired to existing /api/mcp/* endpoints.
 * Matches IAM dark IDE aesthetic via CSS vars.
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Brain, Hammer, FlaskConical, Rocket,
  Terminal, Zap, Activity, CheckCircle2,
  Clock, AlertCircle, Loader2, ChevronRight,
  Send, X, Search, Plus, RefreshCw,
  Cpu, Network, Shield, GitBranch,
  MoreHorizontal, Circle, Wifi, WifiOff,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type AgentStatus = 'idle' | 'running' | 'active' | 'waiting' | 'error' | 'success';

interface AgentConfig {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: React.ReactNode;
  accentVar: string;
  tools: string[];
}

interface AgentState {
  id: string;
  status: AgentStatus;
  current_task: string | null;
  progress_pct: number;
  cost_usd: number;
  logs: string[];
  session_id: string | null;
  /** D1 mcp_agent_sessions.id for reset */
  session_row_id: string | null;
  updated_at: number | null;
  last_activity: string | null;
  stage: string | null;
  is_stale: boolean;
}

interface McpService {
  id?: string;
  service_name?: string;
  name?: string;
  endpoint_url?: string;
  url?: string;
  health_status?: string;
  service_type?: string;
}

interface WsMessage {
  role: 'user' | 'assistant' | 'thinking';
  content: string;
}

type WorkflowRow = {
  id: string;
  name: string;
  trigger_type: string | null;
  status: string | null;
  last_run_at: unknown;
  run_count: number | null;
  requires_approval?: boolean;
};

type AgentProfile = {
  slug: string;
  display_name: string;
  description: string | null;
  icon: string | null;
  access_mode: string | null;
  tool_categories: string | null;
  allowed_tool_globs: unknown;
};

const FALLBACK_AGENTS: AgentConfig[] = [
  {
    id: 'mcp_agent_architect',
    name: 'Architect',
    role: 'Systems design, architecture planning, technical strategy'.slice(0, 60),
    description: 'Systems design, architecture planning, technical strategy',
    icon: <Brain size={18} />,
    accentVar: 'var(--solar-blue)',
    tools: ['d1_query', 'r2_list', 'r2_read'],
  },
  {
    id: 'mcp_agent_builder',
    name: 'Builder',
    role: 'Full-stack code generation, feature implementation, scaffolding'.slice(0, 60),
    description: 'Full-stack code generation, feature implementation, scaffolding',
    icon: <Hammer size={18} />,
    accentVar: 'var(--solar-cyan)',
    tools: ['d1_query', 'd1_write', 'r2_read', 'r2_write'],
  },
  {
    id: 'mcp_agent_inspector',
    name: 'Inspector',
    role: 'Code review, bug hunting, test coverage, security audits'.slice(0, 60),
    description: 'Code review, bug hunting, test coverage, security audits',
    icon: <FlaskConical size={18} />,
    accentVar: 'var(--solar-green)',
    tools: ['d1_query', 'r2_list', 'r2_read'],
  },
  {
    id: 'mcp_agent_operator',
    name: 'Operator',
    role: 'Deployments, health monitoring, infra ops, release management'.slice(0, 60),
    description: 'Deployments, health monitoring, infra ops, release management',
    icon: <Rocket size={18} />,
    accentVar: 'var(--solar-yellow)',
    tools: ['d1_query', 'r2_list', 'worker_deploy'],
  },
];

const ACCENT_CYCLE = [
  'var(--solar-blue)',
  'var(--solar-cyan)',
  'var(--solar-green)',
  'var(--solar-yellow)',
  'var(--solar-magenta)',
];

function parseAllowedToolGlobs(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return [];
    try {
      const j = JSON.parse(s);
      if (Array.isArray(j)) return j.map(String).map((x) => x.trim()).filter(Boolean);
    } catch (_) { }
    return s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function lucideForIconName(name: string | null): React.ReactNode {
  const k = String(name || '').trim().toLowerCase();
  if (k === 'folder-search') return <Brain size={18} />;
  if (k === 'terminal') return <Terminal size={18} />;
  if (k === 'code-2') return <Hammer size={18} />;
  if (k === 'database') return <FlaskConical size={18} />;
  if (k === 'git-merge') return <Rocket size={18} />;
  return <Cpu size={18} />;
}

function mapProfilesToAgents(profiles: AgentProfile[]): AgentConfig[] {
  return profiles.map((p, idx) => {
    let id = String(p.slug || '').trim();
    if (id === 'mcp_agent_tester') id = 'mcp_agent_inspector';
    const name = String(p.display_name || id || 'Agent').trim();
    const desc = String(p.description || '').trim();
    return {
      id,
      name,
      role: (desc || name).slice(0, 60),
      description: desc || name,
      icon: lucideForIconName(p.icon),
      accentVar: ACCENT_CYCLE[idx % ACCENT_CYCLE.length],
      tools: parseAllowedToolGlobs((p as any).allowed_tool_globs),
    };
  }).filter((a) => !!a.id);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function statusIcon(status: AgentStatus, accent: string) {
  const s = String(status || '').toLowerCase();
  switch (s) {
    case 'running':
      return <Loader2 size={13} className="animate-spin" style={{ color: 'var(--solar-cyan)' }} />;
    case 'active':
      return <Circle size={13} fill="currentColor" className="opacity-95" style={{ color: 'var(--solar-green)' }} />;
    case 'success':
      return <CheckCircle2 size={13} style={{ color: 'var(--solar-green)' }} />;
    case 'error':
      return <AlertCircle size={13} style={{ color: 'var(--solar-red)' }} />;
    case 'waiting':
      return <Clock size={13} style={{ color: 'var(--solar-yellow)' }} />;
    default:
      return <Circle size={13} className="opacity-35" style={{ color: 'var(--text-muted)' }} />;
  }
}

// ─── AgentCard ────────────────────────────────────────────────────────────────
interface AgentCardProps {
  config: AgentConfig;
  state: AgentState;
  onOpen: (id: string) => void;
  onResetStale: (sessionRowId: string) => void;
}

const AgentCard: React.FC<AgentCardProps> = ({ config, state, onOpen, onResetStale }) => {
  const accent = config.accentVar;
  const st = String(state.status || '').toLowerCase();
  const isActive = st === 'running' || st === 'active' || st === 'waiting';

  return (
    <div
      className="relative flex flex-col rounded-xl border overflow-hidden transition-all duration-200 hover:border-opacity-60"
      style={{
        background: 'var(--bg-panel)',
        borderColor: isActive ? accent : 'var(--border-subtle)',
        boxShadow: isActive ? `0 0 0 1px ${accent}22, 0 4px 24px ${accent}11` : 'none',
      }}
    >
      {/* accent bar */}
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: isActive ? accent : 'transparent' }} />

      {/* header */}
      <div className="flex items-start justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: `${accent}18`, color: accent }}>
            {config.icon}
          </div>
          <div>
            <p className="text-[0.8125rem] font-bold text-[var(--text-heading)]">{config.name}</p>
            <p className="text-[0.5625rem] font-mono uppercase tracking-widest text-[var(--text-muted)] mt-0.5">{config.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap justify-end">
          {state.is_stale && state.session_row_id && (
            <button
              type="button"
              title="Session looks stuck — reset this agent"
              onClick={(e) => { e.stopPropagation(); onResetStale(state.session_row_id!); }}
              className="px-1.5 py-0.5 rounded text-[0.5rem] font-bold uppercase tracking-wide cursor-pointer"
              style={{ background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.45)', color: '#fbbf24' }}
            >
              Stale — click to reset
            </button>
          )}
          {statusIcon(state.status, accent)}
          <span className="text-[0.5625rem] font-bold uppercase tracking-wider text-[var(--text-muted)] capitalize">
            {state.status}
          </span>
        </div>
      </div>

      {/* task */}
      <div className="px-4 pb-2 min-h-[2rem]">
        {state.current_task ? (
          <p className="text-[0.6875rem] text-[var(--text-main)] font-mono truncate">{state.current_task}</p>
        ) : (
          <p className="text-[0.6875rem] text-[var(--text-muted)] italic">Waiting for task…</p>
        )}
      </div>

      {/* progress bar (D1 progress_pct) */}
      <div className="mx-4 mb-3 h-1 rounded-full bg-[var(--border-subtle)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, state.progress_pct))}%`, background: accent }}
        />
      </div>

      {/* log lines — newest first, max 5 */}
      <div
        className="mx-4 mb-3 rounded-lg px-3 py-2 font-mono text-[0.5625rem] leading-relaxed space-y-0.5 overflow-hidden"
        style={{ background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', minHeight: '4.5rem', maxHeight: '4.5rem' }}
      >
        {[...state.logs].reverse().slice(0, 5).length > 0
          ? [...state.logs].reverse().slice(0, 5).map((l, i) => (
            <div key={i} className="truncate text-[var(--text-muted)]">{l}</div>
          ))
          : <div className="text-[var(--text-muted)] opacity-40">No activity yet</div>
        }
      </div>

      {/* footer */}
      <div className="flex items-center justify-between px-4 pb-4">
        <div className="flex items-center gap-1.5 flex-wrap">
          {config.tools.slice(0, 3).map(t => (
            <span
              key={t}
              className="px-1.5 py-0.5 rounded text-[0.5rem] font-mono font-bold uppercase tracking-wide"
              style={{ background: `${accent}12`, border: `1px solid ${accent}25`, color: accent }}
            >
              {t}
            </span>
          ))}
          {config.tools.length > 3 && (
            <span className="text-[0.5rem] text-[var(--text-muted)]">+{config.tools.length - 3}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[0.5625rem] font-mono text-[var(--text-muted)]">
            ${state.cost_usd.toFixed(4)}
          </span>
          <button
            type="button"
            onClick={() => onOpen(config.id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[0.625rem] font-bold uppercase tracking-widest transition-all"
            style={{
              background: `${accent}15`,
              border: `1px solid ${accent}35`,
              color: accent,
            }}
          >
            Open <ChevronRight size={10} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── WorkspacePanel ───────────────────────────────────────────────────────────
interface WorkspacePanelProps {
  agentId: string | null;
  agents: AgentConfig[];
  onClose: () => void;
}

const WorkspacePanel: React.FC<WorkspacePanelProps> = ({ agentId, agents, onClose }) => {
  const config = agents.find(a => a.id === agentId);
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (agentId && config) {
      setMessages([{ role: 'assistant', content: `${config.name} ready. What should I work on?` }]);
      setInput('');
      setSessionId(null);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [agentId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  const send = useCallback(async () => {
    if (!input.trim() || !agentId || sending) return;
    const text = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setSending(true);
    setMessages(prev => [...prev, { role: 'thinking', content: 'Thinking…' }]);

    try {
      const body: Record<string, unknown> = {
        messages: [...messages.filter(m => m.role !== 'thinking'), { role: 'user', content: text }],
        agent_id: agentId,
        model_id: 'auto',
      };
      if (sessionId) body.session_id = sessionId;

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text ?? data.response ?? data.message ?? JSON.stringify(data);
      if (data.conversation_id && !sessionId) setSessionId(data.conversation_id);
      setMessages(prev => [...prev.filter(m => m.role !== 'thinking'), { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev.filter(m => m.role !== 'thinking'), { role: 'assistant', content: `Error: ${String(err)}` }]);
    } finally {
      setSending(false);
    }
  }, [input, agentId, sending, messages, sessionId]);

  if (!agentId || !config) return null;
  const accent = config.accentVar;

  return (
    <div className="fixed inset-0 z-50 flex items-stretch" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="ml-auto w-full max-w-xl flex flex-col" style={{ background: 'var(--bg-panel)', borderLeft: '1px solid var(--border-subtle)' }}>
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-app)' }}>
          <div className="p-2 rounded-lg" style={{ background: `${accent}18`, color: accent }}>
            {config.icon}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.875rem] font-bold text-[var(--text-heading)]">{config.name}</p>
            <p className="text-[0.5625rem] font-mono uppercase tracking-widest text-[var(--text-muted)]">{config.role}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]">
            <X size={15} />
          </button>
        </div>

        {/* messages */}
        <div ref={messagesRef} className="flex-1 overflow-y-auto p-5 space-y-3 min-h-0 custom-scrollbar">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className="max-w-[85%] px-4 py-2.5 rounded-xl text-[0.75rem] leading-relaxed whitespace-pre-wrap"
                style={
                  m.role === 'user'
                    ? { background: accent, color: '#fff' }
                    : m.role === 'thinking'
                    ? { color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.6875rem' }
                    : { background: 'var(--bg-app)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }
                }
              >
                {m.content}
              </div>
            </div>
          ))}
        </div>

        {/* input */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-app)' }}>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Message ${config.name}…`}
              rows={2}
              className="flex-1 resize-none rounded-xl px-3 py-2.5 text-[0.75rem] font-mono outline-none placeholder:text-[var(--text-muted)]/50"
              style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--text-main)' }}
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !input.trim()}
              className="p-2.5 rounded-xl disabled:opacity-40 transition-all"
              style={{ background: accent, color: '#fff' }}
            >
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── McpPage ──────────────────────────────────────────────────────────────────
export const McpPage: React.FC = () => {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [agentStates, setAgentStates] = useState<Record<string, AgentState>>(() =>
    Object.fromEntries(FALLBACK_AGENTS.map(a => [a.id, {
      id: a.id, status: 'idle', current_task: null,
      progress_pct: 0, cost_usd: 0, logs: [], session_id: null,
      session_row_id: null, updated_at: null, last_activity: null, stage: null, is_stale: false,
    }]))
  );
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [services, setServices] = useState<McpService[]>([]);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [servicesLoaded, setServicesLoaded] = useState(false);
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [workflowsLoaded, setWorkflowsLoaded] = useState(false);
  const [workflowsBusyId, setWorkflowsBusyId] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState('');
  const [commandFocus, setCommandFocus] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const commandRef = useRef<HTMLInputElement>(null);

  const formatRelativeTime = useCallback((raw: unknown): string => {
    if (raw == null) return 'never';
    let ms: number | null = null;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      ms = raw > 10_000_000_000 ? raw : raw * 1000; // ms vs unix seconds
    } else if (typeof raw === 'string') {
      const s = raw.trim();
      if (!s) return 'never';
      const asNum = Number(s);
      if (!Number.isNaN(asNum) && Number.isFinite(asNum)) {
        ms = asNum > 10_000_000_000 ? asNum : asNum * 1000;
      } else {
        const parsed = Date.parse(s);
        if (!Number.isNaN(parsed)) ms = parsed;
      }
    }
    if (!ms) return 'never';
    const diff = Date.now() - ms;
    if (diff < 0) return 'just now';
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  }, []);

  const loadWorkflows = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/workflows', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray((data as any)?.workflows) ? (data as any).workflows : (Array.isArray(data) ? data : []);
      setWorkflows(Array.isArray(list) ? list : []);
      setWorkflowsLoaded(true);
    } catch {
      setWorkflowsLoaded(true);
    }
  }, []);

  useEffect(() => { void loadWorkflows(); }, [loadWorkflows]);

  const runWorkflow = useCallback(async (wf: WorkflowRow) => {
    const id = String(wf?.id || '').trim();
    if (!id || workflowsBusyId) return;
    const trig = String(wf?.trigger_type || '').trim().toLowerCase();
    if (trig === 'manual') {
      const ok = window.confirm(`Run workflow "${wf.name}" now?`);
      if (!ok) return;
    }
    setWorkflowsBusyId(id);
    try {
      const res = await fetch(`/api/mcp/workflows/${encodeURIComponent(id)}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({}),
      });
      await res.json().catch(() => ({}));
      await loadWorkflows();
    } catch {
      /* ignore */
    } finally {
      setWorkflowsBusyId(null);
    }
  }, [loadWorkflows, workflowsBusyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/agent/subagent-profiles', { credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
        const mapped = mapProfilesToAgents(profiles as AgentProfile[]);
        const nextAgents = mapped.length > 0 ? mapped : FALLBACK_AGENTS;
        if (cancelled) return;
        setAgents(nextAgents);
      } catch {
        if (!cancelled) setAgents(FALLBACK_AGENTS);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!agents.length) return;
    setAgentStates((prev) => {
      const next: Record<string, AgentState> = {};
      for (const a of agents) {
        next[a.id] = prev[a.id] || {
          id: a.id,
          status: 'idle',
          current_task: null,
          progress_pct: 0,
          cost_usd: 0,
          logs: [],
          session_id: null,
          session_row_id: null,
          updated_at: null,
          last_activity: null,
          stage: null,
          is_stale: false,
        };
      }
      return next;
    });
  }, [agents]);

  // ── D1-backed agent status (/api/mcp/agents/status) ─────────────────────────
  const loadAgentStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/agents/status', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data?.agents) ? data.agents : [];
      setAgentStates(prev => {
        const next = { ...prev };
        for (const row of list) {
          const id = String(row?.agent_id || '').trim();
          if (!id || !next[id]) continue;
          const logsRaw = row.logs_json;
          const logsArr = Array.isArray(logsRaw)
            ? logsRaw.map((x: unknown) => (typeof x === 'string' ? x : JSON.stringify(x)))
            : [];
          next[id] = {
            ...next[id],
            id,
            status: (String(row.status || 'idle').toLowerCase() as AgentStatus) || 'idle',
            current_task: row.current_task ?? null,
            progress_pct: Number(row.progress_pct) || 0,
            cost_usd: Number(row.cost_usd) || 0,
            logs: logsArr,
            session_id: row.session_id ?? null,
            session_row_id: row.session_id ?? null,
            updated_at: row.updated_at != null ? Number(row.updated_at) : null,
            last_activity: row.last_activity ?? null,
            stage: row.stage ?? null,
            is_stale: !!row.is_stale,
          };
        }
        return next;
      });
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    let t: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (t) clearInterval(t);
      t = null;
      if (typeof document !== 'undefined' && document.hidden) return;
      void loadAgentStatus();
      t = setInterval(() => void loadAgentStatus(), 30_000);
    };
    start();
    const onVis = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        if (t) clearInterval(t);
        t = null;
      } else start();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (t) clearInterval(t);
    };
  }, [loadAgentStatus]);

  const resetStaleSession = useCallback(async (sessionRowId: string) => {
    try {
      await fetch('/api/mcp/agents/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ id: sessionRowId }),
      });
      await loadAgentStatus();
    } catch { /* silent */ }
  }, [loadAgentStatus]);

  const resetAllAgents = useCallback(async () => {
    try {
      await fetch('/api/mcp/agents/reset-all', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      await loadAgentStatus();
    } catch { /* silent */ }
  }, [loadAgentStatus]);

  // ── Load services ────────────────────────────────────────────────────────────
  const loadServices = useCallback(async () => {
    try {
      const res = await fetch('/api/mcp/services', { credentials: 'same-origin' });
      const data = await res.json();
      const list = data.services ?? data.results ?? [];
      setServices(Array.isArray(list) ? list : []);
      setServicesLoaded(true);
    } catch { setServicesLoaded(true); }
  }, []);

  // ── Dispatch command ─────────────────────────────────────────────────────────
  const dispatch = useCallback(async () => {
    const prompt = commandInput.trim();
    if (!prompt || dispatching) return;
    setDispatching(true);
    setCommandFocus(false);
    try {
      const res = await fetch('/api/mcp/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (data.agent_id) {
        setCommandInput('');
        await loadAgentStatus();
        setTimeout(() => setActiveAgent(data.agent_id), 400);
      }
    } catch { /* silent */ }
    finally { setDispatching(false); }
  }, [commandInput, dispatching, loadAgentStatus]);

  const healthColor = (status?: string) => {
    const s = (status ?? '').toLowerCase();
    if (s === 'healthy') return 'var(--solar-green)';
    if (s === 'degraded') return 'var(--solar-yellow)';
    if (s === 'down') return 'var(--solar-red)';
    return 'var(--text-muted)';
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-app)] text-[var(--text-main)] overflow-hidden">

      {/* ── Top bar ───────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-4 px-5 py-3 shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-panel)' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg" style={{ background: 'var(--solar-cyan)18' }}>
            <Network size={15} style={{ color: 'var(--solar-cyan)' }} />
          </div>
          <div>
            <p className="text-[0.6875rem] font-bold tracking-widest uppercase leading-none text-[var(--text-heading)]">MCP Cloud Agents</p>
            <p className="text-[0.5rem] font-mono text-[var(--text-muted)] mt-0.5">4-agent parallel ops · inneranimalmedia</p>
          </div>
        </div>

        {/* status dots */}
        <div className="flex items-center gap-3 ml-4">
          {(agents.length ? agents : FALLBACK_AGENTS).map(a => {
            const s = agentStates[a.id];
            const st = String(s?.status || 'idle').toLowerCase();
            const dotActive = st === 'running' || st === 'active';
            const dotColor =
              st === 'running' ? 'var(--solar-cyan)'
              : st === 'active' ? 'var(--solar-green)'
              : 'var(--text-muted)';
            return (
              <div key={a.id} className="flex items-center gap-1.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${st === 'running' ? 'animate-pulse' : ''}`}
                  style={{ background: dotColor, opacity: dotActive ? 1 : 0.35 }}
                />
                <span className="text-[0.5rem] font-mono text-[var(--text-muted)] hidden sm:block">{a.name}</span>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => void resetAllAgents()}
          className="px-2.5 py-1 rounded-lg text-[0.5625rem] font-bold uppercase tracking-widest shrink-0"
          style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
        >
          Reset All
        </button>

        <button
          type="button"
          onClick={() => void loadAgentStatus()}
          className="ml-auto p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">

        {/* Command bar */}
        <div className="relative">
          <div
            className="flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
            style={{
              background: 'var(--bg-panel)',
              border: `1px solid ${commandFocus ? 'var(--solar-cyan)' : 'var(--border-subtle)'}`,
              boxShadow: commandFocus ? '0 0 0 3px var(--solar-cyan)18' : 'none',
            }}
          >
            {dispatching
              ? <Loader2 size={15} className="animate-spin shrink-0" style={{ color: 'var(--solar-cyan)' }} />
              : <Terminal size={15} className="shrink-0 text-[var(--text-muted)]" />
            }
            <input
              ref={commandRef}
              value={commandInput}
              onChange={e => setCommandInput(e.target.value)}
              onFocus={() => setCommandFocus(true)}
              onBlur={() => setTimeout(() => setCommandFocus(false), 150)}
              onKeyDown={e => { if (e.key === 'Enter') dispatch(); }}
              placeholder='Ask MCP…  e.g. "scaffold a new Cloudflare worker with D1 binding"'
              className="flex-1 bg-transparent outline-none text-[0.75rem] font-mono placeholder:text-[var(--text-muted)]/50 text-[var(--text-main)]"
            />
            <button
              type="button"
              onClick={dispatch}
              disabled={dispatching || !commandInput.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.5625rem] font-bold uppercase tracking-widest disabled:opacity-30 transition-all"
              style={{ background: 'var(--solar-cyan)18', border: '1px solid var(--solar-cyan)35', color: 'var(--solar-cyan)' }}
            >
              <Zap size={11} /> Dispatch
            </button>
          </div>

          {/* quick chips */}
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            {[
              { label: 'Audit codebase', agent: 'Inspector' },
              { label: 'New worker pipeline', agent: 'Builder' },
              { label: 'Plan architecture', agent: 'Architect' },
              { label: 'Deploy to production', agent: 'Operator' },
            ].map(chip => (
              <button
                key={chip.label}
                type="button"
                onClick={() => { setCommandInput(chip.label); commandRef.current?.focus(); }}
                className="px-2.5 py-1 rounded-lg text-[0.5625rem] font-bold uppercase tracking-widest transition-all hover:opacity-80"
                style={{ background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
              >
                {chip.label}
                <span className="ml-1.5 opacity-50">→ {chip.agent}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Agent grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(agents.length ? agents : FALLBACK_AGENTS).map(config => (
            <AgentCard
              key={config.id}
              config={config}
              state={agentStates[config.id]}
              onOpen={setActiveAgent}
              onResetStale={resetStaleSession}
            />
          ))}
        </div>

        {/* MCP Services panel */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
          <button
            type="button"
            onClick={() => {
              setServicesOpen(o => !o);
              if (!servicesLoaded) void loadServices();
            }}
            className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-[var(--bg-hover)] transition-colors text-left"
            style={{ background: 'var(--bg-panel)' }}
          >
            <div className="flex items-center gap-2.5">
              <Wifi size={13} style={{ color: 'var(--solar-cyan)' }} />
              <span className="text-[0.75rem] font-bold text-[var(--text-heading)]">MCP Connections</span>
              {services.length > 0 && (
                <span className="text-[0.5rem] font-mono text-[var(--text-muted)] opacity-60">({services.length})</span>
              )}
            </div>
            <ChevronRight
              size={13}
              className="text-[var(--text-muted)] transition-transform"
              style={{ transform: servicesOpen ? 'rotate(90deg)' : 'none' }}
            />
          </button>

          {servicesOpen && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-app)' }}>
              {!servicesLoaded ? (
                <div className="flex items-center gap-2 px-5 py-4 text-[var(--text-muted)] text-[0.75rem]">
                  <Loader2 size={13} className="animate-spin" /> Loading connections…
                </div>
              ) : services.length === 0 ? (
                <div className="px-5 py-4 text-[0.75rem] text-[var(--text-muted)]">No connections registered.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      {['Service', 'Endpoint', 'Health'].map(h => (
                        <th key={h} className="px-5 py-2.5 text-[0.5rem] font-black uppercase tracking-widest text-[var(--text-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                        <td className="px-5 py-2.5 text-[0.75rem] font-semibold text-[var(--text-main)]">
                          {s.service_name ?? s.name ?? '—'}
                        </td>
                        <td className="px-5 py-2.5 text-[0.625rem] font-mono text-[var(--text-muted)] max-w-[200px] truncate">
                          {s.endpoint_url ?? s.url ?? '—'}
                        </td>
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: healthColor(s.health_status) }} />
                            <span className="text-[0.5625rem] font-bold capitalize" style={{ color: healthColor(s.health_status) }}>
                              {s.health_status ?? 'unverified'}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex justify-end px-5 py-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[0.625rem] font-bold uppercase tracking-widest transition-all"
                  style={{ background: 'var(--solar-cyan)15', border: '1px solid var(--solar-cyan)35', color: 'var(--solar-cyan)' }}
                >
                  <Plus size={11} /> New Connection
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Workflows panel */}
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border-subtle)' }}>
          <div
            className="w-full flex items-center justify-between px-5 py-3.5 text-left"
            style={{ background: 'var(--bg-panel)' }}
          >
            <div className="flex items-center gap-2.5">
              <Activity size={13} style={{ color: 'var(--solar-cyan)' }} />
              <span className="text-[0.75rem] font-bold text-[var(--text-heading)]">Workflows</span>
              {workflows.length > 0 && (
                <span className="text-[0.5rem] font-mono text-[var(--text-muted)] opacity-60">({workflows.length})</span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void loadWorkflows()}
              className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              title="Refresh workflows"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          <div style={{ borderTop: '1px solid var(--border-subtle)', background: 'var(--bg-app)' }}>
            {!workflowsLoaded ? (
              <div className="flex items-center gap-2 px-5 py-4 text-[var(--text-muted)] text-[0.75rem]">
                <Loader2 size={13} className="animate-spin" /> Loading workflows…
              </div>
            ) : workflows.length === 0 ? (
              <div className="px-5 py-4 text-[0.75rem] text-[var(--text-muted)]">No workflows configured.</div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    {['Workflow', 'Last run', 'Runs', ''].map(h => (
                      <th key={h} className="px-5 py-2.5 text-[0.5rem] font-black uppercase tracking-widest text-[var(--text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workflows.map((wf) => (
                    <tr key={wf.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                      <td className="px-5 py-2.5 text-[0.75rem] font-semibold text-[var(--text-main)]">
                        {wf.name}
                      </td>
                      <td className="px-5 py-2.5 text-[0.625rem] font-mono text-[var(--text-muted)]">
                        {formatRelativeTime(wf.last_run_at)}
                      </td>
                      <td className="px-5 py-2.5 text-[0.625rem] font-mono text-[var(--text-muted)]">
                        {wf.run_count ?? 0}
                      </td>
                      <td className="px-5 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void runWorkflow(wf)}
                          disabled={!!workflowsBusyId}
                          className="px-3 py-1.5 rounded-lg text-[0.625rem] font-bold uppercase tracking-widest transition-all disabled:opacity-40"
                          style={{ background: 'var(--solar-cyan)15', border: '1px solid var(--solar-cyan)35', color: 'var(--solar-cyan)' }}
                        >
                          {workflowsBusyId === wf.id ? 'Running…' : 'Run'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>

      {/* ── Workspace overlay ─────────────────────────────────────────────── */}
      {activeAgent && (
        <WorkspacePanel agentId={activeAgent} agents={agents.length ? agents : FALLBACK_AGENTS} onClose={() => setActiveAgent(null)} />
      )}
    </div>
  );
};

export default McpPage;
