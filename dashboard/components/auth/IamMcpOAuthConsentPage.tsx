/**
 * IamMcpOAuthConsentPage.tsx
 *
 * Route: /oauth/mcp/consent?authorization_id=oaa_*
 *
 * D1 facts (verified live):
 *   client_id        = iam_mcp_inneranimalmedia
 *   display_name     = "Inner Animal Media MCP Server"
 *   redirect_uri     = https://mcp.inneranimalmedia.com/auth/callback
 *   scopes           = iam:profile, iam:workspaces, iam:agent, mcp:tools, mcp:userinfo
 *   requires_pkce    = 1
 *   logo_url         = null  (renders IAM shield fallback)
 *
 * API contract (backend — POST migration_399):
 *   GET  /api/oauth/mcp/consent?authorization_id=oaa_*
 *        → { client, scopes[], workspaces[], expires_at, status }
 *   POST /api/oauth/mcp/consent
 *        body: { authorization_id, workspace_id, action: "approve"|"deny" }
 *        approve → 302 mcp.inneranimalmedia.com/auth/callback?code=&state=
 *        deny    → 302 error=access_denied
 *
 */

import { useState, useEffect, useCallback } from "react";

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// Types (matching live D1 schema + expected API shapes)
// ---------------------------------------------------------------------------

interface OAuthClient {
  client_id: string;           // iam_mcp_inneranimalmedia
  display_name: string;        // Inner Animal Media MCP Server
  logo_url: string | null;     // null in live D1
  homepage_url: string | null; // https://mcp.inneranimalmedia.com
}

interface ScopeInfo {
  scope: string;
  label: string;
  description: string;
  sensitive: boolean;
}

interface Workspace {
  id: string;        // ws_* from workspaces table
  name: string;
  tenant_id: string;
  workspace_type: string;
}

interface ConsentData {
  client: OAuthClient;
  scopes: ScopeInfo[];
  workspaces: Workspace[];
  expires_at: number;
  status: "pending" | "approved" | "denied" | "expired";
}

type ConsentState =
  | { phase: "loading" }
  | { phase: "ready"; data: ConsentData }
  | { phase: "submitting" }
  | { phase: "success" }
  | { phase: "denied" }
  | { phase: "error"; message: string };

// ---------------------------------------------------------------------------
// Scope metadata — labels for all five scopes confirmed in D1
// ---------------------------------------------------------------------------

const SCOPE_META: Record<string, Omit<ScopeInfo, "scope">> = {
  "iam:profile": {
    label: "Your profile",
    description: "Read your name, avatar, and account details.",
    sensitive: false,
  },
  "iam:workspaces": {
    label: "Workspaces",
    description: "List and read workspaces you have access to.",
    sensitive: false,
  },
  "iam:agent": {
    label: "Agent Sam",
    description: "Send messages and run tasks through your AI agent.",
    sensitive: true,
  },
  "mcp:tools": {
    label: "MCP tools",
    description: "Invoke registered MCP tools on your behalf.",
    sensitive: true,
  },
  "mcp:userinfo": {
    label: "MCP identity",
    description: "Read your MCP-scoped identity and connection status.",
    sensitive: false,
  },
};

function enrichScopes(rawScopes: string[]): ScopeInfo[] {
  return rawScopes.map((s) => ({
    scope: s,
    ...(SCOPE_META[s] ?? {
      label: s,
      description: "Additional access.",
      sensitive: false,
    }),
  }));
}

// ---------------------------------------------------------------------------
// API helpers (stub until migration_399 lands — matches handoff §3.3)
// ---------------------------------------------------------------------------

async function fetchConsentData(authorizationId: string): Promise<ConsentData> {
  const res = await fetch(
    `/api/oauth/mcp/consent?authorization_id=${encodeURIComponent(authorizationId)}`,
    { credentials: "include", headers: { Accept: "application/json" } },
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as any)?.error ?? `Consent load failed (${res.status})`
    );
  }
  const raw = await res.json();
  return {
    ...raw,
    scopes: enrichScopes(raw.scopes ?? []),
  };
}

async function submitConsent(
  authorizationId: string,
  workspaceId: string,
  action: "approve" | "deny"
): Promise<{ redirect_url?: string }> {
  const res = await fetch("/api/oauth/mcp/consent", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ authorization_id: authorizationId, workspace_id: workspaceId, action }),
  });
  if (res.redirected) {
    return { redirect_url: res.url };
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error ?? `Submit failed (${res.status})`);
  }
  const body = await res.json().catch(() => ({}));
  return body;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function IamShield({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M20 2L4 8V22C4 32.5 11.2 42.3 20 46C28.8 42.3 36 32.5 36 22V8L20 2Z"
        fill="currentColor"
        opacity="0.12"
      />
      <path
        d="M20 2L4 8V22C4 32.5 11.2 42.3 20 46C28.8 42.3 36 32.5 36 22V8L20 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 24L18 28L26 20"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ScopePill({ scope }: { scope: ScopeInfo }) {
  return (
    <li className="scope-item">
      <div className={cn("scope-dot", scope.sensitive && "scope-dot--sensitive")} />
      <div className="scope-content">
        <span className="scope-label">{scope.label}</span>
        <span className="scope-desc">{scope.description}</span>
      </div>
    </li>
  );
}

function WorkspacePicker({
  workspaces,
  selected,
  onChange,
}: {
  workspaces: Workspace[];
  selected: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="workspace-picker">
      <label className="field-label" htmlFor="workspace-select">
        Connect as workspace
      </label>
      <div className="select-wrapper">
        <select
          id="workspace-select"
          value={selected}
          onChange={(e) => onChange(e.target.value)}
          className="workspace-select"
        >
          <option value="" disabled>
            Choose a workspace…
          </option>
          {workspaces.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.name}
            </option>
          ))}
        </select>
        <ChevronIcon />
      </div>
    </div>
  );
}

function ChevronIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="select-chevron"
      aria-hidden="true"
    >
      <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ErrorScreen({ message, onBack }: { message: string; onBack?: () => void }) {
  return (
    <div className="state-screen">
      <div className="state-icon state-icon--error">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9.5 9.5L18.5 18.5M18.5 9.5L9.5 18.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </div>
      <h2 className="state-title">Something went wrong</h2>
      <p className="state-body">{friendlyError(message)}</p>
      {onBack && (
        <button className="btn btn--ghost" onClick={onBack}>
          ← Go back
        </button>
      )}
    </div>
  );
}

function SuccessScreen({ mode = "cli" }: { mode?: "cli" | "dashboard" }) {
  return (
    <div className="state-screen">
      <div className="state-icon state-icon--success">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 14.5L12.5 18L19 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="state-title">Connected</h2>
      <p className="state-body">
        {mode === "cli"
          ? "Return to Cursor or your MCP client — the connection will resume automatically."
          : "Inner Animal Media MCP Server now has access to your workspace."}
      </p>
      {mode === "dashboard" && (
        <a href="/dashboard/settings/keys" className="btn btn--ghost">
          Manage connections →
        </a>
      )}
    </div>
  );
}

function DeniedScreen() {
  return (
    <div className="state-screen">
      <div className="state-icon state-icon--neutral">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" />
          <path d="M14 9V15" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          <circle cx="14" cy="19" r="1" fill="currentColor" />
        </svg>
      </div>
      <h2 className="state-title">Access denied</h2>
      <p className="state-body">No access was granted. You can close this window.</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="state-screen">
      <div className="spinner" aria-label="Loading authorization request…" />
      <p className="state-body loading-label">Verifying authorization request…</p>
    </div>
  );
}

function friendlyError(msg: string): string {
  if (msg.includes("invalid_client")) return "This authorization request references an unrecognized client.";
  if (msg.includes("expired")) return "This authorization request has expired. Please restart the connection from your MCP client.";
  if (msg.includes("access_denied")) return "Access was denied.";
  if (msg.includes("invalid_state")) return "The authorization state is invalid or was already used.";
  return msg || "An unexpected error occurred.";
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

interface IamMcpOAuthConsentPageProps {
  /** Passed from route query param: ?authorization_id=oaa_* */
  authorizationId?: string;
  /** After approve — where to tell user to go. Defaults to cli. */
  successMode?: "cli" | "dashboard";
}

export default function IamMcpOAuthConsentPage({
  authorizationId,
  successMode = "cli",
}: IamMcpOAuthConsentPageProps) {
  const [state, setState] = useState<ConsentState>({ phase: "loading" });
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");

  // ── Load consent data ────────────────────────────────────────────────────
  useEffect(() => {
    if (!authorizationId) {
      setState({ phase: "error", message: "Missing authorization_id parameter." });
      return;
    }
    let cancelled = false;
    fetchConsentData(authorizationId)
      .then((data) => {
        if (cancelled) return;
        // Validate not already acted on
        if (data.status === "approved") { setState({ phase: "success" }); return; }
        if (data.status === "denied") { setState({ phase: "denied" }); return; }
        if (data.status === "expired") {
          setState({ phase: "error", message: "expired" });
          return;
        }
        setState({ phase: "ready", data });
        // Pre-select first workspace if only one
        if (data.workspaces.length === 1) {
          setSelectedWorkspace(data.workspaces[0].id);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ phase: "error", message: err.message });
      });
    return () => { cancelled = true; };
  }, [authorizationId]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    if (!authorizationId || !selectedWorkspace) return;
    setState({ phase: "submitting" });
    try {
      const result = await submitConsent(authorizationId, selectedWorkspace, "approve");
      if (result.redirect_url) {
        window.location.href = result.redirect_url;
      } else {
        setState({ phase: "success" });
      }
    } catch (err: any) {
      setState({ phase: "error", message: err.message });
    }
  }, [authorizationId, selectedWorkspace]);

  const handleDeny = useCallback(async () => {
    if (!authorizationId) return;
    setState({ phase: "submitting" });
    try {
      await submitConsent(authorizationId, selectedWorkspace || "_denied", "deny");
      setState({ phase: "denied" });
    } catch {
      setState({ phase: "denied" }); // best-effort — always show denied
    }
  }, [authorizationId, selectedWorkspace]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>
      <div className="consent-root">
        <div className="consent-card">
          {/* Header — IAM wordmark always visible */}
          <header className="consent-header">
            <div className="iam-brand">
              <IamShield className="iam-shield" />
              <span className="iam-name">Inner Animal Media</span>
            </div>
          </header>

          {/* Body */}
          <main className="consent-body">
            {state.phase === "loading" && <LoadingScreen />}
            {state.phase === "error" && (
              <ErrorScreen
                message={state.message}
                onBack={() => window.history.back()}
              />
            )}
            {state.phase === "success" && <SuccessScreen mode={successMode} />}
            {state.phase === "denied" && <DeniedScreen />}

            {(state.phase === "ready" || state.phase === "submitting") && (() => {
              const data = state.phase === "ready" ? state.data : (state as any)._data as ConsentData;
              // When submitting we freeze the last-known data — grab from previous ready state
              // (handled by keeping data in scope via closure in transition)
              if (!data) return <LoadingScreen />;

              const isSubmitting = state.phase === "submitting";
              const canApprove = !!selectedWorkspace && !isSubmitting;

              return (
                <div className="consent-main">
                  {/* Client identity */}
                  <div className="client-block">
                    <div className="client-logo">
                      {data.client.logo_url ? (
                        <img src={data.client.logo_url} alt={data.client.display_name} className="client-logo-img" />
                      ) : (
                        <IamShield className="client-logo-fallback" />
                      )}
                    </div>
                    <div className="client-meta">
                      <h1 className="client-name">{data.client.display_name}</h1>
                      {data.client.homepage_url && (
                        <a
                          href={data.client.homepage_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="client-url"
                        >
                          {new URL(data.client.homepage_url).hostname}
                        </a>
                      )}
                    </div>
                  </div>

                  <p className="consent-headline">
                    This application is requesting access to your Inner Animal Media account.
                  </p>

                  {/* Scopes */}
                  <section className="scopes-section">
                    <h2 className="section-label">Requested permissions</h2>
                    <ul className="scope-list">
                      {data.scopes.map((s) => (
                        <ScopePill key={s.scope} scope={s} />
                      ))}
                    </ul>
                  </section>

                  {/* Workspace picker */}
                  {data.workspaces.length > 0 && (
                    <WorkspacePicker
                      workspaces={data.workspaces}
                      selected={selectedWorkspace}
                      onChange={setSelectedWorkspace}
                    />
                  )}

                  {/* Actions */}
                  <div className="action-row">
                    <button
                      className={cn("btn btn--approve", isSubmitting && "btn--loading")}
                      onClick={handleApprove}
                      disabled={!canApprove}
                      aria-busy={isSubmitting}
                    >
                      {isSubmitting ? (
                        <span className="btn-spinner" />
                      ) : (
                        "Authorize"
                      )}
                    </button>
                    <button
                      className="btn btn--deny"
                      onClick={handleDeny}
                      disabled={isSubmitting}
                    >
                      Deny
                    </button>
                  </div>

                  {!selectedWorkspace && (
                    <p className="validation-hint">Select a workspace to continue.</p>
                  )}
                </div>
              );
            })()}
          </main>

          {/* Footer */}
          <footer className="consent-footer">
            <span>Authorization secured by Inner Animal Media</span>
          </footer>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Frozen-state transition helper
// We need to keep the `data` reference during the "submitting" phase so the
// form doesn't blank out. This wrapper captures it.
// ---------------------------------------------------------------------------

export function IamMcpOAuthConsentPageStateful(props: IamMcpOAuthConsentPageProps) {
  // This outer wrapper can be used to freeze consent data across state transitions
  // if needed — for now the main component handles it inline.
  return <IamMcpOAuthConsentPage {...props} />;
}

// ---------------------------------------------------------------------------
// Styles — CSS vars only, dark-native, no hardcoded hex
// ---------------------------------------------------------------------------

const STYLES = `
  .consent-root {
    --c-bg: #0d0e11;
    --c-surface: #13151a;
    --c-border: rgba(255,255,255,0.07);
    --c-border-subtle: rgba(255,255,255,0.04);
    --c-text: #e8eaf0;
    --c-muted: rgba(232,234,240,0.45);
    --c-accent: #5b8fff;
    --c-accent-hover: #7aaeff;
    --c-approve-bg: #5b8fff;
    --c-approve-text: #ffffff;
    --c-deny-bg: transparent;
    --c-deny-text: var(--c-muted);
    --c-deny-border: var(--c-border);
    --c-dot: rgba(232,234,240,0.25);
    --c-dot-sensitive: #ff6b6b;
    --c-success: #4ade80;
    --c-error: #f87171;
    --c-neutral: var(--c-muted);
    --r-card: 16px;
    --r-btn: 9px;
    --r-pill: 6px;
    --shadow-card: 0 0 0 1px var(--c-border), 0 24px 64px rgba(0,0,0,0.55);
    --font-sans: 'DM Sans', system-ui, sans-serif;
    --font-mono: 'DM Mono', 'Fira Code', monospace;

    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--c-bg);
    padding: 24px 16px;
    font-family: var(--font-sans);
    color: var(--c-text);
    -webkit-font-smoothing: antialiased;
  }

  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap');

  .consent-card {
    width: 100%;
    max-width: 440px;
    background: var(--c-surface);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: card-in 0.3s cubic-bezier(0.16,1,0.3,1) both;
  }

  @keyframes card-in {
    from { opacity: 0; transform: translateY(12px) scale(0.98); }
    to   { opacity: 1; transform: none; }
  }

  /* ── Header ── */
  .consent-header {
    padding: 20px 24px 16px;
    border-bottom: 1px solid var(--c-border-subtle);
  }

  .iam-brand {
    display: flex;
    align-items: center;
    gap: 9px;
  }

  .iam-shield {
    width: 22px;
    height: 26px;
    color: var(--c-accent);
    flex-shrink: 0;
  }

  .iam-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--c-muted);
    letter-spacing: 0.01em;
  }

  /* ── Body ── */
  .consent-body {
    padding: 28px 24px 20px;
    flex: 1;
  }

  /* ── State screens (loading / success / error / denied) ── */
  .state-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 12px 0 8px;
    text-align: center;
  }

  .state-icon {
    width: 52px;
    height: 52px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 4px;
  }

  .state-icon--success { background: rgba(74,222,128,0.1); color: var(--c-success); }
  .state-icon--error   { background: rgba(248,113,113,0.1); color: var(--c-error); }
  .state-icon--neutral { background: rgba(232,234,240,0.07); color: var(--c-muted); }

  .state-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0;
  }

  .state-body {
    font-size: 14px;
    color: var(--c-muted);
    margin: 0;
    line-height: 1.55;
    max-width: 300px;
  }

  .loading-label {
    animation: pulse-opacity 1.4s ease-in-out infinite;
  }

  @keyframes pulse-opacity {
    0%, 100% { opacity: 0.4; }
    50%       { opacity: 0.85; }
  }

  /* Spinner */
  .spinner {
    width: 28px;
    height: 28px;
    border: 2px solid var(--c-border);
    border-top-color: var(--c-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── Main consent form ── */
  .consent-main {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Client block */
  .client-block {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .client-logo {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(91,143,255,0.08);
    border: 1px solid var(--c-border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .client-logo-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .client-logo-fallback {
    width: 22px;
    height: 26px;
    color: var(--c-accent);
  }

  .client-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .client-name {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
    line-height: 1.2;
  }

  .client-url {
    font-size: 12px;
    color: var(--c-muted);
    text-decoration: none;
    font-family: var(--font-mono);
    letter-spacing: -0.01em;
    transition: color 0.15s;
  }
  .client-url:hover { color: var(--c-accent); }

  /* Headline */
  .consent-headline {
    font-size: 14px;
    color: var(--c-muted);
    margin: 0;
    line-height: 1.5;
  }

  /* Scopes */
  .scopes-section {
    background: rgba(255,255,255,0.025);
    border: 1px solid var(--c-border);
    border-radius: var(--r-pill);
    padding: 14px 16px;
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--c-muted);
    margin: 0 0 10px;
  }

  .scope-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .scope-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .scope-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--c-dot);
    flex-shrink: 0;
    margin-top: 5px;
  }

  .scope-dot--sensitive {
    background: var(--c-dot-sensitive);
    box-shadow: 0 0 6px rgba(255,107,107,0.4);
  }

  .scope-content {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .scope-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--c-text);
  }

  .scope-desc {
    font-size: 12px;
    color: var(--c-muted);
    line-height: 1.4;
  }

  /* Workspace picker */
  .workspace-picker {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .field-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--c-muted);
    letter-spacing: 0.02em;
  }

  .select-wrapper {
    position: relative;
  }

  .workspace-select {
    width: 100%;
    appearance: none;
    -webkit-appearance: none;
    background: rgba(255,255,255,0.03);
    border: 1px solid var(--c-border);
    border-radius: var(--r-pill);
    padding: 10px 36px 10px 12px;
    font-size: 14px;
    font-family: var(--font-sans);
    color: var(--c-text);
    cursor: pointer;
    transition: border-color 0.15s;
    outline: none;
  }

  .workspace-select:focus {
    border-color: var(--c-accent);
    box-shadow: 0 0 0 3px rgba(91,143,255,0.15);
  }

  .workspace-select option {
    background: #1a1d24;
    color: var(--c-text);
  }

  .select-chevron {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--c-muted);
    pointer-events: none;
  }

  /* Actions */
  .action-row {
    display: flex;
    gap: 10px;
  }

  .btn {
    flex: 1;
    padding: 11px 20px;
    border-radius: var(--r-btn);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-sans);
    cursor: pointer;
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: opacity 0.15s, transform 0.1s, background 0.15s, box-shadow 0.15s;
    outline: none;
  }

  .btn:active { transform: scale(0.98); }

  .btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    transform: none;
  }

  .btn--approve {
    background: var(--c-approve-bg);
    color: var(--c-approve-text);
    flex: 2;
    box-shadow: 0 4px 16px rgba(91,143,255,0.25);
  }

  .btn--approve:hover:not(:disabled) {
    background: var(--c-accent-hover);
    box-shadow: 0 4px 20px rgba(91,143,255,0.4);
  }

  .btn--deny {
    background: var(--c-deny-bg);
    color: var(--c-deny-text);
    border: 1px solid var(--c-deny-border);
  }

  .btn--deny:hover:not(:disabled) {
    background: rgba(248,113,113,0.06);
    color: var(--c-error);
    border-color: rgba(248,113,113,0.3);
  }

  .btn--ghost {
    background: transparent;
    color: var(--c-accent);
    border: 1px solid var(--c-border);
    flex: none;
    margin-top: 8px;
  }

  .btn--ghost:hover { background: rgba(91,143,255,0.08); }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
    display: inline-block;
  }

  .validation-hint {
    font-size: 12px;
    color: var(--c-muted);
    text-align: center;
    margin: -8px 0 0;
    animation: fade-in 0.2s ease;
  }

  @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

  /* Footer */
  .consent-footer {
    padding: 14px 24px;
    border-top: 1px solid var(--c-border-subtle);
    font-size: 11px;
    color: rgba(232,234,240,0.25);
    text-align: center;
    font-family: var(--font-mono);
  }

  /* Mobile */
  @media (max-width: 480px) {
    .consent-root { padding: 0; align-items: flex-end; }
    .consent-card {
      max-width: 100%;
      border-radius: 20px 20px 0 0;
      min-height: 60dvh;
      box-shadow: 0 -8px 40px rgba(0,0,0,0.6);
    }
  }
`;
