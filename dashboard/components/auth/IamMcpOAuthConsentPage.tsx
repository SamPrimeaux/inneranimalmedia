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

/** Company signature wordmark (hosted CF Images). Footer ~150px display. */
const IAM_SIGNATURE_LOGO_URL =
  "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/ac515729-af6b-4ea5-8b10-e581a4d02100/thumbnail";

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

interface ConnectingAppInfo {
  key: "cursor" | "claude" | "chatgpt" | "mcp";
  label: string;
  badge: string;
  tagline: string;
  return_hint: string;
  accent: string;
}

interface ConsentData {
  client: OAuthClient;
  scopes: ScopeInfo[];
  workspaces: Workspace[];
  redirect_uri?: string | null;
  connecting_app?: ConnectingAppInfo;
  default_workspace_id?: string | null;
  signed_in_email?: string | null;
  expires_at: number;
  status: "pending" | "approved" | "denied" | "expired";
}

type ConsentState =
  | { phase: "loading" }
  | { phase: "ready"; data: ConsentData }
  | { phase: "submitting"; data: ConsentData }
  | { phase: "success"; connectingApp: ConnectingAppInfo }
  | { phase: "denied"; connectingApp?: ConnectingAppInfo }
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
    label: "Account access",
    description: "Use your account within your assigned workspace.",
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

/** Hide workspace enumeration on external client consent — workspace is auto-bound server-side. */
function scopesForDisplay(scopes: ScopeInfo[]): ScopeInfo[] {
  return scopes.filter((s) => s.scope !== "iam:workspaces");
}

function pickDefaultWorkspace(data: ConsentData): string {
  return (
    data.default_workspace_id ||
    data.workspaces[0]?.id ||
    ""
  );
}

function workspaceDisplayName(data: ConsentData, workspaceId: string): string {
  const ws = data.workspaces.find((w) => w.id === workspaceId);
  return ws?.name || "your workspace";
}

const DEFAULT_CONNECTING_APP: ConnectingAppInfo = {
  key: "mcp",
  label: "MCP client",
  badge: "MCP",
  tagline: "Authorize tools for your connected MCP application",
  return_hint: "Return to your MCP client to continue.",
  accent: "#0969da",
};

function resolveConnectingAppClient(data: ConsentData): ConnectingAppInfo {
  return data.connecting_app ?? DEFAULT_CONNECTING_APP;
}

function ConnectingAppBanner({ app }: { app: ConnectingAppInfo }) {
  return (
    <div
      className={cn("connecting-app-banner", `connecting-app-banner--${app.key}`)}
      style={{ ["--app-accent" as string]: app.accent }}
      role="status"
    >
      <span className="connecting-app-badge" aria-hidden="true">
        {app.badge}
      </span>
      <div className="connecting-app-copy">
        <strong className="connecting-app-title">Connecting from {app.label}</strong>
        <span className="connecting-app-tagline">{app.tagline}</span>
      </div>
    </div>
  );
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

function SuccessScreen({ app }: { app: ConnectingAppInfo }) {
  return (
    <div className="state-screen">
      <div className="state-icon state-icon--success">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 14.5L12.5 18L19 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="state-title">Connected to {app.label}</h2>
      <p className="state-body">{app.return_hint}</p>
    </div>
  );
}

function DeniedScreen({ app }: { app?: ConnectingAppInfo }) {
  const label = app?.label ?? "the app";
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
      <p className="state-body">
        No access was granted. You can close this window and return to {label}.
      </p>
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
}

export default function IamMcpOAuthConsentPage({
  authorizationId,
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
        const app = resolveConnectingAppClient(data);
        if (data.status === "approved") { setState({ phase: "success", connectingApp: app }); return; }
        if (data.status === "denied") { setState({ phase: "denied", connectingApp: app }); return; }
        if (data.status === "expired") {
          setState({ phase: "error", message: "expired" });
          return;
        }
        const defaultWs = pickDefaultWorkspace(data);
        if (!defaultWs) {
          setState({
            phase: "error",
            message: "No workspace is available for this account. Contact your administrator.",
          });
          return;
        }
        setSelectedWorkspace(defaultWs);
        setState({ phase: "ready", data });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ phase: "error", message: err.message });
      });
    return () => { cancelled = true; };
  }, [authorizationId]);

  useEffect(() => {
    if (state.phase === "ready" || state.phase === "submitting") {
      const app = resolveConnectingAppClient(state.data);
      document.title = `Authorize ${app.label} · Inner Animal Media`;
    }
  }, [state]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    if (!authorizationId || !selectedWorkspace || state.phase !== "ready") return;
    const frozen = state.data;
    setState({ phase: "submitting", data: frozen });
    try {
      const result = await submitConsent(authorizationId, selectedWorkspace, "approve");
      if (result.redirect_url) {
        window.location.href = result.redirect_url;
      } else {
        setState({ phase: "success", connectingApp: resolveConnectingAppClient(frozen) });
      }
    } catch (err: any) {
      setState({ phase: "error", message: err.message });
    }
  }, [authorizationId, selectedWorkspace, state]);

  const handleDeny = useCallback(async () => {
    if (!authorizationId || state.phase !== "ready") return;
    const frozen = state.data;
    setState({ phase: "submitting", data: frozen });
    try {
      await submitConsent(authorizationId, selectedWorkspace || "_denied", "deny");
      setState({ phase: "denied", connectingApp: resolveConnectingAppClient(frozen) });
    } catch {
      setState({ phase: "denied", connectingApp: resolveConnectingAppClient(frozen) });
    }
  }, [authorizationId, selectedWorkspace, state]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <style>{STYLES}</style>
      <div className="consent-root">
        <div className="consent-card">
          <header className="consent-header">
            <div className="iam-brand">
              {state.phase === "ready" || state.phase === "submitting" ? (
                state.data.client.logo_url ? (
                  <img
                    src={state.data.client.logo_url}
                    alt=""
                    className="iam-brand-logo"
                  />
                ) : (
                  <IamShield className="iam-shield" />
                )
              ) : (
                <IamShield className="iam-shield" />
              )}
              <span className="iam-name">Inner Animal Media</span>
            </div>
          </header>

          <main className="consent-body">
            {state.phase === "loading" && <LoadingScreen />}
            {state.phase === "error" && (
              <ErrorScreen
                message={state.message}
                onBack={() => window.history.back()}
              />
            )}
            {state.phase === "success" && <SuccessScreen app={state.connectingApp} />}
            {state.phase === "denied" && <DeniedScreen app={state.connectingApp} />}

            {(state.phase === "ready" || state.phase === "submitting") && (() => {
              const data = state.data;

              const isSubmitting = state.phase === "submitting";
              const displayScopes = scopesForDisplay(data.scopes);
              const wsName = workspaceDisplayName(data, selectedWorkspace);
              const signedIn = data.signed_in_email || "";
              const connectingApp = resolveConnectingAppClient(data);

              return (
                <div className="consent-main">
                  <ConnectingAppBanner app={connectingApp} />
                  <div className="client-block">
                    <div className={cn("client-logo", data.client.logo_url && "client-logo--brand")}>
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
                    <strong>{connectingApp.label}</strong> is connecting to{" "}
                    <strong>{data.client.display_name}</strong> on your{" "}
                    <strong>Inner Animal Media</strong> account
                    {signedIn ? (
                      <>
                        {" "}
                        as <strong>{signedIn}</strong>
                      </>
                    ) : null}
                    .
                  </p>

                  <p className="consent-subline">
                    Access will be scoped to <strong>{wsName}</strong>.
                  </p>

                  <section className="scopes-section" aria-labelledby="scopes-heading">
                    <h2 id="scopes-heading" className="section-label">
                      This will allow it to
                    </h2>
                    <ul className="scope-list">
                      {displayScopes.map((s) => (
                        <ScopePill key={s.scope} scope={s} />
                      ))}
                    </ul>
                  </section>

                  <div className="action-stack">
                    <button
                      type="button"
                      className={cn("btn btn--approve", isSubmitting && "btn--loading")}
                      onClick={handleApprove}
                      disabled={isSubmitting}
                      aria-busy={isSubmitting}
                    >
                      {isSubmitting ? <span className="btn-spinner" /> : "Authorize"}
                    </button>
                    <button
                      type="button"
                      className="btn btn--cancel-link"
                      onClick={handleDeny}
                      disabled={isSubmitting}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            })()}
          </main>

          {/* Footer — company signature wordmark */}
          <footer className="consent-footer">
            <img
              src={IAM_SIGNATURE_LOGO_URL}
              alt="Inner Animal Media"
              className="consent-footer-signature"
              width={150}
              height={48}
            />
            <span className="consent-footer-note">Authorization secured by Inner Animal Media</span>
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
// Styles — light OAuth consent (GitHub-style)
// ---------------------------------------------------------------------------

const STYLES = `
  .consent-root {
    --c-bg: #f6f8fa;
    --c-surface: #ffffff;
    --c-border: #d0d7de;
    --c-border-subtle: #eaeef2;
    --c-text: #1f2328;
    --c-muted: #656d76;
    --c-accent: #0969da;
    --c-accent-hover: #0550ae;
    --c-approve-bg: #2da44e;
    --c-approve-hover: #2c974b;
    --c-approve-text: #ffffff;
    --c-dot: #0969da;
    --c-dot-sensitive: #bc4c00;
    --c-success: #1a7f37;
    --c-error: #cf222e;
    --r-card: 12px;
    --r-btn: 6px;
    --shadow-card: 0 1px 3px rgba(31,35,40,0.12), 0 8px 24px rgba(31,35,40,0.08);
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;

    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--c-bg);
    padding: 32px 16px;
    font-family: var(--font-sans);
    color: var(--c-text);
    -webkit-font-smoothing: antialiased;
  }

  .consent-card {
    width: 100%;
    max-width: 400px;
    background: var(--c-surface);
    border: 1px solid var(--c-border);
    border-radius: var(--r-card);
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: card-in 0.25s ease-out both;
  }

  @keyframes card-in {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: none; }
  }

  .consent-header {
    padding: 16px 24px;
    border-bottom: 1px solid var(--c-border-subtle);
    background: #fafbfc;
  }

  .iam-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .iam-shield {
    width: 20px;
    height: 24px;
    color: var(--c-accent);
    flex-shrink: 0;
  }

  .iam-brand-logo {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    object-fit: contain;
    flex-shrink: 0;
    background: #0b1220;
  }

  .iam-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--c-muted);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .consent-body {
    padding: 24px;
    flex: 1;
  }

  .state-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px 0;
    text-align: center;
  }

  .state-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .state-icon--success { background: #dafbe1; color: var(--c-success); }
  .state-icon--error   { background: #ffebe9; color: var(--c-error); }
  .state-icon--neutral { background: #f6f8fa; color: var(--c-muted); }

  .state-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    color: var(--c-text);
  }

  .state-body {
    font-size: 14px;
    color: var(--c-muted);
    margin: 0;
    line-height: 1.5;
    max-width: 320px;
  }

  .loading-label {
    animation: pulse-opacity 1.4s ease-in-out infinite;
  }

  @keyframes pulse-opacity {
    0%, 100% { opacity: 0.45; }
    50%       { opacity: 1; }
  }

  .spinner {
    width: 28px;
    height: 28px;
    border: 2px solid var(--c-border);
    border-top-color: var(--c-accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  .consent-main {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .connecting-app-banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid var(--c-border-subtle);
    border-left: 4px solid var(--app-accent, var(--c-accent));
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--app-accent, var(--c-accent)) 8%, transparent),
      transparent 72%
    );
  }

  .connecting-app-badge {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--app-accent, var(--c-accent));
    background: color-mix(in srgb, var(--app-accent, var(--c-accent)) 12%, #fff);
    border: 1px solid color-mix(in srgb, var(--app-accent, var(--c-accent)) 28%, var(--c-border));
  }

  .connecting-app-banner--cursor .connecting-app-badge {
    font-size: 16px;
    font-weight: 600;
  }

  .connecting-app-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .connecting-app-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--c-text);
    line-height: 1.35;
  }

  .connecting-app-tagline {
    font-size: 13px;
    color: var(--c-muted);
    line-height: 1.4;
  }

  .client-block {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 4px;
  }

  .client-logo {
    width: 44px;
    height: 44px;
    border-radius: 8px;
    background: #f6f8fa;
    border: 1px solid var(--c-border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .client-logo--brand {
    background: #0b1220;
    border-color: #21262d;
  }

  .client-logo-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 4px;
  }

  .client-logo--brand .client-logo-img {
    padding: 6px;
  }

  .client-logo-fallback {
    width: 20px;
    height: 24px;
    color: var(--c-accent);
  }

  .client-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .client-name {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
    line-height: 1.3;
    color: var(--c-text);
  }

  .client-url {
    font-size: 12px;
    color: var(--c-muted);
    text-decoration: none;
  }
  .client-url:hover { color: var(--c-accent); text-decoration: underline; }

  .consent-headline {
    font-size: 15px;
    color: var(--c-text);
    margin: 0;
    line-height: 1.45;
  }

  .consent-headline strong {
    font-weight: 600;
  }

  .consent-subline {
    font-size: 13px;
    color: var(--c-muted);
    margin: -8px 0 0;
    line-height: 1.45;
  }

  .scopes-section {
    border-top: 1px solid var(--c-border-subtle);
    padding-top: 16px;
  }

  .section-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--c-text);
    margin: 0 0 12px;
    text-transform: none;
    letter-spacing: normal;
  }

  .scope-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .scope-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .scope-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--c-dot);
    flex-shrink: 0;
    margin-top: 6px;
  }

  .scope-dot--sensitive {
    background: var(--c-dot-sensitive);
  }

  .scope-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .scope-label {
    font-size: 14px;
    font-weight: 500;
    color: var(--c-text);
  }

  .scope-desc {
    font-size: 13px;
    color: var(--c-muted);
    line-height: 1.4;
  }

  .action-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
  }

  .btn {
    width: 100%;
    padding: 10px 16px;
    border-radius: var(--r-btn);
    font-size: 14px;
    font-weight: 600;
    font-family: var(--font-sans);
    cursor: pointer;
    border: 1px solid transparent;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.12s, border-color 0.12s, opacity 0.12s;
    outline: none;
  }

  .btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .btn--approve {
    background: var(--c-approve-bg);
    color: var(--c-approve-text);
    border-color: rgba(27,31,36,0.15);
  }

  .btn--approve:hover:not(:disabled) {
    background: var(--c-approve-hover);
  }

  .btn--cancel-link {
    background: transparent;
    color: var(--c-muted);
    border: none;
    font-weight: 500;
    padding: 8px;
  }

  .btn--cancel-link:hover:not(:disabled) {
    color: var(--c-text);
    text-decoration: underline;
  }

  .btn--ghost {
    background: var(--c-surface);
    color: var(--c-text);
    border: 1px solid var(--c-border);
    width: auto;
    margin-top: 8px;
  }

  .btn--ghost:hover {
    background: #f6f8fa;
    border-color: #8c959f;
  }

  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255,255,255,0.35);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  .consent-footer {
    padding: 16px 24px 20px;
    border-top: 1px solid var(--c-border-subtle);
    text-align: center;
    background: #fafbfc;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .consent-footer-signature {
    width: 150px;
    max-width: 100%;
    height: auto;
    object-fit: contain;
    display: block;
  }

  .consent-footer-note {
    font-size: 11px;
    color: var(--c-muted);
    line-height: 1.4;
  }

  @media (max-width: 480px) {
    .consent-root { padding: 16px 12px; }
    .consent-card { max-width: 100%; }
    .consent-body { padding: 20px 18px; }
  }
`;
