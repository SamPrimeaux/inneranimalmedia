import { useState, useEffect } from "react";
import { AGENT_SETTINGS_TABS, SETTINGS_TAB_IDS, readStoredSettingsTab, writeStoredSettingsTab } from "./constants";
import { relativeTime } from "./utils";
import { GeneralTab } from "./GeneralTab";
import { EnvironmentTab } from "./EnvironmentTab";
import { DeployBetaTab } from "./DeployTab";
import { IntegrationsTab, ProvidersTab } from "./IntegrationsTab";
import { SpendTab } from "./SpendTab";
import { HooksTab } from "./HooksTab";
import { CmdAllowlistTab, McpToolsTab, RoutingRulesTab } from "./PolicyTabs";
import { IndexingDocsTab } from "./IndexingDocsTab";
import { RulesSkillsSubagentsTab } from "./RulesSkillsTab";
import { NetworkSettingsTab } from "./NetworkTab";
import { ModelsSettingsTab } from "./ModelsTab";
import { AgentsTab } from "./AgentsTab";
import { TabSettingsTab } from "./TabSettingsTab";
import { DocsTab } from "./DocsTab";
import { ToolsMcpTab } from "./ToolsMcpTab";
import { MarketplaceSettingsTab } from "./MarketplaceTab";

// ── Inlined trivial compositions ────────────────────────────

function GeneralWithEnvironment({ runCommandRunnerRef }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <GeneralTab />
      <div style={{ borderTop: "1px solid var(--border)", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <EnvironmentTab runCommandRunnerRef={runCommandRunnerRef} />
      </div>
    </div>
  );
}

function PluginsCombinedTab({ connectedIntegrations }) {
  return (
    <div style={{ flex: 1, overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
      <IntegrationsTab connectedIntegrations={connectedIntegrations} />
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <ProvidersTab />
      </div>
    </div>
  );
}

// ── Cloud Agents (small enough to inline in root) ────────────

function CloudAgentsSettingsTab() {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/mcp/agents", { credentials: "same-origin" })
      .then(async (r) => {
        if (r.status === 404) return [];
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d?.error || "Failed to load remote agents");
        return Array.isArray(d.agents) ? d.agents : [];
      })
      .then((rows) => { if (!cancelled) setAgents(rows); })
      .catch((e) => {
        if (!cancelled) { setError(e?.message || String(e)); setAgents([]); }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <div style={{ padding: 16, overflowY: "auto", flex: 1 }}>
      {loading ? (
        <div style={{ fontSize: 11, color: "var(--text-muted)", padding: 20, textAlign: "center" }}>Loading…</div>
      ) : error ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <div style={{ marginBottom: 10 }}>{error}</div>
          <a href="/dashboard/mcp" style={{ color: "var(--accent)", textDecoration: "none" }}>Open MCP dashboard</a>
        </div>
      ) : agents.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.6 }}>
          <div style={{ marginBottom: 10 }}>No remote agents connected. Configure agents via the MCP dashboard.</div>
          <a href="/dashboard/mcp" style={{ color: "var(--accent)", textDecoration: "none" }}>Open MCP dashboard</a>
        </div>
      ) : (
        agents.map((a) => (
          <div
            key={a.id || a.name}
            style={{ padding: 12, marginBottom: 8, borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg-canvas)" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>{a.name || a.id}</div>
              <span style={{
                fontSize: 9, padding: "2px 8px", borderRadius: 10,
                border: "1px solid var(--border)", color: "var(--text-secondary)",
              }}>{a.status || "unknown"}</span>
            </div>
            {a.updated_at || a.last_seen ? (
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 6 }}>
                {relativeTime(a.last_seen || a.updated_at) || "—"}
              </div>
            ) : null}
          </div>
        ))
      )}
    </div>
  );
}

// ── Root ─────────────────────────────────────────────────────

interface SettingsPanelProps {
  runCommandRunnerRef?: React.RefObject<any>;
  connectedIntegrations?: Record<string, boolean>;
  onOpenInBrowser?: () => void;
  onDeployStart?: (workerName: string) => any;
  onDeployComplete?: (pillId: any, success: boolean, versionId?: string, duration?: number) => void;
}

export default function SettingsPanel({
  runCommandRunnerRef,
  connectedIntegrations,
  onOpenInBrowser,
  onDeployStart,
  onDeployComplete,
}: SettingsPanelProps) {
  const [tab, setTab] = useState(readStoredSettingsTab);

  const pickTab = (id: string) => {
    setTab(id);
    writeStoredSettingsTab(id);
  };

  useEffect(() => {
    const onGo = (e: CustomEvent) => {
      const id = e?.detail?.tab;
      if (id && SETTINGS_TAB_IDS.has(id)) {
        setTab(id);
        writeStoredSettingsTab(id);
      }
    };
    window.addEventListener("iam-settings-goto-tab", onGo as EventListener);
    return () => window.removeEventListener("iam-settings-goto-tab", onGo as EventListener);
  }, []);

  const tabContent: Record<string, React.ReactNode> = {
    general:       <GeneralWithEnvironment runCommandRunnerRef={runCommandRunnerRef} />,
    plan_usage:    <SpendTab />,
    agents:        <AgentsTab />,
    tab:           <TabSettingsTab />,
    models:        <ModelsSettingsTab />,
    cloud_agents:  <CloudAgentsSettingsTab />,
    plugins:       <PluginsCombinedTab connectedIntegrations={connectedIntegrations} />,
    rules_skills:  <RulesSkillsSubagentsTab />,
    tools_mcp:     <ToolsMcpTab />,
    hooks:         <HooksTab />,
    cmd_allowlist: <CmdAllowlistTab />,
    mcp_tools:     <McpToolsTab />,
    routing_rules: <RoutingRulesTab />,
    indexing_docs: <IndexingDocsTab />,
    network:       <NetworkSettingsTab onOpenGeneral={() => pickTab("general")} />,
    beta: (
      <DeployBetaTab
        runCommandRunnerRef={runCommandRunnerRef}
        onDeployStart={onDeployStart}
        onDeployComplete={onDeployComplete}
      />
    ),
    marketplace:   <MarketplaceSettingsTab onOpenGeneral={() => pickTab("general")} />,
    docs:          <DocsTab />,
    provider_docs: <DocsTab />,
  };

  const activeContent = tabContent[tab] || tabContent.general;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {activeContent}
      </div>

      <div style={{
        width: "min(220px, 42%)", flexShrink: 0,
        background: "var(--bg-canvas)", borderLeft: "1px solid var(--border)",
        overflowY: "auto", padding: "8px 0",
      }}>
        {AGENT_SETTINGS_TABS.map((item) => (
          <div key={item.id}>
            {item.sectionBreak ? (
              <div style={{ borderTop: "1px solid var(--border)", margin: "10px 8px 6px" }} />
            ) : null}
            <button
              type="button"
              onClick={() => pickTab(item.id)}
              style={{
                display: "block", width: "100%", textAlign: "left",
                background: tab === item.id ? "var(--bg-elevated)" : "none",
                border: "none",
                borderRight: tab === item.id ? "2px solid var(--accent)" : "2px solid transparent",
                color: tab === item.id ? "var(--text-primary)" : "var(--text-secondary)",
                padding: "7px 14px 7px 10px", cursor: "pointer",
                fontFamily: "inherit", fontSize: 12, lineHeight: 1.35,
                transition: "all 120ms",
              }}
              onMouseEnter={(e) => {
                if (tab !== item.id) {
                  e.currentTarget.style.background = "var(--bg-elevated)";
                  e.currentTarget.style.color = "var(--text-primary)";
                }
              }}
              onMouseLeave={(e) => {
                if (tab !== item.id) {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "var(--text-secondary)";
                }
              }}
            >
              {item.label}
            </button>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes spPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
