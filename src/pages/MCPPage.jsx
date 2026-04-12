/**
 * MCPPage.jsx — Multi-agent MCP pipeline dashboard
 * Inner Animal Media — Agent Sam Dashboard
 *
 * Drop into: src/pages/MCPPage.jsx (or MCPPage.tsx with type annotations below)
 * Peer deps: react (hooks only), no external UI libs
 * Theme: all chrome via global.css tokens (--bg-app, --bg-panel, --bg-elevated,
 *         --text-main, --text-muted, --text-heading, --border-subtle,
 *         --border-focus, --accent-primary, --font-sans, --font-mono,
 *         --radius-sm, --radius-md, --radius-lg, --radius-full)
 * Agent-specific colors are injected as local props — never hardcoded in chrome.
 *
 * TypeScript annotations (strip prefix/suffix to convert):
 * @typedef {{ id: string, name: string, role: string, color: string,
 *             steps: string[], tools: AgentTool[], systemPrompt: string }} AgentCfg
 * @typedef {{ name: string, category: string, desc: string }} AgentTool
 * @typedef {{ status?: string, current_task?: string, progress_pct?: number,
 *             step_index?: number, cost_usd?: number, input_tokens?: number,
 *             output_tokens?: number, logs_json?: string,
 *             conversation_id?: string }} AgentState
 * @typedef {{ ts: string, tool: string, ok: boolean, preview: string }} ToolCall
 */

import { useState, useEffect, useRef, useCallback } from "react";

// ─── Agent config ─────────────────────────────────────────────────────────────

/** @type {AgentCfg[]} */
const AGENTS = [
  {
    id: "mcp_agent_architect",
    name: "Architect",
    role: "Plan / Research / Spec",
    color: "#4A90D9",
    steps: ["Research", "Analyze", "Design", "Spec Output"],
    systemPrompt: "You are the Architect agent. Research before generating. Use knowledge_search first, then d1_query. Output structured specs — never raw code.",
    tools: [
      { name: "knowledge_search", category: "search",   desc: "Full-text search against D1 autorag table — query intent tags and past context" },
      { name: "d1_query",         category: "database", desc: "Read-only SQL against inneranimalmedia-business (cf87b717)" },
      { name: "r2_list",          category: "storage",  desc: "List objects across all six R2 buckets" },
      { name: "r2_read",          category: "storage",  desc: "Read file content from R2 via AWS Sig V4" },
    ],
  },
  {
    id: "mcp_agent_builder",
    name: "Builder",
    role: "Code / Generate / Write",
    color: "#C0392B",
    steps: ["Parse Spec", "Scaffold", "Implement", "Stage"],
    systemPrompt: "You are the Builder agent. Parse the Architect spec, scaffold clean code, implement with no hardcoded config — all values from D1. Write to R2 via r2_write. Stage to sandbox before prod.",
    tools: [
      { name: "d1_query",      category: "database", desc: "Read SQL — schema inspect, routing rules, config lookup" },
      { name: "d1_write",      category: "database", desc: "INSERT / UPDATE / DELETE on D1 — audit trail required" },
      { name: "r2_list",       category: "storage",  desc: "List R2 bucket contents — enumerate before write" },
      { name: "r2_read",       category: "storage",  desc: "Read existing files before overwriting" },
      { name: "r2_write",      category: "storage",  desc: "Write / overwrite via AWS Sig V4 S3 — full CRUD across all buckets" },
      { name: "worker_deploy", category: "execute",  desc: "Deploy Cloudflare Worker — sandbox first via deploy-sandbox.sh" },
    ],
  },
  {
    id: "mcp_agent_tester",
    name: "Tester",
    role: "Debug / Inspect / Validate",
    color: "#27AE60",
    steps: ["Load Case", "Execute", "Assert", "Report"],
    systemPrompt: "You are the Tester agent. Load the spec, execute test cases, assert against expected DB/R2 state. Produce a diff report. Surface failures with exact query + actual vs expected.",
    tools: [
      { name: "d1_query",        category: "database", desc: "Inspect DB state — assert row counts, FK integrity, expected values" },
      { name: "r2_list",         category: "storage",  desc: "Verify expected R2 artifacts exist post-deploy" },
      { name: "r2_read",         category: "storage",  desc: "Read and diff file contents against expected" },
      { name: "terminal_execute", category: "execute",  desc: "Run test commands via PTY tunnel at terminal.inneranimalmedia.com:3099" },
    ],
  },
  {
    id: "mcp_agent_operator",
    name: "Operator",
    role: "Deploy / Monitor / Maintain",
    color: "#D4A017",
    steps: ["Pre-check", "Deploy", "Health Check", "Monitor"],
    systemPrompt: "You are the Operator agent. Always pre-check D1 deploy_records before deploying. Run sandbox deploy first, then promote. Health-check every endpoint after deploy. Never skip audit.",
    tools: [
      { name: "d1_query",         category: "database", desc: "Query deploy_records, worker_versions, worker_version_id for audit trail" },
      { name: "r2_read",          category: "storage",  desc: "Read deploy config, wrangler.production.toml artifacts" },
      { name: "worker_deploy",    category: "execute",  desc: "deploy-sandbox.sh → promote-to-prod.sh — never npm run deploy alone" },
      { name: "terminal_execute", category: "execute",  desc: "Shell commands via PTY — wrangler tail, health checks, PM2 status" },
    ],
  },
];

// ─── Pricing (claude-haiku-4-5 default) ──────────────────────────────────────
const PRICING = { input: 0.00000025, output: 0.00000125 };

// ─── Utilities ────────────────────────────────────────────────────────────────

const BASE = typeof window !== "undefined" ? window.location.origin : "";

/** @param {number} n */
function fmtTokens(n = 0) {
  if (!n) return "0";
  return n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
}

/** @param {number=} usd */
function fmtCost(usd) {
  if (usd == null || usd === 0) return "$0.000";
  if (usd < 0.0001) return "$" + usd.toFixed(6);
  return "$" + usd.toFixed(4);
}

function calcCost(inp = 0, out = 0) {
  return inp * PRICING.input + out * PRICING.output;
}

function tsNow() {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ─── Shared micro-components ──────────────────────────────────────────────────

/** @param {{ status?: string, color: string }} props */
function StatusDot({ status = "idle", color }) {
  const colors = {
    idle:    "var(--text-muted)",
    running: color,
    waiting: "var(--accent-warning)",
    error:   "var(--accent-danger)",
    success: "#27ae60",
  };
  return (
    <span
      aria-label={status}
      style={{
        display:      "inline-block",
        width:        9,
        height:       9,
        borderRadius: "50%",
        flexShrink:   0,
        background:   colors[status] ?? colors.idle,
        animation:    status === "running" ? "dotPulse 1.4s ease infinite" : "none",
      }}
    />
  );
}

/**
 * Horizontal step breadcrumb
 * @param {{ steps: string[], activeIndex: number, color: string }} props
 */
function StepTracker({ steps, activeIndex = -1, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0, flexWrap: "nowrap", overflow: "hidden" }}>
      {steps.map((step, i) => {
        const done    = i < activeIndex;
        const current = i === activeIndex;
        return (
          <span key={step} style={{ display: "flex", alignItems: "center", minWidth: 0 }}>
            {i > 0 && (
              <span style={{ color: "var(--border-subtle)", margin: "0 5px", fontSize: 9, flexShrink: 0 }}>›</span>
            )}
            <span style={{
              fontSize:       10,
              fontFamily:     "var(--font-mono)",
              fontWeight:     current ? 700 : 400,
              color:          done ? "var(--text-muted)" : current ? color : "var(--text-muted)",
              opacity:        i > activeIndex && activeIndex >= 0 ? 0.4 : 1,
              textDecoration: done ? "line-through" : "none",
              whiteSpace:     "nowrap",
              display:        "flex",
              alignItems:     "center",
              gap:            3,
            }}>
              {current && (
                <span style={{
                  width:        5,
                  height:       5,
                  borderRadius: "50%",
                  background:   color,
                  flexShrink:   0,
                  animation:    "dotPulse 1.4s ease infinite",
                }} />
              )}
              {step}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** @param {{ inputTokens?: number, outputTokens?: number, costUsd?: number, color: string }} props */
function CostDisplay({ inputTokens = 0, outputTokens = 0, costUsd, color }) {
  const total = costUsd ?? calcCost(inputTokens, outputTokens);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 10, fontFamily: "var(--font-mono)" }}>
      <span style={{ color: "var(--text-muted)" }}>
        <span style={{ opacity: 0.55, marginRight: 2 }}>in</span>
        {fmtTokens(inputTokens)}
      </span>
      <span style={{ color: "var(--text-muted)" }}>
        <span style={{ opacity: 0.55, marginRight: 2 }}>out</span>
        {fmtTokens(outputTokens)}
      </span>
      <span style={{ marginLeft: "auto", fontWeight: 700, fontSize: 11, color }}>{fmtCost(total)}</span>
    </div>
  );
}

/** @param {{ tools: AgentTool[], color: string, max?: number }} props */
function ToolBadges({ tools, color, max = 4 }) {
  const visible = tools.slice(0, max);
  const extra   = tools.length - max;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {visible.map(t => (
        <span key={t.name} style={{
          fontSize:     10,
          fontFamily:   "var(--font-mono)",
          padding:      "2px 6px",
          borderRadius: "var(--radius-sm)",
          background:   `${color}16`,
          border:       `1px solid ${color}30`,
          color:        "var(--text-muted)",
          whiteSpace:   "nowrap",
        }}>
          {t.name}
        </span>
      ))}
      {extra > 0 && (
        <span style={{
          fontSize:     10,
          padding:      "2px 6px",
          color:        "var(--text-muted)",
          borderRadius: "var(--radius-sm)",
          border:       "1px solid var(--border-subtle)",
        }}>
          +{extra}
        </span>
      )}
    </div>
  );
}

/** @param {{ lines: string[], color: string }} props */
function LogStream({ lines = [], color }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);
  return (
    <div ref={ref} style={{
      background:     "var(--bg-app)",
      border:         "1px solid var(--border-subtle)",
      borderRadius:   "var(--radius-sm)",
      padding:        "5px 8px",
      fontFamily:     "var(--font-mono)",
      fontSize:       10,
      color:          "var(--text-muted)",
      minHeight:      46,
      maxHeight:      46,
      overflow:       "hidden",
      display:        "flex",
      flexDirection:  "column",
      justifyContent: "flex-end",
      gap:            2,
    }}>
      {lines.length === 0 ? (
        <span style={{ opacity: 0.35 }}>No activity yet</span>
      ) : (
        lines.slice(-3).map((line, i) => (
          <div key={i} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: 1.5 }}>
            <span style={{ color, marginRight: 4, userSelect: "none" }}>›</span>
            {line}
          </div>
        ))
      )}
    </div>
  );
}

// ─── AgentCard ────────────────────────────────────────────────────────────────

/**
 * @param {{ cfg: AgentCfg, state: AgentState, onOpen: () => void }} props
 */
function AgentCard({ cfg, state, onOpen }) {
  const { name, role, color, steps, tools } = cfg;
  const {
    status = "idle",
    current_task = "",
    progress_pct = 0,
    step_index   = -1,
    input_tokens = 0,
    output_tokens = 0,
    cost_usd,
    logs_json = "[]",
  } = state;

  let logs = [];
  try { logs = JSON.parse(logs_json); } catch (_) {}

  return (
    <div style={{
      background:     "var(--bg-elevated)",
      border:         "1px solid var(--border-subtle)",
      borderLeft:     `4px solid ${color}`,
      borderRadius:   "var(--radius-lg)",
      padding:        "15px 16px 13px",
      display:        "flex",
      flexDirection:  "column",
      gap:            10,
      transition:     "box-shadow 0.2s",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-heading)", letterSpacing: "-0.01em" }}>
            {name}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.07em", marginTop: 2 }}>
            {role}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--text-muted)", opacity: 0.7 }}>{status}</span>
          <StatusDot status={status} color={color} />
        </div>
      </div>

      {/* Step tracker */}
      <StepTracker steps={steps} activeIndex={step_index} color={color} />

      {/* Current task */}
      <div style={{
        fontSize:     12,
        color:        current_task ? "var(--text-main)" : "var(--text-muted)",
        fontStyle:    current_task ? "normal" : "italic",
        whiteSpace:   "nowrap",
        overflow:     "hidden",
        textOverflow: "ellipsis",
        minHeight:    17,
        lineHeight:   1.4,
      }}>
        {current_task || "Waiting for task..."}
      </div>

      {/* Progress bar — only render when active */}
      <div style={{ height: 3, background: "var(--border-subtle)", borderRadius: "var(--radius-full)", overflow: "hidden" }}>
        <div style={{
          height:       "100%",
          width:        `${progress_pct}%`,
          background:   color,
          borderRadius: "var(--radius-full)",
          transition:   "width 0.5s ease",
        }} />
      </div>

      {/* Cost row */}
      <CostDisplay inputTokens={input_tokens} outputTokens={output_tokens} costUsd={cost_usd} color={color} />

      {/* Log tail */}
      <LogStream lines={logs} color={color} />

      {/* Footer: tool badges + open button */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <ToolBadges tools={tools} color={color} max={3} />
        <button
          onClick={onOpen}
          style={{
            marginLeft:   "auto",
            padding:      "5px 12px",
            borderRadius: "var(--radius-md)",
            border:       `1px solid ${color}50`,
            background:   `${color}12`,
            color,
            fontSize:     11,
            fontFamily:   "var(--font-sans)",
            fontWeight:   600,
            cursor:       "pointer",
            whiteSpace:   "nowrap",
            transition:   "background 0.15s, border-color 0.15s",
            flexShrink:   0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.borderColor = `${color}80`; }}
          onMouseLeave={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}50`; }}
        >
          Open Workspace
        </button>
      </div>
    </div>
  );
}

// ─── WorkspaceOverlay: Pipeline pane ─────────────────────────────────────────

/**
 * @param {{ cfg: AgentCfg, state: AgentState, toolCalls: ToolCall[] }} props
 */
function PipelinePane({ cfg, state, toolCalls }) {
  const { steps, color } = cfg;
  const { step_index = -1, progress_pct = 0 } = state;
  const logRef = useRef(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [toolCalls]);

  return (
    <div style={{
      width:         300,
      flexShrink:    0,
      display:       "flex",
      flexDirection: "column",
      borderLeft:    "1px solid var(--border-subtle)",
      borderRight:   "1px solid var(--border-subtle)",
      overflow:      "hidden",
    }}>
      {/* Section label */}
      <SectionLabel>Pipeline</SectionLabel>

      {/* Step list */}
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
        {steps.map((step, i) => {
          const done    = i < step_index;
          const current = i === step_index;
          const pct     = current ? progress_pct : done ? 100 : 0;
          return (
            <div key={step} style={{
              padding:    "8px 10px",
              borderRadius: "var(--radius-md)",
              border:     `1px solid ${current ? color + "55" : "var(--border-subtle)"}`,
              background: current ? `${color}10` : "transparent",
              opacity:    !done && !current && step_index >= 0 ? 0.4 : 1,
              transition: "opacity 0.2s, background 0.2s",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Step circle */}
                <span style={{
                  width:          18,
                  height:         18,
                  borderRadius:   "50%",
                  background:     done ? color : current ? `${color}20` : "transparent",
                  border:         `2px solid ${done || current ? color : "var(--border-subtle)"}`,
                  fontSize:       8,
                  fontFamily:     "var(--font-mono)",
                  fontWeight:     700,
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  color:          done ? "#fff" : current ? color : "var(--text-muted)",
                  flexShrink:     0,
                  transition:     "background 0.3s",
                }}>
                  {done ? "✓" : i + 1}
                </span>
                <span style={{
                  flex:       1,
                  fontSize:   12,
                  fontWeight: current ? 700 : 400,
                  color:      current ? "var(--text-heading)" : "var(--text-muted)",
                }}>
                  {step}
                </span>
                {current && (
                  <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color, flexShrink: 0 }}>
                    {pct}%
                  </span>
                )}
              </div>
              {/* Step progress bar */}
              {current && (
                <div style={{ height: 2, background: "var(--border-subtle)", borderRadius: "var(--radius-full)", overflow: "hidden", marginTop: 7 }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "var(--radius-full)", transition: "width 0.4s" }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tool call log */}
      <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: "auto", display: "flex", flexDirection: "column", maxHeight: 200 }}>
        <SectionLabel>Tool Calls ({toolCalls.length})</SectionLabel>
        <div ref={logRef} style={{ overflowY: "auto", padding: "6px 12px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {toolCalls.length === 0 ? (
            <span style={{ fontSize: 11, color: "var(--text-muted)", opacity: 0.4 }}>None yet</span>
          ) : (
            toolCalls.map((tc, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, fontFamily: "var(--font-mono)", lineHeight: 1.4 }}>
                <span style={{ color: "var(--text-muted)", flexShrink: 0, opacity: 0.6 }}>{tc.ts}</span>
                <span style={{ color, fontWeight: 700, flexShrink: 0 }}>{tc.tool}</span>
                <span style={{
                  color:     tc.ok ? "#27ae60" : "var(--accent-danger)",
                  flexShrink: 0,
                  fontSize:   9,
                }}>
                  {tc.ok ? "ok" : "err"}
                </span>
                <span style={{ color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: 0.7 }}>
                  {tc.preview}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WorkspaceOverlay: Chat pane ──────────────────────────────────────────────

/**
 * @param {{ cfg: AgentCfg, messages: Array, onSend: (msg: string) => void, loading: boolean }} props
 */
function ChatPane({ cfg, messages, onSend, loading }) {
  const [draft,  setDraft]  = useState("");
  const listRef  = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  function send() {
    const msg = draft.trim();
    if (!msg || loading) return;
    setDraft("");
    onSend(msg);
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
      <SectionLabel>Conversation</SectionLabel>

      {/* Message list */}
      <div ref={listRef} style={{
        flex:          1,
        overflowY:     "auto",
        padding:       "12px 16px",
        display:       "flex",
        flexDirection: "column",
        gap:           10,
      }}>
        {messages.map((m, i) => {
          const isUser    = m.role === "user";
          const isThink   = m.role === "thinking";
          return (
            <div key={i} style={{
              maxWidth:   "84%",
              alignSelf:  isUser ? "flex-end" : "flex-start",
              padding:    isThink ? "4px 0" : "9px 13px",
              borderRadius: isUser
                ? "var(--radius-lg) var(--radius-lg) var(--radius-xs) var(--radius-lg)"
                : "var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--radius-xs)",
              background: isThink ? "transparent" : isUser ? cfg.color : "var(--bg-panel)",
              color:      isThink ? "var(--text-muted)" : isUser ? "#fff" : "var(--text-main)",
              border:     !isUser && !isThink ? "1px solid var(--border-subtle)" : "none",
              fontSize:   isThink ? 11 : 13,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              fontFamily: isThink ? "var(--font-mono)" : "var(--font-sans)",
              fontStyle:  isThink ? "italic" : "normal",
            }}>
              {m.content}
            </div>
          );
        })}
        {loading && (
          <div style={{ alignSelf: "flex-start", fontSize: 11, fontStyle: "italic", color: "var(--text-muted)", fontFamily: "var(--font-mono)", padding: "2px 0" }}>
            Thinking...
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{
        padding:     "10px 14px",
        borderTop:   "1px solid var(--border-subtle)",
        background:  "var(--bg-panel)",
        display:     "flex",
        gap:         8,
        alignItems:  "flex-end",
        flexShrink:  0,
      }}>
        <textarea
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Message agent... (Enter sends, Shift+Enter newline)"
          rows={2}
          style={{
            flex:        1,
            padding:     "7px 10px",
            background:  "var(--bg-app)",
            border:      "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            color:       "var(--text-main)",
            fontFamily:  "var(--font-sans)",
            fontSize:    13,
            resize:      "none",
            outline:     "none",
            lineHeight:  1.4,
            transition:  "border-color 0.15s",
          }}
          onFocus={e  => { e.target.style.borderColor = "var(--border-focus)"; }}
          onBlur={e   => { e.target.style.borderColor = "var(--border-subtle)"; }}
          id="wsInput"
        />
        <button
          onClick={send}
          disabled={loading || !draft.trim()}
          style={{
            padding:      "0 16px",
            height:       56,
            borderRadius: "var(--radius-md)",
            border:       "none",
            background:   cfg.color,
            color:        "#fff",
            fontSize:     13,
            fontWeight:   600,
            fontFamily:   "var(--font-sans)",
            cursor:       loading || !draft.trim() ? "default" : "pointer",
            opacity:      loading || !draft.trim() ? 0.35 : 1,
            transition:   "opacity 0.15s",
            flexShrink:   0,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// ─── WorkspaceOverlay: Sidebar ────────────────────────────────────────────────

/**
 * @param {{ cfg: AgentCfg, state: AgentState, toolCalls: ToolCall[], sessionId: string|null, onInjectTool: (t: AgentTool) => void }} props
 */
function WorkspaceSidebar({ cfg, state, toolCalls, sessionId, onInjectTool }) {
  const { tools, color, steps } = cfg;
  const {
    status       = "idle",
    step_index   = -1,
    progress_pct = 0,
    current_task = "",
    input_tokens  = 0,
    output_tokens = 0,
    cost_usd,
  } = state;

  const total   = cost_usd ?? calcCost(input_tokens, output_tokens);
  const [filter, setFilter] = useState("");

  const filtered = tools.filter(t =>
    !filter ||
    t.name.toLowerCase().includes(filter.toLowerCase()) ||
    t.desc.toLowerCase().includes(filter.toLowerCase())
  );

  const byCat = filtered.reduce((acc, t) => {
    (acc[t.category] = acc[t.category] || []).push(t);
    return acc;
  }, {});

  return (
    <div style={{
      width:        260,
      flexShrink:   0,
      display:      "flex",
      flexDirection: "column",
      overflowY:    "auto",
      background:   "var(--bg-elevated)",
    }}>
      {/* Tools */}
      <CollapsibleSection title="Tools" defaultOpen>
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter tools..."
          style={{
            width:        "100%",
            padding:      "5px 8px",
            marginBottom: 8,
            fontSize:     11,
            borderRadius: "var(--radius-sm)",
            border:       "1px solid var(--border-subtle)",
            background:   "var(--bg-app)",
            color:        "var(--text-main)",
            fontFamily:   "var(--font-sans)",
            outline:      "none",
            boxSizing:    "border-box",
          }}
        />
        {Object.entries(byCat).map(([cat, items]) => (
          <div key={cat} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)", marginBottom: 5, paddingLeft: 2 }}>
              {cat}
            </div>
            {items.map(t => (
              <button
                key={t.name}
                onClick={() => onInjectTool(t)}
                title={t.desc}
                style={{
                  display:      "flex",
                  alignItems:   "flex-start",
                  gap:          7,
                  width:        "100%",
                  textAlign:    "left",
                  padding:      "6px 8px",
                  marginBottom: 3,
                  borderRadius: "var(--radius-sm)",
                  border:       "1px solid var(--border-subtle)",
                  background:   "var(--bg-app)",
                  color:        "var(--text-main)",
                  fontFamily:   "var(--font-sans)",
                  fontSize:     11,
                  cursor:       "pointer",
                  transition:   "background 0.1s, border-color 0.1s",
                }}
                onMouseEnter={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}40`; }}
                onMouseLeave={e => { e.currentTarget.style.background = "var(--bg-app)"; e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
              >
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, marginTop: 3, flexShrink: 0 }} />
                <span style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, wordBreak: "break-all" }}>{t.name}</span>
                  <span style={{ fontSize: 10, color: "var(--text-muted)", lineHeight: 1.3, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {t.desc}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </CollapsibleSection>

      {/* Session */}
      <CollapsibleSection title="Session" defaultOpen>
        <KVRow k="Status"   v={status} />
        <KVRow k="Step"     v={step_index >= 0 ? `${steps[step_index]} (${step_index + 1}/${steps.length})` : "—"} />
        <KVRow k="Progress" v={progress_pct ? `${progress_pct}%` : "—"} />
        {current_task && <KVRow k="Task" v={current_task} small />}
        {sessionId && <KVRow k="Session ID" v={sessionId.slice(0, 14) + "..."} mono small />}
      </CollapsibleSection>

      {/* Cost breakdown */}
      <CollapsibleSection title="Cost" defaultOpen>
        <KVRow k="Input tokens"  v={fmtTokens(input_tokens)}  mono />
        <KVRow k="Output tokens" v={fmtTokens(output_tokens)} mono />
        <KVRow k="Tool calls"    v={String(toolCalls.length)} mono />
        <div style={{
          marginTop:      8,
          padding:        "8px 10px",
          borderRadius:   "var(--radius-sm)",
          background:     `${color}14`,
          border:         `1px solid ${color}30`,
          display:        "flex",
          justifyContent: "space-between",
          alignItems:     "center",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Total cost</span>
          <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-mono)", color }}>{fmtCost(total)}</span>
        </div>
      </CollapsibleSection>
    </div>
  );
}

// ─── WorkspaceOverlay (full-screen) ──────────────────────────────────────────

/**
 * @param {{ agentId: string, state: AgentState, onClose: () => void }} props
 */
function WorkspaceOverlay({ agentId, state, onClose }) {
  const cfg = AGENTS.find(a => a.id === agentId);

  const [messages,   setMessages]   = useState([
    { role: "assistant", content: `${cfg?.name ?? "Agent"} is ready. Send a message to begin.` },
  ]);
  const [loading,    setLoading]    = useState(false);
  const [toolCalls,  setToolCalls]  = useState(/** @type {ToolCall[]} */ ([]));
  const [sessionId,  setSessionId]  = useState(null);
  const [localState, setLocalState] = useState(state);

  const conversation = useRef(/** @type {Array} */ ([]));

  // Keep localState synced from parent polling
  useEffect(() => { setLocalState(state); }, [state]);

  // Escape key closes
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  /** @param {string} msg */
  async function handleSend(msg) {
    conversation.current.push({ role: "user", content: msg });
    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setLoading(true);

    try {
      const res = await fetch(`${BASE}/api/agent/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          messages:   conversation.current,
          agent_id:   agentId,
          session_id: sessionId,
          model_id:   "auto",
        }),
      });

      const d = await res.json();

      // Resolve reply text from various API shapes
      const reply =
        d.content?.[0]?.text ||
        d.response ||
        d.message ||
        d.choices?.[0]?.message?.content ||
        (d.error ? `Error: ${d.error}` : JSON.stringify(d, null, 2));

      // Session tracking
      if (d.conversation_id && !sessionId) setSessionId(d.conversation_id);

      // Extract tool calls if returned
      if (Array.isArray(d.tool_calls) && d.tool_calls.length > 0) {
        const calls = d.tool_calls.map(tc => ({
          ts:      tsNow(),
          tool:    tc.name || tc.tool_name || "unknown",
          ok:      !tc.error,
          preview: tc.input ? JSON.stringify(tc.input).slice(0, 50) : "",
        }));
        setToolCalls(prev => [...prev, ...calls]);
      }

      // Token / cost update from usage block
      if (d.usage) {
        setLocalState(prev => ({
          ...prev,
          input_tokens:  (prev.input_tokens  || 0) + (d.usage.input_tokens  || 0),
          output_tokens: (prev.output_tokens || 0) + (d.usage.output_tokens || 0),
        }));
      }

      conversation.current.push({ role: "assistant", content: reply });
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);

    } catch (err) {
      const msg = `Request failed: ${err?.message ?? "network error"}`;
      conversation.current.push({ role: "assistant", content: msg });
      setMessages(prev => [...prev, { role: "assistant", content: msg }]);
    } finally {
      setLoading(false);
    }
  }

  /** @param {AgentTool} tool */
  function handleInjectTool(tool) {
    const el = document.getElementById("wsInput");
    if (el) {
      el.value = `Use the ${tool.name} tool. ${tool.desc}`;
      el.focus();
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  if (!cfg) return null;

  return (
    <div
      role="dialog"
      aria-label={`${cfg.name} workspace`}
      style={{
        position:      "fixed",
        inset:         0,
        zIndex:        900,
        background:    "var(--bg-app)",
        display:       "flex",
        flexDirection: "column",
        fontFamily:    "var(--font-sans)",
      }}
    >
      {/* Header */}
      <div style={{
        display:     "flex",
        alignItems:  "center",
        gap:         12,
        padding:     "0 18px",
        height:      50,
        borderBottom: "1px solid var(--border-subtle)",
        background:  "var(--bg-panel)",
        flexShrink:  0,
      }}>
        <div style={{ width: 4, height: 26, borderRadius: "var(--radius-xs)", background: cfg.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-heading)", letterSpacing: "-0.01em" }}>{cfg.name}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{cfg.role}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <StatusDot status={localState.status || "idle"} color={cfg.color} />
          <CostDisplay
            inputTokens={localState.input_tokens}
            outputTokens={localState.output_tokens}
            costUsd={localState.cost_usd}
            color={cfg.color}
          />
        </div>
        <button
          onClick={onClose}
          aria-label="Close workspace"
          style={{
            marginLeft:   12,
            border:       "1px solid var(--border-subtle)",
            background:   "transparent",
            color:        "var(--text-muted)",
            borderRadius: "var(--radius-sm)",
            width:        28,
            height:       28,
            cursor:       "pointer",
            fontSize:     14,
            display:      "flex",
            alignItems:   "center",
            justifyContent: "center",
            fontFamily:   "var(--font-sans)",
            transition:   "color 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.color = "var(--text-main)"; e.currentTarget.style.borderColor = "var(--text-muted)"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.borderColor = "var(--border-subtle)"; }}
        >
          x
        </button>
      </div>

      {/* Three-pane body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <ChatPane
          cfg={cfg}
          messages={messages}
          onSend={handleSend}
          loading={loading}
        />
        <PipelinePane
          cfg={cfg}
          state={localState}
          toolCalls={toolCalls}
        />
        <WorkspaceSidebar
          cfg={cfg}
          state={localState}
          toolCalls={toolCalls}
          sessionId={sessionId}
          onInjectTool={handleInjectTool}
        />
      </div>
    </div>
  );
}

// ─── CommandBar ───────────────────────────────────────────────────────────────

/**
 * @param {{ suggestions: Array, onDispatch: (d: object) => void }} props
 */
function CommandBar({ suggestions, onDispatch }) {
  const [value,   setValue]   = useState("");
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);

  const pinned   = suggestions.filter(s => s.is_pinned);
  const filtered = value
    ? suggestions.filter(s =>
        (s.label        || "").toLowerCase().includes(value.toLowerCase()) ||
        (s.description  || "").toLowerCase().includes(value.toLowerCase()) ||
        (s.example_prompt || "").toLowerCase().includes(value.toLowerCase())
      )
    : suggestions;

  useEffect(() => {
    function outside(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);

  /** @param {string} prompt */
  async function dispatch(prompt) {
    if (!prompt.trim()) return;
    setValue(prompt);
    setOpen(false);
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/mcp/dispatch`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prompt }),
      });
      const d = await res.json();
      if (d.agent_id) onDispatch(d);
    } catch (_) {}
    setLoading(false);
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", marginBottom: 20 }}>
      <div style={{ position: "relative" }}>
        {/* Prefix glyph */}
        <span style={{
          position:   "absolute",
          left:        14,
          top:         "50%",
          transform:   "translateY(-50%)",
          fontFamily:  "var(--font-mono)",
          fontSize:    13,
          color:       loading ? "var(--accent-secondary)" : "var(--text-muted)",
          pointerEvents: "none",
          transition:  "color 0.2s",
        }}>
          {loading ? "..." : ">_"}
        </span>
        <input
          value={value}
          onChange={e => { setValue(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter" && value.trim()) { e.preventDefault(); dispatch(value.trim()); }
            if (e.key === "Escape") { setOpen(false); }
          }}
          placeholder='Route to agent...  e.g. "debug why /api/agent/chat returns 404"'
          autoComplete="off"
          style={{
            width:        "100%",
            padding:      "12px 16px 12px 44px",
            background:   "var(--bg-elevated)",
            border:       `1px solid ${open ? "var(--border-focus)" : "var(--border-subtle)"}`,
            borderRadius: "var(--radius-lg)",
            color:        "var(--text-main)",
            fontFamily:   "var(--font-mono)",
            fontSize:     13,
            outline:      "none",
            boxSizing:    "border-box",
            transition:   "border-color 0.15s",
          }}
        />
      </div>

      {open && (
        <div style={{
          position:     "absolute",
          left:          0,
          right:         0,
          top:           "calc(100% + 6px)",
          background:   "var(--bg-elevated)",
          border:       "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-lg)",
          zIndex:        200,
          boxShadow:    "0 12px 40px rgba(0,0,0,0.35)",
          overflow:     "hidden",
        }}>
          {/* Pinned chips */}
          {pinned.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "8px 12px", borderBottom: "1px solid var(--border-subtle)" }}>
              {pinned.map(s => {
                const agCfg = AGENTS.find(a => a.id === s.routed_to_agent);
                const c = agCfg?.color || "var(--accent-primary)";
                return (
                  <button
                    key={s.label}
                    onClick={() => dispatch(s.example_prompt)}
                    style={{
                      padding:      "3px 10px",
                      borderRadius: "var(--radius-full)",
                      border:       `1px solid ${c}40`,
                      background:   `${c}16`,
                      color:         c,
                      fontSize:      11,
                      fontWeight:    600,
                      fontFamily:   "var(--font-sans)",
                      cursor:       "pointer",
                      whiteSpace:   "nowrap",
                    }}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Suggestion rows */}
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-muted)" }}>No suggestions</div>
            ) : (
              filtered.map(s => {
                const agCfg    = AGENTS.find(a => a.id === s.routed_to_agent);
                const c        = agCfg?.color || "var(--accent-primary)";
                const agName   = agCfg?.name || s.routed_to_agent || "?";
                return (
                  <button
                    key={s.label}
                    onClick={() => dispatch(s.example_prompt)}
                    style={{
                      display:      "flex",
                      alignItems:   "center",
                      gap:           10,
                      width:        "100%",
                      padding:      "9px 14px",
                      background:   "none",
                      border:       "none",
                      borderBottom: "1px solid var(--border-subtle)",
                      cursor:       "pointer",
                      textAlign:    "left",
                      fontFamily:   "var(--font-sans)",
                      transition:   "background 0.1s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-main)" }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {s.description}
                      </div>
                    </div>
                    <span style={{
                      padding:      "2px 8px",
                      borderRadius: "var(--radius-sm)",
                      background:    c,
                      color:        "#fff",
                      fontSize:     10,
                      fontWeight:   700,
                      flexShrink:   0,
                    }}>
                      {agName}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ServicesPanel ────────────────────────────────────────────────────────────

function ServicesPanel() {
  const [open,   setOpen]   = useState(false);
  const [svcs,   setSvcs]   = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form,   setForm]   = useState({ name: "", url: "", type: "mcp-server" });

  function load() {
    if (loaded) return;
    setLoaded(true);
    fetch(`${BASE}/api/mcp/services`)
      .then(r => r.json())
      .then(d => setSvcs(Array.isArray(d.services) ? d.services : Array.isArray(d.results) ? d.results : []))
      .catch(() => {});
  }

  const HEALTH_COLOR = {
    healthy:    "#27ae60",
    degraded:   "var(--accent-warning)",
    down:       "var(--accent-danger)",
    unverified: "var(--text-muted)",
  };

  async function save() {
    if (!form.name.trim() || !form.url.trim()) return;
    try {
      const r = await fetch(`${BASE}/api/mcp/services`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ service_name: form.name, endpoint_url: form.url, service_type: form.type }),
      });
      const d = await r.json();
      if (d.ok || d.id) { setAdding(false); setLoaded(false); load(); }
    } catch (_) {}
  }

  return (
    <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-lg)", overflow: "hidden", marginBottom: 24 }}>
      <button
        onClick={() => { setOpen(o => { if (!o) load(); return !o; }); }}
        style={{
          display:      "flex",
          alignItems:   "center",
          justifyContent: "space-between",
          width:        "100%",
          padding:      "13px 18px",
          background:   "none",
          border:       "none",
          cursor:       "pointer",
          fontFamily:   "var(--font-sans)",
          transition:   "background 0.15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background = "var(--bg-hover)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-heading)" }}>
          MCP Connections
          {svcs.length > 0 && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "var(--text-muted)", fontWeight: 400 }}>({svcs.length})</span>
          )}
        </span>
        <span style={{ fontSize: 16, color: "var(--text-muted)", display: "inline-block", transform: open ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>+</span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--border-subtle)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                {["Service", "Endpoint", "Health"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 16px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {svcs.length === 0 ? (
                <tr>
                  <td colSpan={3} style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>No connections registered</td>
                </tr>
              ) : (
                svcs.map(s => {
                  const h = (s.health_status || "unverified").toLowerCase();
                  return (
                    <tr key={s.id || s.service_name}>
                      <td style={{ padding: "9px 16px", color: "var(--text-main)", fontWeight: 600, borderBottom: "1px solid var(--border-subtle)" }}>
                        {s.service_name || s.name || s.id}
                      </td>
                      <td style={{ padding: "9px 16px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", borderBottom: "1px solid var(--border-subtle)", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.endpoint_url || s.url || "—"}
                      </td>
                      <td style={{ padding: "9px 16px", borderBottom: "1px solid var(--border-subtle)" }}>
                        <span style={{
                          fontSize:     10,
                          padding:      "2px 7px",
                          borderRadius: "var(--radius-sm)",
                          fontWeight:   600,
                          background:   `${HEALTH_COLOR[h] ?? HEALTH_COLOR.unverified}20`,
                          color:        HEALTH_COLOR[h] ?? HEALTH_COLOR.unverified,
                          textTransform: "capitalize",
                        }}>
                          {h}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          <div style={{ padding: "10px 16px", borderTop: "1px solid var(--border-subtle)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button
              onClick={() => setAdding(a => !a)}
              style={{ padding: "5px 12px", borderRadius: "var(--radius-md)", border: "none", background: "var(--accent-primary)", color: "#fff", fontSize: 11, fontWeight: 600, fontFamily: "var(--font-sans)", cursor: "pointer" }}
            >
              + New Connection
            </button>
          </div>

          {adding && (
            <div style={{ padding: "10px 16px 14px", borderTop: "1px solid var(--border-subtle)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              {[
                { field: "name", placeholder: "Service name" },
                { field: "url",  placeholder: "https://endpoint.workers.dev" },
              ].map(({ field, placeholder }) => (
                <input
                  key={field}
                  value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ flex: 1, minWidth: 160, padding: "7px 9px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "var(--bg-app)", color: "var(--text-main)", fontSize: 12, fontFamily: "var(--font-sans)", outline: "none" }}
                />
              ))}
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{ padding: "7px 9px", borderRadius: "var(--radius-sm)", border: "1px solid var(--border-subtle)", background: "var(--bg-app)", color: "var(--text-main)", fontSize: 12, fontFamily: "var(--font-sans)" }}
              >
                {["mcp-server", "api-gateway", "ssh", "remote-storage"].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <button onClick={save} style={{ padding: "7px 14px", borderRadius: "var(--radius-sm)", border: "none", background: "var(--accent-primary)", color: "#fff", fontSize: 12, fontWeight: 600, fontFamily: "var(--font-sans)", cursor: "pointer" }}>
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Shared layout helpers ────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      padding:       "8px 14px 7px",
      borderBottom:  "1px solid var(--border-subtle)",
      fontSize:       10,
      fontWeight:     700,
      textTransform:  "uppercase",
      letterSpacing:  "0.07em",
      color:         "var(--text-muted)",
      flexShrink:     0,
      userSelect:     "none",
    }}>
      {children}
    </div>
  );
}

function CollapsibleSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid var(--border-subtle)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:        "flex",
          alignItems:     "center",
          justifyContent: "space-between",
          width:          "100%",
          padding:        "9px 14px",
          background:     "none",
          border:         "none",
          cursor:         "pointer",
          fontSize:        10,
          fontWeight:      700,
          textTransform:  "uppercase",
          letterSpacing:  "0.07em",
          color:          "var(--text-muted)",
          fontFamily:     "var(--font-sans)",
          userSelect:     "none",
        }}
      >
        {title}
        <span style={{ fontSize: 10, display: "inline-block", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          ▾
        </span>
      </button>
      {open && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 5 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function KVRow({ k, v, mono = false, small = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", fontSize: small ? 10 : 11, gap: 8 }}>
      <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>{k}</span>
      <span style={{
        color:        "var(--text-main)",
        fontFamily:   mono ? "var(--font-mono)" : "var(--font-sans)",
        fontSize:     small ? 10 : 11,
        textAlign:    "right",
        overflow:     "hidden",
        textOverflow: "ellipsis",
        whiteSpace:   "nowrap",
        maxWidth:     150,
      }}>
        {v}
      </span>
    </div>
  );
}

// ─── MCPPage (default export) ─────────────────────────────────────────────────

export default function MCPPage() {
  // Agent states keyed by agent ID
  const [agentStates,  setAgentStates]  = useState(
    /** @type {Record<string, AgentState>} */
    (Object.fromEntries(AGENTS.map(a => [a.id, { status: "idle" }])))
  );
  const [activeAgent,  setActiveAgent]  = useState(/** @type {string|null} */ (null));
  const [suggestions,  setSuggestions]  = useState([]);
  const pollRef = useRef(null);

  const loadAgents = useCallback(async () => {
    try {
      const res    = await fetch(`${BASE}/api/mcp/agents`);
      const d      = await res.json();
      const agents = d.agents || d;
      if (!Array.isArray(agents)) return;
      setAgentStates(prev => {
        const next = { ...prev };
        agents.forEach(a => { next[a.id] = { ...next[a.id], ...a }; });
        return next;
      });
      const anyRunning = agents.some(a => (a.status || "") === "running");
      if (anyRunning) startPoll();
      else            stopPoll();
    } catch (_) {}
  }, []);

  function startPoll() {
    if (pollRef.current) return;
    pollRef.current = setInterval(loadAgents, 4000);
  }
  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  useEffect(() => {
    loadAgents();
    fetch(`${BASE}/api/mcp/commands`)
      .then(r => r.json())
      .then(d => setSuggestions(d.suggestions || d || []))
      .catch(() => {});
    return stopPoll;
  }, []);

  function handleDispatch(d) {
    loadAgents();
    if (d.agent_id) setTimeout(() => setActiveAgent(d.agent_id), 400);
  }

  return (
    <>
      <style>{`
        @keyframes dotPulse {
          0%, 100% { opacity: 1;    transform: scale(1);    }
          50%       { opacity: 0.3; transform: scale(0.72); }
        }
        @media (max-width: 768px) {
          .mcp-agent-grid { grid-template-columns: 1fr !important; }
          .ws-pipeline-pane { display: none !important; }
          .ws-sidebar-pane  { width: 220px !important; }
        }
      `}</style>

      <div style={{
        fontFamily: "var(--font-sans)",
        padding:    "24px",
        background: "var(--bg-app)",
        minHeight:  "100%",
        boxSizing:  "border-box",
      }}>
        {/* Page header */}
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-heading)", margin: 0, letterSpacing: "-0.02em" }}>
            MCP & AI
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4, marginBottom: 0 }}>
            Parallel agent pipeline — Architect · Builder · Tester · Operator
          </p>
        </div>

        {/* Command bar */}
        <CommandBar suggestions={suggestions} onDispatch={handleDispatch} />

        {/* Agent grid */}
        <div
          className="mcp-agent-grid"
          style={{
            display:             "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap:                 18,
            marginBottom:        24,
          }}
        >
          {AGENTS.map(cfg => (
            <AgentCard
              key={cfg.id}
              cfg={cfg}
              state={agentStates[cfg.id] ?? {}}
              onOpen={() => setActiveAgent(cfg.id)}
            />
          ))}
        </div>

        {/* Services panel */}
        <ServicesPanel />
      </div>

      {/* Workspace overlay — portal-free, fixed position */}
      {activeAgent && (
        <WorkspaceOverlay
          agentId={activeAgent}
          state={agentStates[activeAgent] ?? {}}
          onClose={() => setActiveAgent(null)}
        />
      )}
    </>
  );
}
