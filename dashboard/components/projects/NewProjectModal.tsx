import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { CreateProjectPayload } from "../../api/projects";
import { createProject } from "../../api/projects";

type WorkspaceOption = { id: string; name: string };

type Props = {
  open: boolean;
  onClose: () => void;
  defaultWorkspaceId: string | null;
  onCreated: () => void;
};

export default function NewProjectModal({ open, onClose, defaultWorkspaceId, onCreated }: Props) {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [projectType, setProjectType] = useState("dashboard");
  const [status, setStatus] = useState("development");
  const [priority, setPriority] = useState(50);
  const [description, setDescription] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [budgetUsd, setBudgetUsd] = useState("");
  const [tagsRaw, setTagsRaw] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [domain, setDomain] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [d1Database, setD1Database] = useState("");
  const [r2Buckets, setR2Buckets] = useState("");
  const [targetLaunch, setTargetLaunch] = useState("");
  const [a11y, setA11y] = useState("");
  const [perfBudget, setPerfBudget] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    void (async () => {
      try {
        const r = await fetch("/api/settings/workspaces", { credentials: "same-origin" });
        const j = (await r.json()) as { data?: { id?: string; name?: string }[]; current?: string | null };
        const rows = Array.isArray(j.data) ? j.data : [];
        setWorkspaces(
          rows
            .map((w) => ({ id: String(w.id || "").trim(), name: String(w.name || w.id || "").trim() }))
            .filter((w) => w.id),
        );
        const cur = defaultWorkspaceId?.trim() || j.current?.trim() || "";
        setWorkspaceId((prev) => (prev ? prev : cur));
      } catch {
        setWorkspaces([]);
        if (defaultWorkspaceId) setWorkspaceId(defaultWorkspaceId);
      }
    })();
  }, [open, defaultWorkspaceId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const tags = tagsRaw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Project name is required.");
      return;
    }
    const ws = workspaceId.trim();
    if (!ws) {
      setError("Choose a workspace.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const budget = budgetUsd.trim() ? Number(budgetUsd) : 0;
    const payload: CreateProjectPayload = {
      name: trimmed,
      description: description.trim() || undefined,
      client_name: clientName.trim() || undefined,
      project_type: projectType.trim() || "dashboard",
      status: status.trim() || "development",
      priority,
      workspace_id: ws,
      budget_usd: Number.isFinite(budget) ? budget : 0,
      tags: tags.length ? tags : undefined,
      domain: domain.trim() || undefined,
      worker_id: workerId.trim() || undefined,
      d1_databases: d1Database.trim() || undefined,
      r2_buckets: r2Buckets.trim() || undefined,
      target_launch_date: targetLaunch.trim() || undefined,
      accessibility_target: a11y.trim() || undefined,
      performance_budget: perfBudget.trim() || undefined,
    };
    const res = await createProject(payload);
    setSubmitting(false);
    if (!res.ok) {
      setError(res.error || "Create failed.");
      return;
    }
    onCreated();
    onClose();
    setName("");
    setDescription("");
    setTagsRaw("");
    setBudgetUsd("");
    setAdvanced(false);
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 px-4 py-8 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[var(--dashboard-border)] bg-[var(--dashboard-card)] p-6 text-[var(--dashboard-text)] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-project-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="new-project-title" className="text-lg font-semibold tracking-tight">
              New project
            </h2>
            <p className="mt-1 text-sm text-[var(--dashboard-muted)]">Creates a D1 project row and workspace catalog entry.</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-[var(--dashboard-border)] p-2 text-[var(--dashboard-muted)] hover:bg-[var(--dashboard-panel)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error ? (
          <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">{error}</div>
        ) : null}

        <div className="mt-5 space-y-4">
          <label className="block text-sm">
            <span className="text-[var(--dashboard-muted)]">Project name *</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--dashboard-muted)]">Client / company</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--dashboard-muted)]">Project type</span>
              <input
                className="mt-1 w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
                value={projectType}
                onChange={(e) => setProjectType(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--dashboard-muted)]">Status</span>
              <select
                className="mt-1 w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="discovery">discovery</option>
                <option value="planning">planning</option>
                <option value="development">development</option>
                <option value="staging">staging</option>
                <option value="production">production</option>
                <option value="maintenance">maintenance</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="text-[var(--dashboard-muted)]">Priority (0–100)</span>
            <input
              type="number"
              min={0}
              max={100}
              className="mt-1 w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--dashboard-muted)]">Workspace *</span>
            <select
              className="mt-1 w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              <option value="">Select workspace…</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name} ({w.id})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--dashboard-muted)]">Budget (USD)</span>
            <input
              type="number"
              className="mt-1 w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              value={budgetUsd}
              onChange={(e) => setBudgetUsd(e.target.value)}
              placeholder="60000"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--dashboard-muted)]">Description</span>
            <textarea
              className="mt-1 min-h-[88px] w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--dashboard-muted)]">Tags (comma-separated)</span>
            <input
              className="mt-1 w-full rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] px-3 py-2 text-sm outline-none focus:border-cyan-400/50"
              value={tagsRaw}
              onChange={(e) => setTagsRaw(e.target.value)}
              placeholder="Cloudflare, Analytics"
            />
          </label>

          <button
            type="button"
            className="text-sm font-medium text-cyan-300 hover:text-cyan-200"
            onClick={() => setAdvanced((v) => !v)}
          >
            {advanced ? "Hide advanced" : "Advanced"}
          </button>

          {advanced ? (
            <div className="space-y-3 rounded-xl border border-[var(--dashboard-border)] bg-[var(--dashboard-panel)] p-4">
              <label className="block text-sm">
                <span className="text-[var(--dashboard-muted)]">Domain</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-card)] px-3 py-2 text-sm"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--dashboard-muted)]">Worker ID</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-card)] px-3 py-2 text-sm"
                  value={workerId}
                  onChange={(e) => setWorkerId(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--dashboard-muted)]">D1 database</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-card)] px-3 py-2 text-sm"
                  value={d1Database}
                  onChange={(e) => setD1Database(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--dashboard-muted)]">R2 buckets</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-card)] px-3 py-2 text-sm"
                  value={r2Buckets}
                  onChange={(e) => setR2Buckets(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--dashboard-muted)]">Target launch date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-card)] px-3 py-2 text-sm"
                  value={targetLaunch}
                  onChange={(e) => setTargetLaunch(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--dashboard-muted)]">Accessibility target</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-card)] px-3 py-2 text-sm"
                  value={a11y}
                  onChange={(e) => setA11y(e.target.value)}
                  placeholder="WCAG 2.1 AA"
                />
              </label>
              <label className="block text-sm">
                <span className="text-[var(--dashboard-muted)]">Performance budget</span>
                <input
                  className="mt-1 w-full rounded-lg border border-[var(--dashboard-border)] bg-[var(--dashboard-card)] px-3 py-2 text-sm"
                  value={perfBudget}
                  onChange={(e) => setPerfBudget(e.target.value)}
                />
              </label>
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-xl border border-[var(--dashboard-border)] px-4 py-2 text-sm text-[var(--dashboard-muted)] hover:bg-[var(--dashboard-panel)]"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl border border-cyan-400/30 bg-cyan-500/15 px-4 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
            onClick={() => void submit()}
            disabled={submitting}
          >
            {submitting ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}
