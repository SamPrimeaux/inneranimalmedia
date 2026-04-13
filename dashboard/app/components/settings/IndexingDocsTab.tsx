import React, { useState, useEffect, useRef, useCallback } from "react";
import { Btn, SectionLabel, ControlledSwitch, Input } from "./atoms";
import { agentsamWorkspaceQueryString, relativeTime, formatR2Bytes } from "../utils";
import { AGENTSAM_WORKSPACE_QUERY } from "./constants";

// ─── IgnorePatternsTab (embedded) ─────────────────────────────────────────────

function IgnorePatternsTab() {
  const wsq = agentsamWorkspaceQueryString();
  const [rows,    setRows]    = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [newPat,  setNewPat]  = useState("");
  const [newNeg,  setNewNeg]  = useState(false);
  const [dragId,  setDragId]  = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null); setLoading(true);
    try {
      const r = await fetch(`/api/agentsam/ignore-patterns?${wsq}`, { credentials: "same-origin" });
      const data = await r.json().catch(() => null);
      if (!r.ok) throw new Error(data?.error || `Load failed (${r.status})`);
      const list = Array.isArray(data) ? data : [];
      list.sort((a: any, b: any) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
      setRows(list);
    } catch (e: any) { setError(e?.message || String(e)); setRows([]); }
    finally { setLoading(false); }
  }, [wsq]);

  useEffect(() => { load(); }, [load]);

  const persistOrder = async (ordered: any[]) => {
    setError(null);
    try {
      const r = await fetch("/api/agentsam/ignore-patterns/reorder", {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ordered.map((x) => x.id) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Reorder failed (${r.status})`);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const onDropRow = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const ix = rows.findIndex((x) => x.id === dragId);
    const ti = rows.findIndex((x) => x.id === targetId);
    if (ix < 0 || ti < 0) return;
    const next = [...rows];
    const [moved] = next.splice(ix, 1);
    next.splice(ti, 0, moved);
    setRows(next);
    setDragId(null);
    void persistOrder(next);
  };

  const addPat = async () => {
    const pattern = newPat.trim();
    if (!pattern) return;
    setError(null);
    try {
      const r = await fetch("/api/agentsam/ignore-patterns", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern, is_negation: newNeg, workspace_id: AGENTSAM_WORKSPACE_QUERY }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Add failed (${r.status})`);
      setNewPat(""); setNewNeg(false); await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const toggleNeg = async (row: any) => {
    if (String(row.source || "") === "file") return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/ignore-patterns/${encodeURIComponent(row.id)}`, {
        method: "PATCH", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_negation: !Number(row.is_negation) }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Update failed (${r.status})`);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  const delPat = async (row: any) => {
    if (String(row.source || "") === "file") return;
    if (!window.confirm("Delete this pattern?")) return;
    setError(null);
    try {
      const r = await fetch(`/api/agentsam/ignore-patterns/${encodeURIComponent(row.id)}`, { method: "DELETE", credentials: "same-origin" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || `Delete failed (${r.status})`);
      await load();
    } catch (e: any) { setError(e?.message || String(e)); }
  };

  if (loading) return <div style={{ padding: 16, color: "var(--text-muted)", fontSize: 12 }}>Loading…</div>;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>Ignore patterns</div>
        {error && <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-secondary)" }}>{error}</div>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <Input value={newPat} onChange={(e) => setNewPat(e.target.value)} placeholder="Glob or path pattern" style={{ flex: 1, minWidth: 160 }} />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <input type="checkbox" checked={newNeg} onChange={(e) => setNewNeg(e.target.checked)} />
            Negation (!)
          </label>
          <Btn variant="primary" onClick={addPat}>Add</Btn>
        </div>
        {rows.length === 0 ? (
          <div style={{ textAlign: "center", padding: 32, color: "var(--text-muted)", fontSize: 12 }}>No ignore patterns defined.</div>
        ) : (
          rows.map((row) => {
            const isFile = String(row.source || "") === "file";
            return (
              <div key={row.id} draggable onDragStart={() => setDragId(row.id)} onDragEnd={() => setDragId(null)} onDragOver={(e) => e.preventDefault()} onDrop={() => onDropRow(row.id)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: 10, marginBottom: 6, background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 6, opacity: isFile ? 0.65 : 1 }}>
                <span title="Drag to reorder" style={{ cursor: "grab", fontSize: 10, color: "var(--text-muted)", userSelect: "none", fontFamily: "ui-monospace, monospace" }}>::</span>
                <code style={{ flex: 1, fontSize: 11, color: "var(--text-primary)", wordBreak: "break-all" }}>
                  {Number(row.is_negation) ? "! " : ""}{row.pattern}
                </code>
                <span style={{ fontSize: 9, textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", color: "var(--text-muted)" }}>{row.source || "db"}</span>
                <ControlledSwitch checked={Number(row.is_negation) !== 0} disabled={isFile} onChange={() => toggleNeg(row)} />
                <Btn variant="danger" size="sm" disabled={isFile} onClick={() => delPat(row)}>Delete</Btn>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function autoragStatsFields(stats: any) {
  if (!stats || typeof stats !== "object") return { name: "iam-autorag", vectorCount: null, fileCount: null, lastSync: null, statusLabel: "Unknown" };
  const st = String(stats.status || stats.state || stats.job_status || "").toLowerCase();
  let statusLabel = "Indexed";
  if (st.includes("process") || st === "running") statusLabel = "Processing";
  else if (st.includes("queue") || st === "pending") statusLabel = "Queued";
  else if (st.includes("error") || st === "failed") statusLabel = "Error";
  return {
    name: stats.name || stats.instance_name || stats.id || "iam-autorag",
    vectorCount: stats.vector_count ?? stats.vectorCount ?? stats.metrics?.vector_count ?? stats.indexed_vectors ?? null,
    fileCount:   stats.file_count ?? stats.source_file_count ?? stats.document_count ?? stats.files_indexed ?? null,
    lastSync:    stats.last_synced_at || stats.last_sync_at || stats.updated_at || stats.modified_at || null,
    statusLabel,
  };
}

function chunkPreviewText(chunk: any): string {
  if (chunk == null) return "";
  if (typeof chunk === "string") return chunk;
  const t = chunk.content ?? chunk.text ?? chunk.body ?? chunk.snippet;
  if (t != null) return String(t);
  try { return JSON.stringify(chunk); } catch { return String(chunk); }
}

function chunkSourceName(chunk: any): string {
  if (!chunk || typeof chunk !== "object") return "—";
  const m = chunk.metadata && typeof chunk.metadata === "object" ? chunk.metadata : null;
  return chunk.filename || chunk.source || chunk.file_id || m?.filename || m?.source || m?.path || "—";
}

// ─── IndexingDocsTab ──────────────────────────────────────────────────────────

export function IndexingDocsTab() {
  const wsq         = agentsamWorkspaceQueryString();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [summary,       setSummary]       = useState<any>(null);
  const [summaryLoading,setSummaryLoading]= useState(true);
  const [summaryError,  setSummaryError]  = useState<string | null>(null);
  const [statsBody,     setStatsBody]     = useState<any>(null);
  const [statsLoading,  setStatsLoading]  = useState(true);
  const [statsError,    setStatsError]    = useState<string | null>(null);
  const [syncing,       setSyncing]       = useState(false);
  const [syncMsg,       setSyncMsg]       = useState<string | null>(null);
  const [files,         setFiles]         = useState<any[]>([]);
  const [filesLoading,  setFilesLoading]  = useState(true);
  const [filesError,    setFilesError]    = useState<string | null>(null);
  const [uploadMsg,     setUploadMsg]     = useState<string | null>(null);
  const [searchQ,       setSearchQ]       = useState("");
  const [searching,     setSearching]     = useState(false);
  const [searchError,   setSearchError]   = useState<string | null>(null);
  const [searchChunks,  setSearchChunks]  = useState<any[]>([]);

  const loadSummary = useCallback(() => {
    setSummaryError(null); setSummaryLoading(true);
    fetch(`/api/agentsam/indexing-summary?${wsq}`, { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) throw new Error(d?.error || "Failed to load summary"); setSummary(d); })
      .catch((e: any) => { setSummaryError(e?.message || String(e)); setSummary(null); })
      .finally(() => setSummaryLoading(false));
  }, [wsq]);

  const loadStats = useCallback(() => {
    setStatsError(null); setStatsLoading(true);
    fetch("/api/agentsam/autorag/stats", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok && d?.error) throw new Error(d.error); setStatsBody(d); })
      .catch((e: any) => { setStatsError(e?.message || String(e)); setStatsBody(null); })
      .finally(() => setStatsLoading(false));
  }, []);

  const loadFiles = useCallback(() => {
    setFilesError(null); setFilesLoading(true);
    fetch("/api/agentsam/autorag/files", { credentials: "same-origin" })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (!ok) throw new Error(d?.error || "Failed to load files"); setFiles(Array.isArray(d.files) ? d.files : []); })
      .catch((e: any) => { setFilesError(e?.message || String(e)); setFiles([]); })
      .finally(() => setFilesLoading(false));
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { loadStats(); loadFiles(); }, [loadStats, loadFiles]);

  const onSyncNow = async () => {
    setSyncMsg(null); setSyncing(true);
    try {
      const r = await fetch("/api/agentsam/autorag/sync", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Sync failed (${r.status})`);
      setSyncMsg("Sync job started.");
      setTimeout(() => loadStats(), 3000);
    } catch (e: any) { setSyncMsg(e?.message || String(e)); }
    finally { setSyncing(false); }
  };

  const onDeleteFile = async (key: string) => {
    if (!key || !window.confirm("Remove this file from storage?")) return;
    setFilesError(null);
    try {
      const r = await fetch("/api/agentsam/autorag/files", { method: "DELETE", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Delete failed (${r.status})`);
      await loadFiles();
    } catch (e: any) { setFilesError(e?.message || String(e)); }
  };

  const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const file  = input.files && input.files[0];
    input.value = "";
    if (!file) return;
    setUploadMsg(null); setFilesError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/agentsam/autorag/upload", { method: "POST", credentials: "same-origin", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Upload failed (${r.status})`);
      setUploadMsg(`Uploaded: ${d.key || file.name}`);
      await loadFiles();
    } catch (err: any) { setFilesError(err?.message || String(err)); }
  };

  const onSearch = async () => {
    const query = searchQ.trim();
    if (!query) return;
    setSearchError(null); setSearching(true); setSearchChunks([]);
    try {
      const r = await fetch("/api/agentsam/autorag/search", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d?.error || `Search failed (${r.status})`);
      setSearchChunks(Array.isArray(d.chunks) ? d.chunks : []);
    } catch (err: any) { setSearchError(err?.message || String(err)); }
    finally { setSearching(false); }
  };

  const ci       = summary?.code_index || {};
  const arStats  = statsBody?.stats;
  const arFields = autoragStatsFields(arStats);
  const bindings = summary?.bindings || {};

  const groupedFiles = (() => {
    const g: Record<string, any[]> = { "source/docs": [], "autorag-knowledge": [], other: [] };
    for (const f of files) {
      const k = f.key || "";
      if (k.startsWith("source/docs/")) g["source/docs"].push(f);
      else if (k.startsWith("autorag-knowledge/")) g["autorag-knowledge"].push(f);
      else g.other.push(f);
    }
    return g;
  })();

  const pill = (label: string, on: boolean) => (
    <span style={{ fontSize: 10, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--border)", color: on ? "var(--color-success, var(--accent))" : "var(--text-muted)", background: "var(--bg-canvas)", fontWeight: 500 }}>
      {label}{on ? "" : " (inactive)"}
    </span>
  );

  const card: React.CSSProperties = { marginBottom: 16, padding: 14, background: "var(--bg-canvas)", border: "1px solid var(--border)", borderRadius: 8 };

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1, minHeight: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>Indexing and docs</div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 16, lineHeight: 1.55 }}>AutoRAG instance, knowledge files in R2, test retrieval, and ignore patterns.</div>

      <SectionLabel>AutoRAG index</SectionLabel>
      <div style={card}>
        {statsLoading ? (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading AutoRAG status…</div>
        ) : statsError ? (
          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{statsError}</div>
        ) : (
          <>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{arFields.name}</span>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--accent)" }}>{arFields.statusLabel}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: 12 }}>
              <div>Vectors: {arFields.vectorCount != null ? String(arFields.vectorCount) : "—"}</div>
              <div>Files (reported): {arFields.fileCount != null ? String(arFields.fileCount) : "—"}</div>
              <div>Last sync: {arFields.lastSync ? (relativeTime(arFields.lastSync) || String(arFields.lastSync)) : "—"}</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <Btn variant="primary" disabled={syncing} onClick={onSyncNow}>{syncing ? "Syncing…" : "Sync now"}</Btn>
              {syncMsg && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{syncMsg}</span>}
            </div>
          </>
        )}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 8 }}>Repository code index</div>
          {summaryLoading ? (
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading…</div>
          ) : summaryError ? (
            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>{summaryError}</div>
          ) : (
            <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                <span>Status: {String(ci.status || "idle").toLowerCase()}</span>
                {ci.vector_backend && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)", color: "var(--text-secondary)" }}>{ci.vector_backend}</span>}
              </div>
              <div>{Number(ci.file_count) || 0} files indexed</div>
              <div style={{ width: "100%", height: 6, background: "var(--border)", borderRadius: 3, overflow: "hidden", marginTop: 8 }}>
                <div style={{ width: `${Math.min(100, Math.max(0, Number(ci.progress_percent) || 0))}%`, height: 4, marginTop: 1, background: "var(--accent)", borderRadius: 2 }} />
              </div>
              {ci.last_sync_at && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>Last sync {relativeTime(ci.last_sync_at) || String(ci.last_sync_at)}</div>}
              {ci.last_error   && <div style={{ fontSize: 10, color: "var(--color-danger, var(--text-secondary))", marginTop: 8 }}>{ci.last_error}</div>}
            </div>
          )}
        </div>
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>
          {pill("Vectorize", !!bindings.vectorize)}{pill("R2", !!bindings.r2)}
          {pill("Workers AI", !!bindings.workers_ai)}{pill("AutoRAG API", !!bindings.autorag)}
        </div>
      </div>

      <SectionLabel>Knowledge files</SectionLabel>
      <div style={{ ...card, padding: 12 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
          <Btn variant="primary" onClick={() => fileInputRef.current?.click()}>Upload doc</Btn>
          <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={onFileSelected} />
          {uploadMsg && <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{uploadMsg}</span>}
          <Btn variant="ghost" size="sm" onClick={loadFiles}>Refresh</Btn>
        </div>
        {filesLoading  && <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Loading files…</div>}
        {filesError    && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>{filesError}</div>}
        {(["source/docs", "autorag-knowledge", "other"] as const).map((groupKey) => {
          const list = groupedFiles[groupKey];
          if (!list.length) return null;
          return (
            <div key={groupKey} style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6 }}>{groupKey}</div>
              <div style={{ border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 72px 100px 40px", padding: "8px 10px", background: "var(--bg-elevated)", fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                  <span>File</span><span>Size</span><span>Uploaded</span><span style={{ textAlign: "center" }}>Del</span>
                </div>
                {list.map((f) => {
                  const name     = (f.key || "").split("/").pop() || f.key;
                  const uploaded = f.uploaded ? new Date(f.uploaded).toLocaleString() : "—";
                  return (
                    <div key={f.key} style={{ display: "grid", gridTemplateColumns: "1fr 72px 100px 40px", alignItems: "center", padding: "8px 10px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-primary)" }}>
                      <code style={{ fontSize: 10, wordBreak: "break-all", color: "var(--text-primary)" }} title={f.key}>{name}</code>
                      <span style={{ color: "var(--text-secondary)" }}>{formatR2Bytes(f.size)}</span>
                      <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{uploaded}</span>
                      <div style={{ textAlign: "center" }}>
                        <button type="button" title="Delete file" onClick={() => onDeleteFile(f.key)}
                          style={{ background: "none", border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "2px 6px", color: "var(--text-secondary)", fontFamily: "inherit" }}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
        {!filesLoading && !files.length && !filesError && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: 16 }}>No files under source/docs or autorag-knowledge.</div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
        <SectionLabel>Knowledge base (D1)</SectionLabel>
        <a href="/dashboard/knowledge" style={{ fontSize: 11, color: "var(--accent)", textDecoration: "none" }}>Manage knowledge base</a>
      </div>
      <div style={{ ...card, fontSize: 11, color: "var(--text-secondary)", marginTop: 0 }}>
        {summaryLoading ? "…" : `${Number(summary?.knowledge?.active_documents) || 0} active documents`}
      </div>

      <SectionLabel>Test search</SectionLabel>
      <div style={card}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          <Input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Test a query…" style={{ flex: 1, minWidth: 200 }} onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }} />
          <Btn variant="primary" disabled={searching} onClick={onSearch}>{searching ? "Searching…" : "Search"}</Btn>
        </div>
        {searchError && <div style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 8 }}>{searchError}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {searchChunks.map((ch, i) => {
            const text  = chunkPreviewText(ch);
            const short = text.length > 200 ? `${text.slice(0, 200)}…` : text;
            return (
              <div key={i} style={{ padding: 10, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>{String(chunkSourceName(ch))}</div>
                <div style={{ fontSize: 11, color: "var(--text-primary)", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{short}</div>
              </div>
            );
          })}
        </div>
      </div>

      <SectionLabel>Ignore rules</SectionLabel>
      <div style={{ marginBottom: 24, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", maxHeight: 520, display: "flex", flexDirection: "column" }}>
        <IgnorePatternsTab />
      </div>
    </div>
  );
}
