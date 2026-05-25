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

/** Footer company signature — do not use for app/MCP identity. */
const IAM_FOOTER_LOGO_URL =
  "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/87aac7e9-d6c7-4a53-df89-605e8020e000/small";

/** Square MCP / app icon — header + client identity row only. */
const IAM_APP_ICON_URL =
  "https://imagedelivery.net/g7wf09fCONpnidkRnR_5vw/8e323ffb-4338-41dc-1f71-9c7bdc57bb00/avatar";

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

type McpClientKey = "cursor" | "claude" | "chatgpt" | "default";

interface ConnectingAppInfo {
  key: McpClientKey;
  label: string;
  badge: string;
  tagline: string;
  return_hint: string;
  accent: string;
}

interface ClientCopy {
  displayName: string;
  headline: string;
  helper: string;
}

const CLIENT_COPY: Record<McpClientKey, ClientCopy> = {
  cursor: {
    displayName: "Cursor",
    headline: "Inner Animal Media MCP Server wants to connect to Cursor",
    helper:
      "This allows Cursor to use approved Inner Animal Media MCP tools for your account.",
  },
  claude: {
    displayName: "Claude.ai",
    headline: "Inner Animal Media MCP Server wants to connect to Claude.ai",
    helper:
      "This allows Claude.ai to use approved Inner Animal Media MCP tools for your account.",
  },
  chatgpt: {
    displayName: "ChatGPT",
    headline: "Inner Animal Media MCP Server wants to connect to ChatGPT",
    helper:
      "This allows ChatGPT to use approved Inner Animal Media MCP tools for your account.",
  },
  default: {
    displayName: "your MCP client",
    headline: "Inner Animal Media MCP Server wants to connect to your MCP client",
    helper:
      "This allows your MCP client to use approved Inner Animal Media MCP tools for your account.",
  },
};

interface ConsentToolRow {
  tool_key: string;
  label: string;
  access_class: "read" | "write";
  risk_level?: string;
  requires_approval?: boolean;
}

interface ConsentToolSummary {
  total: number;
  read: number;
  write: number;
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
  /** Double-submit CSRF — must match __Host-mcp_oauth_consent_csrf cookie on POST */
  consent_csrf?: string;
  allowed_tools?: ConsentToolRow[];
  tool_summary?: ConsentToolSummary;
  require_allowlist_for_mcp?: number;
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
    description: "Read your name, avatar, email, and account details.",
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
    description: "Invoke only the tools listed below for your account.",
    sensitive: true,
  },
  "mcp:userinfo": {
    label: "MCP identity",
    description: "Read connection status and MCP-scoped identity for this client.",
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

/** Workspace bound server-side — do not show workspace picker or name on consent. */
function scopesForDisplay(
  scopes: ScopeInfo[],
  clientDisplayName: string,
  hasToolManifest: boolean,
): ScopeInfo[] {
  return scopes
    .filter((s) => {
      if (s.scope === "iam:workspaces" || s.scope === "iam:agent") return false;
      if (hasToolManifest && s.scope === "mcp:tools") return false;
      return true;
    })
    .map((s) => {
      if (s.scope === "mcp:tools") {
        return {
          ...s,
          label: "MCP tools",
          description: `Allow ${clientDisplayName} to call only the MCP tools listed for your account.`,
        };
      }
      return s;
    });
}

function pickDefaultWorkspace(data: ConsentData): string {
  return (
    data.default_workspace_id ||
    data.workspaces[0]?.id ||
    ""
  );
}

const DEFAULT_CONNECTING_APP: ConnectingAppInfo = {
  key: "default",
  label: "your MCP client",
  badge: "MCP",
  tagline: CLIENT_COPY.default.helper,
  return_hint: "Return to your MCP client to continue.",
  accent: "#38bdf8",
};

function detectMcpClient(input: {
  clientId?: string;
  clientName?: string;
  redirectUri?: string;
}): McpClientKey {
  const raw = [input.clientId, input.clientName, input.redirectUri]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (raw.includes("cursor") || raw.includes("anysphere")) return "cursor";
  if (raw.includes("claude") || raw.includes("anthropic")) return "claude";
  if (raw.includes("chatgpt") || raw.includes("openai")) return "chatgpt";
  return "default";
}

function normalizeClientKey(key: string | undefined): McpClientKey {
  if (key === "mcp") return "default";
  if (key === "cursor" || key === "claude" || key === "chatgpt" || key === "default") return key;
  return "default";
}

function resolveClientContext(data: ConsentData): {
  key: McpClientKey;
  copy: ClientCopy;
  app: ConnectingAppInfo;
} {
  const detected = detectMcpClient({
    clientId: data.client.client_id,
    clientName: data.client.display_name,
    redirectUri: data.redirect_uri ?? undefined,
  });
  const server = data.connecting_app;
  const key = server?.key ? normalizeClientKey(server.key) : detected;
  const copy = CLIENT_COPY[key];
  const app: ConnectingAppInfo = server
    ? { ...server, key, label: copy.displayName, tagline: copy.helper }
    : { ...DEFAULT_CONNECTING_APP, key, label: copy.displayName, tagline: copy.helper };
  return { key, copy, app };
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
  action: "approve" | "deny",
  consentCsrf: string
): Promise<{ redirect_url?: string }> {
  const res = await fetch("/api/oauth/mcp/consent", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      authorization_id: authorizationId,
      workspace_id: workspaceId,
      action,
      consent_csrf: consentCsrf,
    }),
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

function ConsentToolsSection({
  tools,
  summary,
  clientLabel,
  requireAllowlist,
}: {
  tools: ConsentToolRow[];
  summary: ConsentToolSummary;
  clientLabel: string;
  requireAllowlist: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const show = expanded ? tools : tools.slice(0, 8);
  const hasMore = tools.length > 8;

  return (
    <section className="tools-section" aria-labelledby="tools-heading">
      <h2 id="tools-heading" className="section-label">
        MCP tools {clientLabel} may call
      </h2>
      <p className="tools-summary">
        {summary.total} tool{summary.total === 1 ? "" : "s"} for this connection
        {summary.read > 0 ? ` · ${summary.read} read` : ""}
        {summary.write > 0 ? ` · ${summary.write} write` : ""}
        {requireAllowlist ? " · filtered by your Settings allowlist" : ""}
      </p>
      {tools.length === 0 ? (
        <p className="tools-empty">
          No MCP tools are available for your account with the current allowlist and scopes.
          Adjust Settings → Network or reconnect after adding tools.
        </p>
      ) : (
        <ul className="tool-list">
          {show.map((t) => (
            <li key={t.tool_key} className="tool-row">
              <span className={cn("tool-badge", t.access_class === "write" && "tool-badge--write")}>
                {t.access_class}
              </span>
              <span className="tool-label" title={t.tool_key}>
                {t.label}
              </span>
              {t.requires_approval ? (
                <span className="tool-tag">approval</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button type="button" className="tools-expand" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `Show all ${tools.length} tools`}
        </button>
      )}
    </section>
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

function SuccessScreen({ copy, app }: { copy: ClientCopy; app: ConnectingAppInfo }) {
  return (
    <div className="state-screen">
      <div className="state-icon state-icon--success">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
          <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="1.5" />
          <path d="M9 14.5L12.5 18L19 11" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="state-title">Connected to {copy.displayName}</h2>
      <p className="state-body">{app.return_hint}</p>
    </div>
  );
}

function DeniedScreen({ copy }: { copy: ClientCopy }) {
  const label = copy.displayName;
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
        const { app } = resolveClientContext(data);
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
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlBg = html.style.background;
    const prevBodyBg = body.style.background;
    const prevBodyColor = body.style.color;
    html.style.background = "#0b1220";
    body.style.background = "#0b1220";
    body.style.color = "#f1f5f9";
    return () => {
      html.style.background = prevHtmlBg;
      body.style.background = prevBodyBg;
      body.style.color = prevBodyColor;
    };
  }, []);

  useEffect(() => {
    if (state.phase === "ready" || state.phase === "submitting") {
      const { copy } = resolveClientContext(state.data);
      document.title = `Authorize ${copy.displayName} · Inner Animal Media`;
    }
  }, [state]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleApprove = useCallback(async () => {
    if (!authorizationId || !selectedWorkspace || state.phase !== "ready") return;
    const frozen = state.data;
    setState({ phase: "submitting", data: frozen });
    try {
      const result = await submitConsent(
        authorizationId,
        selectedWorkspace,
        "approve",
        frozen.consent_csrf || ""
      );
      if (result.redirect_url) {
        window.location.href = result.redirect_url;
      } else {
        setState({ phase: "success", connectingApp: resolveClientContext(frozen).app });
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
      await submitConsent(
        authorizationId,
        selectedWorkspace || "_denied",
        "deny",
        frozen.consent_csrf || ""
      );
      setState({ phase: "denied", connectingApp: resolveClientContext(frozen).app });
    } catch {
      setState({ phase: "denied", connectingApp: resolveClientContext(frozen).app });
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
              <div className="iam-app-icon-wrap">
                <img
                  src={IAM_APP_ICON_URL}
                  alt="Inner Animal Media MCP"
                  className="iam-brand-logo"
                  loading="eager"
                  decoding="async"
                />
              </div>
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
            {state.phase === "success" && (
              <SuccessScreen
                copy={CLIENT_COPY[normalizeClientKey(state.connectingApp.key)]}
                app={state.connectingApp}
              />
            )}
            {state.phase === "denied" && (
              <DeniedScreen
                copy={CLIENT_COPY[normalizeClientKey(state.connectingApp?.key)]}
              />
            )}

            {(state.phase === "ready" || state.phase === "submitting") && (() => {
              const data = state.data;

              const isSubmitting = state.phase === "submitting";
              const { copy, app: connectingApp } = resolveClientContext(data);
              const tools = data.allowed_tools ?? [];
              const summary = data.tool_summary ?? { total: tools.length, read: 0, write: 0 };
              const displayScopes = scopesForDisplay(
                data.scopes,
                copy.displayName,
                tools.length > 0,
              );
              const signedIn = data.signed_in_email || "";
              const requireAllowlist = Number(data.require_allowlist_for_mcp || 0) === 1;
              return (
                <div
                  className="consent-main"
                  style={{ ["--app-accent" as string]: connectingApp.accent }}
                >
                  <div className="client-block">
                    <div className="client-logo client-logo--brand">
                      <img
                        src={IAM_APP_ICON_URL}
                        alt="Inner Animal Media MCP"
                        className="client-logo-img"
                        loading="eager"
                        decoding="async"
                      />
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

                  <p className="consent-headline">{copy.headline}</p>

                  <p className="consent-helper">{copy.helper}</p>

                  {signedIn ? (
                    <p className="consent-account">
                      Signed in as <strong>{signedIn}</strong>
                    </p>
                  ) : null}

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

                  {(data.scopes.some((s) => s.scope === "mcp:tools") || tools.length > 0) && (
                    <ConsentToolsSection
                      tools={tools}
                      summary={summary}
                      clientLabel={copy.displayName}
                      requireAllowlist={requireAllowlist}
                    />
                  )}

                  <div className="consent-trust-note" role="note">
                    Write actions, terminal commands, deployments, and database changes
                    require confirmation before running.
                  </div>

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
              src={IAM_FOOTER_LOGO_URL}
              alt="Inner Animal Media"
              className="consent-footer-signature"
              loading="lazy"
              decoding="async"
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
// Styles — official IAM MCP OAuth consent (dark tile #0b1220)
// ---------------------------------------------------------------------------

const STYLES = `
  .consent-root {
    --c-bg: #0b1220;
    --c-surface: #0f172a;
    --c-border: #1e293b;
    --c-border-subtle: #334155;
    --c-text: #f1f5f9;
    --c-muted: #94a3b8;
    --c-accent: #38bdf8;
    --c-accent-hover: #7dd3fc;
    --c-approve-bg: #22c55e;
    --c-approve-hover: #16a34a;
    --c-approve-text: #052e16;
    --c-dot: #38bdf8;
    --c-dot-sensitive: #fb923c;
    --c-success: #4ade80;
    --c-error: #f87171;
    --r-card: 16px;
    --r-btn: 10px;
    --shadow-card: 0 28px 100px rgba(0,0,0,0.55);
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;

    position: fixed;
    inset: 0;
    z-index: 10000;
    overflow-y: auto;
    color-scheme: dark;
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: radial-gradient(900px 500px at 80% -20%, rgba(56,189,248,0.18), transparent 50%), var(--c-bg) !important;
    padding: 32px 16px;
    font-family: var(--font-sans);
    color: var(--c-text);
    -webkit-font-smoothing: antialiased;
    isolation: isolate;
  }

  .consent-card {
    width: 100%;
    max-width: 440px;
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
    border-bottom: 1px solid var(--c-border);
    background: #0b1220;
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

  .iam-app-icon-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 1px solid var(--c-border);
    background: #0b1220;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
    flex-shrink: 0;
  }

  .iam-brand-logo {
    width: 26px;
    height: 26px;
    border-radius: 6px;
    object-fit: contain;
    flex-shrink: 0;
    background: transparent;
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
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: #0b1220;
    border: 1px solid var(--c-border);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
  }

  .client-logo--brand {
    background: #0b1220;
    border-color: var(--c-border);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  }

  .client-logo-img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    padding: 0;
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
    font-size: 16px;
    font-weight: 600;
    color: var(--c-text);
    margin: 0;
    line-height: 1.4;
  }

  .consent-helper {
    font-size: 14px;
    color: var(--c-muted);
    margin: 0;
    line-height: 1.45;
  }

  .consent-account {
    font-size: 13px;
    color: var(--c-muted);
    margin: 0;
    line-height: 1.45;
  }

  .consent-account strong {
    color: var(--c-text);
    font-weight: 600;
  }

  .consent-trust-note {
    font-size: 12px;
    line-height: 1.45;
    color: var(--c-muted);
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--c-border);
    background: rgba(2, 6, 23, 0.6);
  }

  .tools-section {
    border-top: 1px solid var(--c-border-subtle);
    padding-top: 16px;
    margin-top: 4px;
  }

  .tools-summary {
    font-size: 12px;
    color: var(--c-muted);
    margin: 0 0 10px;
    line-height: 1.45;
  }

  .tools-empty {
    font-size: 13px;
    color: var(--c-muted);
    margin: 0;
    line-height: 1.5;
  }

  .tool-list {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 220px;
    overflow-y: auto;
    border: 1px solid var(--c-border);
    border-radius: 10px;
    background: rgba(2, 6, 23, 0.5);
  }

  .tool-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(30, 41, 59, 0.6);
    font-size: 12px;
  }

  .tool-row:last-child { border-bottom: none; }

  .tool-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(56, 189, 248, 0.15);
    color: #7dd3fc;
    flex-shrink: 0;
  }

  .tool-badge--write {
    background: rgba(245, 158, 11, 0.18);
    color: #fcd34d;
  }

  .tool-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--c-text);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
  }

  .tool-tag {
    font-size: 10px;
    color: #fca5a5;
    flex-shrink: 0;
  }

  .tools-expand {
    margin-top: 8px;
    background: transparent;
    border: none;
    color: var(--c-accent);
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    padding: 4px 0;
  }

  .tools-expand:hover { text-decoration: underline; }

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
    background: linear-gradient(135deg, var(--c-approve-bg), #16a34a);
    color: #ecfdf5;
    border-color: rgba(34, 197, 94, 0.35);
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
    background: rgba(30, 41, 59, 0.5);
    border-color: #64748b;
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
    background: #0b1220;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .consent-footer-signature {
    width: auto;
    max-width: 200px;
    height: 32px;
    object-fit: contain;
    display: block;
    opacity: 0.88;
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
