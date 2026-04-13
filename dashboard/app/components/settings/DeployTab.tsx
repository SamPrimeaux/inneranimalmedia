import React, { useState, useEffect, useCallback } from "react";
import { Btn, SectionLabel, Input, Modal } from "./atoms";
import { relativeTime, formatLastRanUnix, timeAgo, runCmd } from "./utils";

// ─── WranglerTab ──────────────────────────────────────────────────────────────

interface WranglerTabProps {
  runCommandRunnerRef?: React.RefObject<any>;
  wranglerConfig: string;
  onDeployStart?: (workerName: string) => string | number | undefined;
  onDeployComplete?: (pillId: string | number, success: boolean, versionId?: string, durationMs?: number) => void;
}

function WranglerTab({ runCommandRunnerRef, wranglerConfig, onDeployStart, onDeployComplete }: WranglerTabProps) {
  const [deployOpen,    setDeployOpen]    = useState(false);
  const [recentDeploys, setRecentDeploys] = useState<any[]>([]);
  const [deployLoading, setDeployLoading] = useState(true);
  const [ctx,           setCtx]           = useState<any>(null);
  const [ctxLoading,    setCtxLoading]    = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCtxLoading(true);
    fetch("/api/settings/deploy-context", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok) throw new Error(d?.error || "Failed to load deploy context");
        if (!cancelled) setCtx(d);
      })
      .catch(() => { if (!cancelled) setCtx(null); })
      .finally(() => { if (!cancelled) setCtxLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deployments/recent?limit=10", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setRecentDeploys(Array.isArray(d.deployments) ? d.deployments : []); })
      .catch(() => { if (!cancelled) setRecentDeploys([]); })
      .finally(() => { if (!cancelled) setDeployLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const workerName   = ctx?.worker_name   != null ? String(ctx.worker_name)   : "—";
  const deployScript = ctx?.deploy_script != null ? String(ctx.deploy_script) : "npm run deploy";
  const envWrapper   = ctx?.env_wrapper   != null ? String(ctx.env_wrapper)   : "";
  const r2Bucket     = ctx?.r2_bucket     != null ? String(ctx.r2_bucket)     : "—";
  const deployNote   = ctx?.note          != null ? String(ctx.note)          : "";
  const deployCmd    = [envWrapper, deployScript].filter(Boolean).join(" ").trim() || deployScript;

  const fire = (cmd: string) => runCmd(runCommandRunnerRef, cmd);

  const quickCmds = ctxLoading || !ctx ? [] : [
    { label: "whoami",      cmd: `wrangler whoami --config ${wranglerConfig}` },
    { label: "list secrets",cmd: `wrangler secret list --config ${wranglerConfig}` },
    { label: "deployments", cmd: `wrangler deployments list --config ${wranglerConfig}` },
    { label: "tail logs",   cmd: `wrangler tail --config ${wranglerConfig}` },
    { label: "git status",  cmd: "git status && git log --oneline -5" },
    { label: "git branch",  cmd: "git branch -a" },
  ];

  const deploySecondsFmt = (row: any) => {
    if (row.deploy_time_seconds    > 0) return `${Number(row.deploy_time_seconds)}s`;
    if (row.duration_seconds       > 0) return `${Number(row.duration_seconds)}s`;
    if (row.deploy_duration_ms     > 0) return `${Math.round(Number(row.deploy_duration_ms) / 1000)}s`;
    return "-";
  };

  const versionShort = (row: any) => {
    const g = (row.git_hash || "").trim();
    if (g.length >= 7) return g.slice(0, 7);
    const v = (row.version || "").trim();
    return v.length >= 7 ? v.slice(0, 7) : v || "—";
  };

  const triggeredByLabel = (row: any) => (row.triggered_by || row.deployed_by || "—").trim() || "—";

  const relCreated = (row: any) => {
    const ca = row.created_at;
    if (ca != null && /^\d+$/.test(String(ca))) return relativeTime(Number(ca)) || formatLastRanUnix(Number(ca)) || "—";
    const ts = row.timestamp;
    if (ts) return timeAgo(String(ts).replace(" ", "T"));
    return "—";
  };

  const statusBadge = (row: any) => {
    const s = String(row.status || "").toLowerCase();
    const ok   = s === "success";
    const fail = s === "failed" || s === "failure";
    const pend = s === "pending" || s === "running";
    return {
      label: row.status || "—",
      color: fail ? "var(--color-danger, var(--text-secondary))" : ok ? "var(--color-success, var(--accent))" : pend ? "var(--accent)" : "var(--text-primary)",
    };
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      {ctxLoading ? (
        <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>Loading configuration…</div>
      ) : (
        <div style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", marginBottom: 16, fontSize: 10, fontFamily: "ui-monospace, monospace", color: "var(--text-secondary)", lineHeight: 1.65 }}>
          <div>worker: <span style={{ color: "var(--text-primary)" }}>{workerName}</span></div>
          <div>config: <span style={{ color: "var(--text-primary)" }}>{wranglerConfig}</span></div>
          <div>deploy: <span style={{ color: "var(--text-primary)" }}>{deployScript}</span></div>
          <div>env wrapper: <span style={{ color: "var(--text-primary)" }}>{envWrapper || "—"}</span></div>
          <div>R2 bucket: <span style={{ color: "var(--text-primary)" }}>{r2Bucket}</span></div>
          {deployNote && <div style={{ marginTop: 8, color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>{deployNote}</div>}
        </div>
      )}

      <SectionLabel>Quick Commands</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 16 }}>
        {quickCmds.map(({ label, cmd }) => (
          <button key={label} type="button" onClick={() => fire(cmd)}
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 10 }}>
            {label}
          </button>
        ))}
      </div>

      <SectionLabel>Deploy</SectionLabel>
      <div style={{ marginBottom: 16 }}>
        <Btn variant="danger" style={{ width: "100%", textAlign: "center" }} onClick={() => setDeployOpen(true)}>
          Deploy to Production
        </Btn>
      </div>

      <SectionLabel>Rollback</SectionLabel>
      <Btn onClick={() => fire(`wrangler rollback --config ${wranglerConfig}`)}>List + Rollback Options</Btn>

      <SectionLabel>Recent Deploys</SectionLabel>
      <div style={{ marginBottom: 16, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
        {deployLoading ? (
          <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>Loading recent deploys…</div>
        ) : recentDeploys.length === 0 ? (
          <div style={{ padding: 12, fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>No deployments recorded.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", textAlign: "left" }}>
                {["Version","Status","Triggered By","Duration","Date"].map((h) => (
                  <th key={h} style={{ padding: "6px 8px", fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentDeploys.slice(0, 10).map((row) => {
                const st = statusBadge(row);
                return (
                  <tr key={row.id || row.version} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace", color: "var(--text-primary)" }}>{versionShort(row)}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{ display: "inline-block", padding: "2px 6px", borderRadius: 4, fontSize: 9, fontWeight: 600, textTransform: "uppercase", border: "1px solid var(--border)", background: "var(--bg-canvas)", color: st.color }}>{st.label}</span>
                    </td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{ display: "inline-block", padding: "2px 6px", borderRadius: 10, fontSize: 9, background: "var(--bg-canvas)", border: "1px solid var(--border)", color: "var(--text-secondary)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={triggeredByLabel(row)}>{triggeredByLabel(row)}</span>
                    </td>
                    <td style={{ padding: "6px 8px", fontFamily: "ui-monospace, monospace", color: "var(--text-secondary)" }}>{deploySecondsFmt(row)}</td>
                    <td style={{ padding: "6px 8px", color: "var(--text-muted)" }}>{relCreated(row)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={deployOpen} onClose={() => setDeployOpen(false)} title="Confirm Deploy">
        <div style={{ fontSize: 11, color: "var(--text-secondary)", background: "var(--bg-canvas)", padding: 10, borderRadius: 4, border: "1px solid var(--border)", marginBottom: 12, lineHeight: 1.6 }}>
          <div>Worker: <code style={{ color: "var(--accent)" }}>{workerName}</code></div>
          <div>Config: <code style={{ color: "var(--accent)" }}>{wranglerConfig}</code></div>
          <div>Command: <code style={{ color: "var(--accent)" }}>{deployCmd}</code></div>
        </div>
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <Btn variant="danger" onClick={async () => {
            setDeployOpen(false);
            const pillId = onDeployStart?.(workerName);
            const t0 = Date.now();
            let success = false;
            let versionId = "";
            try {
              const result = await runCommandRunnerRef?.current?.runCommandInTerminal?.(deployCmd);
              const out = `${result?.output || ""}\n${result?.error || ""}`;
              const vm = out.match(/Current Version ID:\s*([a-f0-9-]+)/i) || out.match(/Version ID:\s*([a-f0-9-]+)/i);
              versionId = vm ? vm[1] : "";
              success = !!(result?.ok && /Uploaded|Deployed|Current Version ID/i.test(out));
              if (result?.error || !result?.ok) success = false;
            } catch (_) { success = false; }
            if (pillId != null) onDeployComplete?.(pillId, success, versionId || undefined, Date.now() - t0);
          }}>Yes, Deploy</Btn>
          <Btn onClick={() => setDeployOpen(false)}>Cancel</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─── WorkersTab ───────────────────────────────────────────────────────────────
// Bug fix: previously had hardcoded absolute local FS path
// (/Users/samprimeaux/Downloads/march1st-inneranimalmedia/wrangler.production.toml).
// Now receives wranglerConfig from parent (DeployBetaTab), which derives it
// from /api/settings/deploy-context — same source WranglerTab uses.

interface WorkersTabProps {
  runCommandRunnerRef?: React.RefObject<any>;
  wranglerConfig: string;
}

function WorkersTab({ runCommandRunnerRef, wranglerConfig }: WorkersTabProps) {
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/workers", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((d) => setWorkers(d.workers || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const priorityColor: Record<string, string> = {
    critical: "var(--color-error)",
    high:     "var(--color-warning)",
    medium:   "var(--color-primary)",
    low:      "var(--text-secondary)",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
      <SectionLabel>Active Workers ({workers.length})</SectionLabel>
      {loading ? (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, padding: 12, textAlign: "center" }}>Loading…</div>
      ) : (
        workers.map((w) => (
          <div key={w.script_name || w.worker_name}
            style={{ padding: 8, borderRadius: 6, background: "var(--bg-elevated)", border: "1px solid var(--border)", marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 11, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {w.script_name || w.worker_name}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-secondary)" }}>
                {w.worker_type || "worker"} · {timeAgo(w.last_deployment)}
              </div>
            </div>
            <span style={{ fontSize: 9, color: priorityColor[w.priority] || "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              {w.priority || ""}
            </span>
            <Btn variant="inline" onClick={() => runCmd(runCommandRunnerRef, `wrangler tail ${w.script_name || w.worker_name} --config ${wranglerConfig}`)}>
              tail
            </Btn>
          </div>
        ))
      )}
    </div>
  );
}

// ─── D1Tab ────────────────────────────────────────────────────────────────────

function D1Tab() {
  const [query,   setQuery]   = useState("");
  const [results, setResults] = useState<any[] | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const suggestions = [
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    "SELECT key, value FROM project_memory WHERE project_id='inneranimalmedia' ORDER BY updated_at DESC LIMIT 10",
    "SELECT * FROM env_audit_log ORDER BY ts DESC LIMIT 20",
    "SELECT * FROM env_secrets ORDER BY provider, key_name",
    "SELECT * FROM spend_ledger ORDER BY occurred_at DESC LIMIT 20",
    "SELECT worker_name, deployment_status, priority FROM worker_registry ORDER BY priority",
    "SELECT id, title, status FROM roadmap_steps ORDER BY id",
  ];

  const run = async (sql?: string) => {
    const q = (sql || query).trim();
    if (!q) return;
    setRunning(true); setError(null); setResults(null);
    try {
      const r = await fetch("/api/d1/query", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: q }),
      });
      const d = await r.json();
      if (d.error) setError(d.error);
      else setResults(d.results || d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", padding: 16 }}>
      <SectionLabel>D1 Query Runner — inneranimalmedia-business</SectionLabel>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
        {suggestions.slice(0, 4).map((s, i) => (
          <button key={i} type="button" onClick={() => setQuery(s)}
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-secondary)", padding: "3px 7px", borderRadius: 4, cursor: "pointer", fontFamily: "monospace", fontSize: 9, whiteSpace: "nowrap", overflow: "hidden", maxWidth: 160, textOverflow: "ellipsis" }}>
            {s.slice(0, 28)}…
          </button>
        ))}
      </div>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
        placeholder="SELECT * FROM … — Cmd+Enter to run"
        style={{ background: "var(--bg-canvas)", border: "1px solid var(--border)", color: "var(--text-primary)", padding: 8, borderRadius: 4, fontFamily: "monospace", fontSize: 11, resize: "vertical", minHeight: 80, outline: "none", marginBottom: 8, width: "100%", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Btn variant="primary" disabled={running || !query.trim()} onClick={() => run()}>{running ? "Running…" : "Run Query"}</Btn>
        <Btn onClick={() => { setQuery(""); setResults(null); setError(null); }}>Clear</Btn>
      </div>
      {error && (
        <div style={{ background: "color-mix(in srgb, var(--color-error) 12%, transparent)", border: "1px solid var(--color-border)", borderRadius: 4, padding: 8, fontSize: 11, color: "var(--color-error)", marginBottom: 8, fontFamily: "monospace" }}>{error}</div>
      )}
      {results && Array.isArray(results) && results.length > 0 && (
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ fontSize: 10, color: "var(--text-secondary)", marginBottom: 4 }}>{results.length} row{results.length !== 1 ? "s" : ""}</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
            <thead>
              <tr>{Object.keys(results[0]).map((k) => (
                <th key={k} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)", whiteSpace: "nowrap", fontSize: 9, textTransform: "uppercase" }}>{k}</th>
              ))}</tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr key={i}>
                  {Object.values(row).map((v: any, j) => (
                    <td key={j} style={{ padding: "4px 6px", borderBottom: "1px solid var(--border)", color: "var(--text-primary)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {v === null ? <span style={{ color: "var(--text-secondary)" }}>null</span> : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {results && Array.isArray(results) && results.length === 0 && (
        <div style={{ color: "var(--text-secondary)", fontSize: 11, padding: 12, textAlign: "center" }}>Query returned 0 rows</div>
      )}
    </div>
  );
}

// ─── DeployBetaTab (composed) ─────────────────────────────────────────────────
// Fetches deploy context once and passes wranglerConfig to both child tabs,
// eliminating the need for each to fetch independently or hard-code a path.

interface DeployBetaTabProps {
  runCommandRunnerRef?: React.RefObject<any>;
  onDeployStart?: (workerName: string) => string | number | undefined;
  onDeployComplete?: (pillId: string | number, success: boolean, versionId?: string, durationMs?: number) => void;
}

export function DeployBetaTab({ runCommandRunnerRef, onDeployStart, onDeployComplete }: DeployBetaTabProps) {
  const [wranglerConfig, setWranglerConfig] = useState("wrangler.production.toml");

  useEffect(() => {
    fetch("/api/settings/deploy-context", { credentials: "same-origin" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.wrangler_config) setWranglerConfig(String(d.wrangler_config)); })
      .catch(() => {});
  }, []);

  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
      <div style={{ padding: "10px 16px", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5, borderBottom: "1px solid var(--border)", background: "var(--bg-canvas)" }}>
        Wrangler, Workers, and D1 console. Output still streams to the Terminal tab when you run commands from here.
      </div>
      <WranglerTab runCommandRunnerRef={runCommandRunnerRef} wranglerConfig={wranglerConfig} onDeployStart={onDeployStart} onDeployComplete={onDeployComplete} />
      <div style={{ height: 1, background: "var(--border)", margin: "0 8px" }} />
      <WorkersTab runCommandRunnerRef={runCommandRunnerRef} wranglerConfig={wranglerConfig} />
      <div style={{ height: 1, background: "var(--border)", margin: "0 8px" }} />
      <D1Tab />
    </div>
  );
}
