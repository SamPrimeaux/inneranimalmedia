import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RulesSkillsTabId, ModelsTabId } from './useSettingsSections';
import type {
  AgentsamUserPolicy,
  AgentsSettingsResponse,
  LlmVaultRow,
  SettingsModelsResponse,
  SettingsMcpResponse,
  GitRepo,
} from '../types';

const defaultAgentsPolicy: AgentsamUserPolicy = {
  auto_run_mode: 'allowlist',
  browser_protection: 0,
  mcp_tools_protection: 1,
  file_deletion_protection: 1,
  external_file_protection: 1,
  default_agent_location: 'pane',
  text_size: 'default',
  auto_clear_chat: 0,
  submit_with_mod_enter: 0,
  max_tab_count: 5,
  queue_messages_mode: 'after_current',
  usage_summary_mode: 'auto',
  agent_autocomplete: 1,
  web_search_enabled: 1,
  auto_accept_web_search: 0,
  web_fetch_enabled: 1,
  hierarchical_ignore: 0,
  ignore_symlinks: 0,
  inline_diffs: 1,
  jump_next_diff_on_accept: 1,
  auto_format_on_agent_finish: 0,
  legacy_terminal_tool: 1,
  toolbar_on_selection: 1,
  auto_parse_links: 0,
  themed_diff_backgrounds: 1,
  terminal_hint: 1,
  terminal_preview_box: 1,
  collapse_auto_run_commands: 1,
  voice_submit_keyword: 'submit',
  commit_attribution: 1,
  pr_attribution: 1,
  settings_json: null,
};

export type UseSettingsDataArgs = {
  workspaceId?: string | null;
  activeSection: string;
  rulesSkillsTab: RulesSkillsTabId;
  modelsTab: ModelsTabId;
};

export function useSettingsData({
  workspaceId,
  activeSection,
  rulesSkillsTab,
  modelsTab: _modelsTab,
}: UseSettingsDataArgs) {
  void _modelsTab;
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePlan, setProfilePlan] = useState<string | null>(null);
  const [workerBaseUrl, setWorkerBaseUrl] = useState('');

  const [settingsModels, setSettingsModels] = useState<SettingsModelsResponse | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [mcpToggleError, setMcpToggleError] = useState<Record<string, string | null>>({});

  const [skillsLoading, setSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [skills, setSkills] = useState<any[]>([]);
  const [skillDrawerOpen, setSkillDrawerOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<any | null>(null);
  const [skillDraft, setSkillDraft] = useState<any>({});

  const [subagentsLoading, setSubagentsLoading] = useState(false);
  const [subagentsError, setSubagentsError] = useState<string | null>(null);
  const [subagents, setSubagents] = useState<any[]>([]);
  const [subagentDrawerOpen, setSubagentDrawerOpen] = useState(false);
  const [subagentDraft, setSubagentDraft] = useState<any>({});

  const [commandsLoading2, setCommandsLoading2] = useState(false);
  const [commandsError2, setCommandsError2] = useState<string | null>(null);
  const [commands2, setCommands2] = useState<any[]>([]);
  const [expandedCommandId, setExpandedCommandId] = useState<string | null>(null);

  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rules, setRules] = useState<any[]>([]);
  const [ruleDrawerOpen, setRuleDrawerOpen] = useState(false);
  const [ruleDraft, setRuleDraft] = useState<any>({});

  const [workspaceLoading2, setWorkspaceLoading2] = useState(false);
  const [workspaceError2, setWorkspaceError2] = useState<string | null>(null);
  const [workspaceData, setWorkspaceData] = useState<any | null>(null);

  const [hooksLoading2, setHooksLoading2] = useState(false);
  const [hooksError2, setHooksError2] = useState<string | null>(null);
  const [hooksData, setHooksData] = useState<{ hooks: any[]; executions: any[] } | null>(null);
  const [newHookOpen, setNewHookOpen] = useState(false);
  const [newHookDraft, setNewHookDraft] = useState({
    trigger: 'pre_tool_call',
    command: '',
    provider: 'system',
  });

  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [findings, setFindings] = useState<any[]>([]);

  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);
  const [usagePage, setUsagePage] = useState(1);
  const [usageProvider, setUsageProvider] = useState('');
  const [usageModel, setUsageModel] = useState('');
  const [usageData, setUsageData] = useState<any | null>(null);

  const [billingPlans, setBillingPlans] = useState<any[]>([]);
  const [billingCoupons, setBillingCoupons] = useState<any[]>([]);
  const [billingPlansLoading, setBillingPlansLoading] = useState(false);
  const [billingPlansError, setBillingPlansError] = useState<string | null>(null);
  const [activeSubscription, setActiveSubscription] = useState<any | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(false);
  const [billingInvoices, setBillingInvoices] = useState<any[]>([]);
  const [billingInvoicesLoading, setBillingInvoicesLoading] = useState(false);
  const [billingInvoicesError, setBillingInvoicesError] = useState<string | null>(null);

  const [notifyLoading, setNotifyLoading] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const [notifyPrefs, setNotifyPrefs] = useState<Record<string, string>>({});
  const [notifyWebhookUrl, setNotifyWebhookUrl] = useState('');

  const [budgetMonthlyLimit, setBudgetMonthlyLimit] = useState<string>('');
  const [budgetHardStop, setBudgetHardStop] = useState(false);

  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsSaving, setAgentsSaving] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [agentsWorkspaceId, setAgentsWorkspaceId] = useState<string>('');
  const [agentsPolicy, setAgentsPolicy] = useState<AgentsamUserPolicy | null>(null);
  const [agentsCommands, setAgentsCommands] = useState<string[]>([]);
  const [agentsDomains, setAgentsDomains] = useState<string[]>([]);
  const [agentsMcp, setAgentsMcp] = useState<Array<{ tool_key: string; notes?: string | null }>>([]);

  const [newCommand, setNewCommand] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newToolKey, setNewToolKey] = useState('');

  const [settingsMcp, setSettingsMcp] = useState<SettingsMcpResponse | null>(null);

  const [repos, setRepos] = useState<GitRepo[]>([]);

  const [llmKeys, setLlmKeys] = useState<LlmVaultRow[]>([]);
  const [llmBusy, setLlmBusy] = useState<string | null>(null);
  const [vaultProvider, setVaultProvider] = useState<
    'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY'
  >('OPENAI_API_KEY');
  const [vaultKeyValue, setVaultKeyValue] = useState('');

  const tierPatchTimers = useRef<Record<string, number>>({});

  const patchProfile = useCallback(
    async (updates: Array<{ setting_key: string; setting_value: string }>) => {
      const r = await fetch('/api/settings/profile', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok)
        throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
      return j;
    },
    [],
  );

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true);
    setSkillsError(null);
    try {
      const r = await fetch('/api/settings/skills', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setSkills(Array.isArray(j.skills) ? j.skills : []);
    } catch (e) {
      setSkillsError(e instanceof Error ? e.message : 'Failed to load skills');
      setSkills([]);
    } finally {
      setSkillsLoading(false);
    }
  }, []);

  const loadSubagents = useCallback(async () => {
    setSubagentsLoading(true);
    setSubagentsError(null);
    try {
      const r = await fetch('/api/settings/subagents', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setSubagents(Array.isArray(j.subagents) ? j.subagents : []);
    } catch (e) {
      setSubagentsError(e instanceof Error ? e.message : 'Failed to load subagents');
      setSubagents([]);
    } finally {
      setSubagentsLoading(false);
    }
  }, []);

  const loadCommands2 = useCallback(async () => {
    setCommandsLoading2(true);
    setCommandsError2(null);
    try {
      const r = await fetch('/api/settings/commands', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setCommands2(Array.isArray(j.commands) ? j.commands : []);
    } catch (e) {
      setCommandsError2(e instanceof Error ? e.message : 'Failed to load commands');
      setCommands2([]);
    } finally {
      setCommandsLoading2(false);
    }
  }, []);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    setRulesError(null);
    try {
      const r = await fetch('/api/settings/rules', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setRules(Array.isArray(j.rules) ? j.rules : []);
    } catch (e) {
      setRulesError(e instanceof Error ? e.message : 'Failed to load rules');
      setRules([]);
    } finally {
      setRulesLoading(false);
    }
  }, []);

  const loadWorkspace = useCallback(async () => {
    setWorkspaceLoading2(true);
    setWorkspaceError2(null);
    try {
      const r = await fetch('/api/settings/workspace', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setWorkspaceData(j);
    } catch (e) {
      setWorkspaceError2(e instanceof Error ? e.message : 'Failed to load workspace');
      setWorkspaceData(null);
    } finally {
      setWorkspaceLoading2(false);
    }
  }, []);

  const loadHooks = useCallback(async () => {
    setHooksLoading2(true);
    setHooksError2(null);
    try {
      const r = await fetch('/api/settings/hooks', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setHooksData({
        hooks: Array.isArray(j.hooks) ? j.hooks : [],
        executions: Array.isArray(j.executions) ? j.executions : [],
      });
    } catch (e) {
      setHooksError2(e instanceof Error ? e.message : 'Failed to load hooks');
      setHooksData({ hooks: [], executions: [] });
    } finally {
      setHooksLoading2(false);
    }
  }, []);

  const loadSecurity = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const [sessR, findR] = await Promise.all([
        fetch('/api/settings/security/sessions', { credentials: 'same-origin' }),
        fetch('/api/settings/security/findings', { credentials: 'same-origin' }),
      ]);
      const sessJ = await sessR.json().catch(() => ({}));
      const findJ = await findR.json().catch(() => ({}));
      if (!sessR.ok)
        throw new Error(typeof sessJ.error === 'string' ? sessJ.error : `Load failed (${sessR.status})`);
      setSessions(Array.isArray(sessJ.sessions) ? sessJ.sessions : []);
      setFindings(Array.isArray(findJ.findings) ? findJ.findings : []);
    } catch (e) {
      setSessionsError(e instanceof Error ? e.message : 'Failed to load security');
      setSessions([]);
      setFindings([]);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  const loadUsage = useCallback(async (page: number, provider: string, model: string) => {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const qp = new URLSearchParams({ page: String(page || 1) });
      if (provider) qp.set('provider', provider);
      if (model) qp.set('model', model);
      const r = await fetch(`/api/settings/usage?${qp.toString()}`, { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setUsageData(j);
    } catch (e) {
      setUsageError(e instanceof Error ? e.message : 'Failed to load usage');
      setUsageData(null);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const loadBillingPlans = useCallback(async () => {
    setBillingPlansLoading(true);
    setBillingPlansError(null);
    try {
      const r = await fetch('/api/billing/plans', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setBillingPlans(Array.isArray(j.plans) ? j.plans : []);
      setBillingCoupons(Array.isArray(j.coupons) ? j.coupons : []);
    } catch (e) {
      setBillingPlansError(e instanceof Error ? e.message : 'Failed to load plans');
      setBillingPlans([]);
      setBillingCoupons([]);
    } finally {
      setBillingPlansLoading(false);
    }
  }, []);

  const loadBillingSubscription = useCallback(async () => {
    setSubscriptionLoading(true);
    try {
      const r = await fetch('/api/billing/subscription', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (r.status === 404) {
        setActiveSubscription(null);
        return;
      }
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setActiveSubscription(j.subscription ?? null);
    } catch {
      setActiveSubscription(null);
    } finally {
      setSubscriptionLoading(false);
    }
  }, []);

  const loadBillingInvoices = useCallback(async () => {
    setBillingInvoicesLoading(true);
    setBillingInvoicesError(null);
    try {
      const r = await fetch('/api/billing/invoices', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      setBillingInvoices(Array.isArray(j.invoices) ? j.invoices : []);
    } catch (e) {
      setBillingInvoicesError(e instanceof Error ? e.message : 'Failed to load invoices');
      setBillingInvoices([]);
    } finally {
      setBillingInvoicesLoading(false);
    }
  }, []);

  const startCheckout = useCallback(async (planId: string, billingPeriod?: string) => {
    setUsageError(null);
    try {
      const r = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_id: planId, billing_period: billingPeriod || 'monthly' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Checkout failed (${r.status})`);
      const checkoutUrl = typeof j.checkout_url === 'string' ? j.checkout_url : '';
      if (checkoutUrl) window.location.href = checkoutUrl;
    } catch (e) {
      setUsageError(e instanceof Error ? e.message : 'Checkout failed');
    }
  }, []);

  const openBillingPortal = useCallback(async () => {
    setUsageError(null);
    try {
      const r = await fetch('/api/billing/portal', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Portal failed (${r.status})`);
      const portalUrl = typeof j.portal_url === 'string' ? j.portal_url : '';
      if (portalUrl) window.location.href = portalUrl;
    } catch (e) {
      setUsageError(e instanceof Error ? e.message : 'Portal failed');
    }
  }, []);

  const loadNotifications = useCallback(async () => {
    setNotifyLoading(true);
    setNotifyError(null);
    try {
      const r = await fetch('/api/settings/profile', { credentials: 'same-origin' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Load failed (${r.status})`);
      const flat =
        j && typeof j === 'object' && (j as any).flat && typeof (j as any).flat === 'object'
          ? (j as any).flat
          : {};
      const settings =
        j && typeof j === 'object' && (j as any).settings && typeof (j as any).settings === 'object'
          ? (j as any).settings
          : {};
      const merged: Record<string, string> = { ...settings, ...flat };
      setNotifyPrefs(merged);
      setNotifyWebhookUrl(String(merged['notify.webhook_url'] || ''));
      setBudgetMonthlyLimit(String(merged['budget.monthly_limit_usd'] || ''));
      setBudgetHardStop(String(merged['budget.hard_stop'] || 'false') === 'true');
    } catch (e) {
      setNotifyError(e instanceof Error ? e.message : 'Failed to load notifications');
      setNotifyPrefs({});
    } finally {
      setNotifyLoading(false);
    }
  }, []);

  const loadAgentsSettings = useCallback(async (wsId: string | null | undefined) => {
    setAgentsLoading(true);
    setAgentsError(null);
    try {
      const qp = wsId && wsId.trim() ? `?workspace_id=${encodeURIComponent(wsId.trim())}` : '';
      const r = await fetch(`/api/settings/agents${qp}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      const d = (await r.json()) as AgentsSettingsResponse;
      setAgentsWorkspaceId(String(d.workspace_id || wsId || '').trim());
      setAgentsPolicy(
        d.policy && typeof d.policy === 'object'
          ? { ...defaultAgentsPolicy, ...d.policy }
          : { ...defaultAgentsPolicy },
      );
      setAgentsCommands(Array.isArray(d.allowlists?.commands) ? d.allowlists.commands : []);
      setAgentsDomains(Array.isArray(d.allowlists?.domains) ? d.allowlists.domains : []);
      setAgentsMcp(Array.isArray(d.allowlists?.mcp) ? d.allowlists.mcp : []);
    } catch (e) {
      setAgentsError(e instanceof Error ? e.message : 'Failed to load Agents settings');
      setAgentsPolicy({ ...defaultAgentsPolicy });
      setAgentsCommands([]);
      setAgentsDomains([]);
      setAgentsMcp([]);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  const refreshLlmKeys = useCallback(() => {
    fetch('/api/vault/llm-keys', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d: { keys?: LlmVaultRow[] }) => setLlmKeys(Array.isArray(d.keys) ? d.keys : []))
      .catch(() => setLlmKeys([]));
  }, []);

  const loadModelsSettings = useCallback(async (wsId: string | null | undefined) => {
    setModelsLoading(true);
    setModelsError(null);
    try {
      const qp = wsId && wsId.trim() ? `?workspace_id=${encodeURIComponent(wsId.trim())}` : '';
      const r = await fetch(`/api/settings/models${qp}`, { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      const d = (await r.json()) as SettingsModelsResponse;
      setSettingsModels(d && typeof d === 'object' ? d : null);
    } catch (e) {
      setSettingsModels(null);
      setModelsError(e instanceof Error ? e.message : 'Failed to load models');
    } finally {
      setModelsLoading(false);
    }
  }, []);

  const modelOptions = useMemo(() => {
    const rows = settingsModels?.models || [];
    return rows.map((m) => ({ id: String(m.id), name: String(m.name || m.id) }));
  }, [settingsModels?.models]);

  const patchTierDebounced = useCallback((tierId: string, patch: Record<string, unknown>) => {
    if (!tierId) return;
    const prev = tierPatchTimers.current[tierId];
    if (prev) window.clearTimeout(prev);
    tierPatchTimers.current[tierId] = window.setTimeout(() => {
      void (async () => {
        try {
          await fetch(`/api/settings/models/tiers/${encodeURIComponent(tierId)}`, {
            method: 'PATCH',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
        } catch {
          /* reload on tab change */
        }
      })();
    }, 400);
  }, []);

  const toggleModelField = useCallback(
    async (modelId: string, field: 'is_active' | 'show_in_picker', value: boolean) => {
      if (!settingsModels) return;
      const prev = settingsModels;
      setSettingsModels({
        ...prev,
        models: prev.models.map((m) => (m.id === modelId ? { ...m, [field]: value ? 1 : 0 } : m)),
      });
      try {
        const r = await fetch(`/api/settings/models/${encodeURIComponent(modelId)}/toggle`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value ? 1 : 0 }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
      } catch (e) {
        setSettingsModels(prev);
        setModelsError(e instanceof Error ? e.message : 'Save failed');
      }
    },
    [settingsModels],
  );

  const loadMcpSettings = useCallback(async () => {
    try {
      const r = await fetch('/api/settings/mcp', { credentials: 'same-origin' });
      if (!r.ok) throw new Error(await r.text());
      const d = (await r.json()) as SettingsMcpResponse;
      setSettingsMcp(d && typeof d === 'object' ? d : null);
    } catch {
      setSettingsMcp(null);
    }
  }, []);

  const removeLlmKey = async (id: string) => {
    setLlmBusy(id);
    try {
      await fetch(`/api/vault/llm-keys/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      refreshLlmKeys();
    } catch {
      /* ignore */
    } finally {
      setLlmBusy(null);
    }
  };

  const saveVaultKeyFromSecurity = async () => {
    const value = vaultKeyValue.trim();
    if (!value) return;
    setLlmBusy(vaultProvider);
    try {
      const r = await fetch('/api/vault/store', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key_name: vaultProvider, value }),
      });
      if (r.ok) {
        setVaultKeyValue('');
        refreshLlmKeys();
      }
    } catch {
      /* ignore */
    } finally {
      setLlmBusy(null);
    }
  };

  const patchSkillActive = useCallback(
    async (skillId: string, v: boolean, prev: any[]) => {
      try {
        await fetch(`/api/settings/skills/${encodeURIComponent(String(skillId))}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: v ? 1 : 0 }),
        });
      } catch {
        setSkills(prev);
      }
    },
    [],
  );

  const patchSubagentActive = useCallback(
    async (id: string, v: boolean, prev: any[]) => {
      try {
        await fetch(`/api/settings/subagents/${encodeURIComponent(String(id))}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: v ? 1 : 0 }),
        });
      } catch {
        setSubagents(prev);
      }
    },
    [],
  );

  const patchCommandActive = useCallback(
    async (id: string, v: boolean, prev: any[]) => {
      try {
        await fetch(`/api/settings/commands/${encodeURIComponent(id)}/toggle`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: v ? 1 : 0 }),
        });
      } catch {
        setCommands2(prev);
      }
    },
    [],
  );

  const patchRuleActive = useCallback(
    async (id: string, v: boolean, prev: any[]) => {
      try {
        await fetch(`/api/settings/rules/${encodeURIComponent(String(id))}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: v ? 1 : 0 }),
        });
      } catch {
        setRules(prev);
      }
    },
    [],
  );

  const saveSkillDrawer = useCallback(async () => {
    try {
      const payload = {
        name: String(skillDraft.name || '').trim(),
        description: skillDraft.description || '',
        content_markdown: skillDraft.content_markdown || '',
        slash_trigger: skillDraft.slash_trigger || '',
        globs: skillDraft.globs || '',
        always_apply: skillDraft.always_apply ? 1 : 0,
        tags: skillDraft.tags || '',
      };
      if (!payload.name) throw new Error('Name required');
      if (editingSkill?.id) {
        const r = await fetch(`/api/settings/skills/${encodeURIComponent(String(editingSkill.id))}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
      } else {
        const r = await fetch('/api/settings/skills', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
      }
      setSkillDrawerOpen(false);
      await loadSkills();
    } catch (e) {
      setSkillsError(e instanceof Error ? e.message : 'Save failed');
    }
  }, [editingSkill?.id, skillDraft, loadSkills]);

  const saveSubagentDrawer = useCallback(async () => {
    try {
      const id = String(subagentDraft.id || '');
      if (!id) throw new Error('Missing subagent id');
      const payload = {
        display_name: subagentDraft.display_name || '',
        description: subagentDraft.description || '',
        instructions_markdown: subagentDraft.instructions_markdown || '',
        default_model_id: subagentDraft.default_model_id || null,
        personality_tone: subagentDraft.personality_tone || 'professional',
        sandbox_mode: subagentDraft.sandbox_mode || 'workspace-read',
        model_reasoning_effort: subagentDraft.model_reasoning_effort || 'medium',
      };
      const r = await fetch(`/api/settings/subagents/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
      setSubagentDrawerOpen(false);
      await loadSubagents();
    } catch (e) {
      setSubagentsError(e instanceof Error ? e.message : 'Save failed');
    }
  }, [subagentDraft, loadSubagents]);

  const saveAgentsPolicy = useCallback(async () => {
    if (!agentsPolicy) return;
    setAgentsSaving(true);
    setAgentsError(null);
    try {
      const r = await fetch('/api/settings/agents/policy', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: agentsWorkspaceId || (workspaceId || ''),
          policy: agentsPolicy,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const d = await r.json().catch(() => null);
      const fresh = d?.policy && typeof d.policy === 'object' ? d.policy : null;
      if (fresh) setAgentsPolicy({ ...defaultAgentsPolicy, ...fresh });
    } catch (e) {
      setAgentsError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setAgentsSaving(false);
    }
  }, [agentsPolicy, agentsWorkspaceId, workspaceId]);

  const addAgentsCommand = useCallback(async () => {
    const v = newCommand.trim();
    if (!v) return;
    try {
      setAgentsError(null);
      const r = await fetch('/api/settings/agents/commands', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: agentsWorkspaceId || (workspaceId || ''), command: v }),
      });
      if (!r.ok) throw new Error(await r.text());
      setAgentsCommands((p) => Array.from(new Set([...p, v])).sort());
      setNewCommand('');
    } catch (e) {
      setAgentsError(e instanceof Error ? e.message : 'Failed to add command');
    }
  }, [newCommand, agentsWorkspaceId, workspaceId]);

  const removeAgentsCommand = useCallback(
    async (c: string) => {
      try {
        setAgentsError(null);
        const r = await fetch(`/api/settings/agents/commands/${encodeURIComponent(c)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!r.ok) throw new Error(await r.text());
        setAgentsCommands((p) => p.filter((x) => x !== c));
      } catch (e) {
        setAgentsError(e instanceof Error ? e.message : 'Failed to remove command');
      }
    },
    [],
  );

  const addAgentsDomain = useCallback(async () => {
    const v = newDomain.trim();
    if (!v) return;
    try {
      setAgentsError(null);
      const r = await fetch('/api/settings/agents/domains', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: agentsWorkspaceId || (workspaceId || ''), host: v }),
      });
      if (!r.ok) throw new Error(await r.text());
      setAgentsDomains((p) => Array.from(new Set([...p, v])).sort());
      setNewDomain('');
    } catch (e) {
      setAgentsError(e instanceof Error ? e.message : 'Failed to add domain');
    }
  }, [newDomain, agentsWorkspaceId, workspaceId]);

  const removeAgentsDomain = useCallback(
    async (h: string) => {
      try {
        setAgentsError(null);
        const r = await fetch(`/api/settings/agents/domains/${encodeURIComponent(h)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!r.ok) throw new Error(await r.text());
        setAgentsDomains((p) => p.filter((x) => x !== h));
      } catch (e) {
        setAgentsError(e instanceof Error ? e.message : 'Failed to remove domain');
      }
    },
    [],
  );

  const addAgentsMcp = useCallback(async () => {
    const tool_key = newToolKey.trim();
    if (!tool_key) return;
    try {
      setAgentsError(null);
      const r = await fetch('/api/settings/agents/mcp', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: agentsWorkspaceId || (workspaceId || ''),
          tool_key,
          notes: '',
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      setAgentsMcp((p) => [...p, { tool_key, notes: '' }].sort((a, b) => a.tool_key.localeCompare(b.tool_key)));
      setNewToolKey('');
    } catch (e) {
      setAgentsError(e instanceof Error ? e.message : 'Failed to add MCP tool');
    }
  }, [newToolKey, agentsWorkspaceId, workspaceId]);

  const removeAgentsMcp = useCallback(
    async (tool_key: string) => {
      try {
        setAgentsError(null);
        const r = await fetch(`/api/settings/agents/mcp/${encodeURIComponent(tool_key)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!r.ok) throw new Error(await r.text());
        setAgentsMcp((p) => p.filter((t) => t.tool_key !== tool_key));
      } catch (e) {
        setAgentsError(e instanceof Error ? e.message : 'Failed to remove MCP tool');
      }
    },
    [],
  );

  const toggleMcpRegisteredTool = useCallback(
    async (id: string, v: boolean, prevEnabled: boolean) => {
      setMcpToggleError((p) => ({ ...p, [id]: null }));
      setSettingsMcp((p) =>
        p
          ? {
              ...p,
              tools: (p.tools || []).map((x: any) =>
                String(x?.id) === id ? { ...x, enabled: v ? 1 : 0 } : x,
              ),
            }
          : p,
      );
      try {
        const r = await fetch(`/api/settings/mcp/tools/${encodeURIComponent(id)}/toggle`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: v ? 1 : 0 }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
      } catch (e) {
        setSettingsMcp((p) =>
          p
            ? {
                ...p,
                tools: (p.tools || []).map((x: any) =>
                  String(x?.id) === id ? { ...x, enabled: prevEnabled ? 1 : 0 } : x,
                ),
              }
            : p,
        );
        setMcpToggleError((p) => ({
          ...p,
          [id]: e instanceof Error ? e.message : 'Save failed',
        }));
      }
    },
    [],
  );

  const postWorkspaceReindex = useCallback(async () => {
    try {
      await fetch('/api/settings/workspace/reindex', { method: 'POST', credentials: 'same-origin' });
    } finally {
      void loadWorkspace();
    }
  }, [loadWorkspace]);

  const patchHookActive = useCallback(
    async (hookId: string, v: boolean, prev: { hooks: any[]; executions: any[] } | null) => {
      setHooksData((p) =>
        p
          ? {
              ...p,
              hooks: p.hooks.map((x) =>
                String(x.id) === String(hookId) ? { ...x, is_active: v ? 1 : 0 } : x,
              ),
            }
          : p,
      );
      try {
        await fetch(`/api/settings/hooks/${encodeURIComponent(String(hookId))}`, {
          method: 'PATCH',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: v ? 1 : 0 }),
        });
      } catch {
        setHooksData(prev);
      }
    },
    [],
  );

  const deleteHook = useCallback(async (hookId: string, prev: { hooks: any[]; executions: any[] } | null) => {
    setHooksData((p) => (p ? { ...p, hooks: p.hooks.filter((x) => String(x.id) !== String(hookId)) } : p));
    try {
      await fetch(`/api/settings/hooks/${encodeURIComponent(String(hookId))}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
    } catch {
      setHooksData(prev);
    }
  }, []);

  const createHook = useCallback(async () => {
    try {
      const r = await fetch('/api/settings/hooks', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newHookDraft }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Save failed (${r.status})`);
      setNewHookOpen(false);
      setNewHookDraft({ trigger: 'pre_tool_call', command: '', provider: 'system' });
      await loadHooks();
    } catch (e) {
      setHooksError2(e instanceof Error ? e.message : 'Save failed');
    }
  }, [newHookDraft, loadHooks]);

  const revokeSession = useCallback(
    async (sessionId: string, prev: any[]) => {
      try {
        await fetch(`/api/settings/security/sessions/${encodeURIComponent(String(sessionId))}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
      } catch {
        setSessions(prev);
      }
    },
    [],
  );

  const revokeOtherSessions = useCallback(async () => {
    const toRevoke = sessions.slice(1);
    for (const s of toRevoke) {
      await fetch(`/api/settings/security/sessions/${encodeURIComponent(String(s.id))}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      }).catch(() => null);
    }
    void loadSecurity();
  }, [sessions, loadSecurity]);

  useEffect(() => {
    const opt = { credentials: 'same-origin' as const };
    fetch('/api/settings/profile', opt)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          display_name?: string;
          email?: string;
          plan?: string | null;
          worker_base_url?: string;
          flat?: { display_name?: string; primary_email?: string };
        } | null) => {
          if (!d || typeof d !== 'object') return;
          const email = String(d.email ?? d.flat?.primary_email ?? '').trim();
          const dn = String(d.display_name ?? d.flat?.display_name ?? '').trim();
          const planRaw =
            d.plan != null && String(d.plan).trim() !== '' ? String(d.plan).trim().toLowerCase() : null;
          setProfileEmail(email);
          setProfileDisplayName(dn || (email.includes('@') ? email.split('@')[0] : email) || '');
          setProfilePlan(planRaw);
          setWorkerBaseUrl(typeof d.worker_base_url === 'string' ? d.worker_base_url.trim() : '');
        },
      )
      .catch(() => {
        setProfileEmail('');
        setProfileDisplayName('');
        setProfilePlan(null);
        setWorkerBaseUrl('');
      });

    refreshLlmKeys();

    fetch('/api/integrations/github/repos', opt)
      .then((r) => r.json())
      .then((d: unknown) => {
        if (!Array.isArray(d)) {
          setRepos([]);
          return;
        }
        setRepos(
          d.map((r: Record<string, unknown>, i: number) => ({
            id: typeof r.id === 'number' ? r.id : i,
            repo_full_name: String(r.full_name || r.name || `repo_${i}`),
            repo_url: String(r.html_url || ''),
            default_branch: String(r.default_branch || 'main'),
            cloudflare_worker_name: '',
            is_active: 1,
          })),
        );
      })
      .catch(() => setRepos([]));
  }, [refreshLlmKeys]);

  useEffect(() => {
    if (activeSection !== 'Agents') return;
    void loadAgentsSettings(workspaceId);
  }, [activeSection, workspaceId, loadAgentsSettings]);

  useEffect(() => {
    if (activeSection !== 'AI Models') return;
    void loadModelsSettings(workspaceId);
  }, [activeSection, workspaceId, loadModelsSettings]);

  useEffect(() => {
    if (activeSection !== 'Tools & MCP') return;
    void loadMcpSettings();
  }, [activeSection, loadMcpSettings]);

  useEffect(() => {
    if (activeSection !== 'Rules & Skills') return;
    if (rulesSkillsTab === 'skills') void loadSkills();
    if (rulesSkillsTab === 'subagents') void loadSubagents();
    if (rulesSkillsTab === 'commands') void loadCommands2();
    if (rulesSkillsTab === 'rules') void loadRules();
  }, [activeSection, rulesSkillsTab, loadSkills, loadSubagents, loadCommands2, loadRules]);

  useEffect(() => {
    if (activeSection !== 'Workspace') return;
    void loadWorkspace();
  }, [activeSection, loadWorkspace]);

  useEffect(() => {
    if (activeSection !== 'Hooks') return;
    void loadHooks();
  }, [activeSection, loadHooks]);

  useEffect(() => {
    if (activeSection !== 'Security') return;
    void loadSecurity();
  }, [activeSection, loadSecurity]);

  useEffect(() => {
    if (activeSection !== 'Plan & Usage') return;
    void loadUsage(usagePage, usageProvider, usageModel);
    void loadNotifications();
    void loadBillingPlans();
    void loadBillingSubscription();
    void loadBillingInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirror legacy panel
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'Notifications') return;
    void loadNotifications();
  }, [activeSection, loadNotifications]);

  return {
    defaultAgentsPolicy,

    profileDisplayName,
    profileEmail,
    profilePlan,
    workerBaseUrl,

    settingsModels,
    setSettingsModels,
    modelsLoading,
    modelsError,
    mcpToggleError,
    setMcpToggleError,
    modelOptions,
    patchTierDebounced,
    toggleModelField,
    loadModelsSettings,

    skillsLoading,
    skillsError,
    skills,
    setSkills,
    skillDrawerOpen,
    setSkillDrawerOpen,
    editingSkill,
    setEditingSkill,
    skillDraft,
    setSkillDraft,
    patchSkillActive,
    saveSkillDrawer,

    subagentsLoading,
    subagentsError,
    subagents,
    setSubagents,
    subagentDrawerOpen,
    setSubagentDrawerOpen,
    subagentDraft,
    setSubagentDraft,
    patchSubagentActive,
    saveSubagentDrawer,

    commandsLoading2,
    commandsError2,
    commands2,
    setCommands2,
    expandedCommandId,
    setExpandedCommandId,
    patchCommandActive,

    rulesLoading,
    rulesError,
    rules,
    setRules,
    ruleDrawerOpen,
    setRuleDrawerOpen,
    ruleDraft,
    setRuleDraft,
    patchRuleActive,

    workspaceLoading2,
    workspaceError2,
    workspaceData,
    postWorkspaceReindex,

    hooksLoading2,
    hooksError2,
    hooksData,
    setHooksData,
    newHookOpen,
    setNewHookOpen,
    newHookDraft,
    setNewHookDraft,
    patchHookActive,
    deleteHook,
    createHook,

    sessionsLoading,
    sessionsError,
    sessions,
    setSessions,
    findings,
    loadSecurity,
    revokeSession,
    revokeOtherSessions,

    usageLoading,
    usageError,
    setUsageError,
    usagePage,
    setUsagePage,
    usageProvider,
    setUsageProvider,
    usageModel,
    setUsageModel,
    usageData,
    loadUsage,

    billingPlans,
    billingCoupons,
    billingPlansLoading,
    billingPlansError,
    activeSubscription,
    subscriptionLoading,
    billingInvoices,
    billingInvoicesLoading,
    billingInvoicesError,
    loadBillingPlans,
    loadBillingSubscription,
    loadBillingInvoices,
    startCheckout,
    openBillingPortal,

    notifyLoading,
    notifyError,
    notifyPrefs,
    setNotifyPrefs,
    notifyWebhookUrl,
    setNotifyWebhookUrl,
    budgetMonthlyLimit,
    setBudgetMonthlyLimit,
    budgetHardStop,
    setBudgetHardStop,
    patchProfile,
    loadNotifications,

    agentsLoading,
    agentsSaving,
    agentsError,
    agentsWorkspaceId,
    agentsPolicy,
    setAgentsPolicy,
    agentsCommands,
    agentsDomains,
    agentsMcp,
    newCommand,
    setNewCommand,
    newDomain,
    setNewDomain,
    newToolKey,
    setNewToolKey,
    loadAgentsSettings,
    saveAgentsPolicy,
    addAgentsCommand,
    removeAgentsCommand,
    addAgentsDomain,
    removeAgentsDomain,
    addAgentsMcp,
    removeAgentsMcp,

    settingsMcp,
    setSettingsMcp,
    loadMcpSettings,
    toggleMcpRegisteredTool,

    repos,

    llmKeys,
    llmBusy,
    vaultProvider,
    setVaultProvider,
    vaultKeyValue,
    setVaultKeyValue,
    removeLlmKey,
    saveVaultKeyFromSecurity,
    refreshLlmKeys,
  };
}

export type SettingsPanelModel = ReturnType<typeof useSettingsData>;
