// ─── Storage keys ─────────────────────────────────────────────────────────────

export const SETTINGS_TAB_STORAGE_KEY = "iam-settings-tab";
export const TAB_COMPOSER_PREFS_KEY   = "iam_tab_composer_prefs";

// ─── AgentSam workspace ───────────────────────────────────────────────────────

/** Default workspace id for scoped API calls. Empty = global user scope. */
export const AGENTSAM_WORKSPACE_QUERY = "";

// ─── Tab definitions ──────────────────────────────────────────────────────────

export const AGENT_SETTINGS_TABS = [
  { id: "general",       label: "General"                   },
  { id: "plan_usage",    label: "Plan & Usage"              },
  { id: "agents",        label: "Agents"                    },
  { id: "tab",           label: "Tab"                       },
  { id: "models",        label: "Models"                    },
  { id: "cloud_agents",  label: "Cloud Agents"              },
  { id: "plugins",       label: "Integrations", sectionBreak: true },
  { id: "rules_skills",  label: "Rules, Skills & Subagents" },
  { id: "tools_mcp",     label: "Tools & MCP"               },
  { id: "hooks",         label: "Hooks",        sectionBreak: true },
  { id: "cmd_allowlist", label: "Cmd Allowlist"             },
  { id: "mcp_tools",     label: "MCP Tools"                 },
  { id: "routing_rules", label: "Routing Rules"             },
  { id: "indexing_docs", label: "Indexing & Docs"           },
  { id: "network",       label: "Network"                   },
  { id: "beta",          label: "Development"               },
  { id: "marketplace",   label: "Marketplace"               },
  { id: "docs",          label: "Repositories"              },
  { id: "provider_docs", label: "Docs"                      },
] as const;

export type SettingsTabId = typeof AGENT_SETTINGS_TABS[number]["id"];

export const SETTINGS_TAB_IDS = new Set<string>(AGENT_SETTINGS_TABS.map((t) => t.id));

// ─── Domain constants ─────────────────────────────────────────────────────────

export const HOOK_TRIGGERS = [
  "start", "stop", "pre_deploy", "post_deploy", "pre_commit", "error",
] as const;

export const ROUTING_MATCH_TYPES = [
  "intent", "mode", "keyword", "tag", "model",
] as const;

export const WORKSPACE_ENFORCEMENT = [
  { name: "No auto-deploy",         desc: "Agent must ask Sam for confirmation before any wrangler deploy" },
  { name: "No secret deletion",     desc: "Agent cannot delete secrets — only Sam via Settings UI" },
  { name: "No naked wrangler",      desc: "All wrangler commands must include --config wrangler.production.toml" },
  { name: "Exposed key detection",  desc: "If a secret pattern appears in chat, warning banner and Roll button" },
  { name: "Remote-only R2 ops",     desc: "All R2 reads and writes use --remote flag. No local file paths." },
  { name: "Verify before claim",    desc: "Agent must show raw output proof before reporting success" },
  { name: "No wasted loops",        desc: "If a command fails twice — stop, report exact error, do not retry" },
  { name: "Workspace lock",         desc: "Before any wrangler command: show current dir, git branch, confirm" },
  { name: "D1 verify post-deploy",  desc: "SELECT from deployments after every deploy to confirm version ID" },
] as const;

// ─── Tab composer prefs (localStorage) ───────────────────────────────────────

export interface TabComposerPrefs {
  partialAccepts: boolean;
  suggestionsInComments: boolean;
  whitespaceOnlySuggestions: boolean;
  tsAutoImport: boolean;
}

const TAB_COMPOSER_DEFAULTS: TabComposerPrefs = {
  partialAccepts: true,
  suggestionsInComments: true,
  whitespaceOnlySuggestions: true,
  tsAutoImport: true,
};

export function readTabComposerPrefs(): TabComposerPrefs {
  try {
    const s = localStorage.getItem(TAB_COMPOSER_PREFS_KEY);
    if (s) {
      const p = JSON.parse(s);
      return {
        partialAccepts:            typeof p.partialAccepts === "boolean"            ? p.partialAccepts            : true,
        suggestionsInComments:     typeof p.suggestionsInComments === "boolean"     ? p.suggestionsInComments     : true,
        whitespaceOnlySuggestions: typeof p.whitespaceOnlySuggestions === "boolean" ? p.whitespaceOnlySuggestions : true,
        tsAutoImport:              typeof p.tsAutoImport === "boolean"              ? p.tsAutoImport              : true,
      };
    }
  } catch (_) {}
  return { ...TAB_COMPOSER_DEFAULTS };
}

export function writeTabComposerPrefs(prefs: TabComposerPrefs): void {
  try {
    localStorage.setItem(TAB_COMPOSER_PREFS_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

// ─── Settings tab persistence ─────────────────────────────────────────────────

export function readStoredSettingsTab(): string {
  try {
    const s = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
    // Migration: old "ignore_patterns" tab was merged into "indexing_docs"
    if (s === "ignore_patterns") return "indexing_docs";
    if (s && SETTINGS_TAB_IDS.has(s)) return s;
  } catch (_) {}
  return "general";
}

export function writeStoredSettingsTab(id: string): void {
  try {
    localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, id);
  } catch (_) {}
}
