import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Key,
  Eye,
  EyeOff,
  RotateCw,
  Trash2,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Clock,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { SettingsPanelModel } from '../hooks/useSettingsData';
import { formatVaultCreated, relativeTime } from '../settingsUi';

export type SecuritySectionProps = { data: SettingsPanelModel };

type VaultSecretRow = {
  id: string;
  secret_name: string;
  service_name: string | null;
  description: string | null;
  tags: string | null;
  metadata_json: string | null;
  is_active?: number;
  expires_at?: number | null;
  created_at?: number | string | null;
};

type ProviderGroup =
  | 'ANTHROPIC'
  | 'CLOUDFLARE'
  | 'GOOGLE'
  | 'GITHUB'
  | 'OPENAI'
  | 'RESEND'
  | 'STRIPE'
  | 'SUPABASE'
  | 'INTERNAL'
  | 'OTHER';

const GROUP_ORDER: ProviderGroup[] = [
  'ANTHROPIC',
  'CLOUDFLARE',
  'GOOGLE',
  'GITHUB',
  'OPENAI',
  'RESEND',
  'STRIPE',
  'SUPABASE',
  'INTERNAL',
  'OTHER',
];

const PROVIDER_PRESETS: { id: ProviderGroup; label: string; placeholder: string }[] = [
  { id: 'ANTHROPIC', label: 'Anthropic', placeholder: 'ANTHROPIC_API_KEY' },
  { id: 'OPENAI', label: 'OpenAI', placeholder: 'OPENAI_API_KEY' },
  { id: 'GOOGLE', label: 'Google AI', placeholder: 'GEMINI_API_KEY' },
  { id: 'GITHUB', label: 'GitHub', placeholder: 'GITHUB_TOKEN' },
  { id: 'CLOUDFLARE', label: 'Cloudflare', placeholder: 'CLOUDFLARE_API_TOKEN' },
  { id: 'RESEND', label: 'Resend', placeholder: 'RESEND_API_KEY' },
  { id: 'STRIPE', label: 'Stripe', placeholder: 'STRIPE_SECRET_KEY' },
  { id: 'SUPABASE', label: 'Supabase', placeholder: 'SUPABASE_SERVICE_ROLE_KEY' },
  { id: 'INTERNAL', label: 'Internal', placeholder: 'INTERNAL_API_SECRET' },
  { id: 'OTHER', label: 'Other', placeholder: 'MY_SECRET_NAME' },
];

function inferProviderGroup(secretName: string, serviceName: string | null): ProviderGroup {
  const blob = `${secretName} ${serviceName ?? ''}`.toUpperCase();
  if (/(ANTHROPIC|SK-ANT)/.test(blob)) return 'ANTHROPIC';
  if (/(CLOUDFLARE|CFUT|CLOUDFLARE_API)/.test(blob)) return 'CLOUDFLARE';
  if (/(GOOGLE|GEMINI|AIZA)/.test(blob)) return 'GOOGLE';
  if (/(GITHUB|GH[PUE]|GITHUB_PAT)/.test(blob)) return 'GITHUB';
  if (/(OPENAI|SK-PROJ)/.test(blob)) return 'OPENAI';
  if (/RESEND/.test(blob)) return 'RESEND';
  if (/(STRIPE|SK_LIVE|RK_LIVE)/.test(blob)) return 'STRIPE';
  if (/SUPABASE/.test(blob)) return 'SUPABASE';
  if (/(INTERNAL|MCP_AUTH|IAM_BRIDGE|AGENTSAM)/.test(blob)) return 'INTERNAL';
  return 'OTHER';
}

function capitalizeProvider(p: string) {
  const s = String(p || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function daysUntil(tsSec: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.ceil((tsSec - now) / 86400);
}

function RotationBadge({ expiresAt }: { expiresAt: number | null | undefined }) {
  if (expiresAt == null || expiresAt === 0) {
    return (
      <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
        No schedule
      </span>
    );
  }
  const d = daysUntil(expiresAt);
  if (d < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-[var(--color-danger)]/15 text-[var(--color-danger)] border border-[var(--color-danger)]/30">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-danger)] animate-pulse" />
        OVERDUE
      </span>
    );
  }
  if (d <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] px-2 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/30">
        <Clock className="h-3 w-3" />
        Due soon ({d}d)
      </span>
    );
  }
  return (
    <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-success)]/15 text-[var(--color-success)] border border-[var(--color-success)]/30">
      Due in {d} days
    </span>
  );
}

export function SecuritySection({ data }: SecuritySectionProps) {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwLoading, setPwLoading] = useState(false);

  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

  const [identities, setIdentities] = useState<Array<{ provider: string; email: string; created_at: string }>>(
    [],
  );
  const [identitiesLoaded, setIdentitiesLoaded] = useState(false);

  const [vaultSecrets, setVaultSecrets] = useState<VaultSecretRow[]>([]);
  const [vaultLoading, setVaultLoading] = useState(true);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Partial<Record<ProviderGroup, boolean>>>(() =>
    Object.fromEntries(GROUP_ORDER.map((g) => [g, true])) as Partial<Record<ProviderGroup, boolean>>,
  );

  const [revealMap, setRevealMap] = useState<Record<string, { value: string; until: number }>>({});
  const revealTimers = useRef<Record<string, number>>({});

  const [newProvider, setNewProvider] = useState<ProviderGroup>('ANTHROPIC');
  const [newKeyName, setNewKeyName] = useState(PROVIDER_PRESETS[0].placeholder);
  const [newKeyValue, setNewKeyValue] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newRotationDays, setNewRotationDays] = useState('90');
  const [showAddKeyForm, setShowAddKeyForm] = useState(false);
  const [revealNewKeyValue, setRevealNewKeyValue] = useState(false);
  const [vaultSaving, setVaultSaving] = useState(false);

  const [findingsBusy, setFindingsBusy] = useState<string | null>(null);
  const [findingActionMsg, setFindingActionMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/identities', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { identities?: typeof identities }) => {
        setIdentities(Array.isArray(j.identities) ? j.identities : []);
        setIdentitiesLoaded(true);
      })
      .catch(() => setIdentitiesLoaded(true));
  }, []);

  const loadVault = useCallback(async () => {
    setVaultLoading(true);
    setVaultError(null);
    try {
      const r = await fetch('/api/vault/secrets', { credentials: 'same-origin' });
      const j = (await r.json().catch(() => ({}))) as { secrets?: VaultSecretRow[]; error?: string };
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : `Vault load failed (${r.status})`);
      setVaultSecrets(Array.isArray(j.secrets) ? j.secrets.filter((s) => s.is_active !== 0) : []);
    } catch (e) {
      setVaultError(e instanceof Error ? e.message : 'Failed to load vault');
      setVaultSecrets([]);
    } finally {
      setVaultLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadVault();
  }, [loadVault]);

  useEffect(() => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === newProvider);
    if (preset) setNewKeyName(preset.placeholder);
  }, [newProvider]);

  useEffect(() => {
    return () => {
      for (const t of Object.values(revealTimers.current)) {
        window.clearTimeout(t);
      }
    };
  }, []);

  const groupedSecrets = useMemo(() => {
    const map = new Map<ProviderGroup, VaultSecretRow[]>();
    for (const g of GROUP_ORDER) map.set(g, []);
    for (const row of vaultSecrets) {
      const g = inferProviderGroup(row.secret_name, row.service_name);
      map.get(g)?.push(row);
    }
    return map;
  }, [vaultSecrets]);

  const scheduleRevealClear = useCallback((id: string, until: number) => {
    if (revealTimers.current[id]) {
      window.clearTimeout(revealTimers.current[id]);
    }
    revealTimers.current[id] = window.setTimeout(() => {
      setRevealMap((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      void navigator.clipboard.writeText('').catch(() => null);
      delete revealTimers.current[id];
    }, Math.max(0, until - Date.now()));
  }, []);

  const revealSecret = async (row: VaultSecretRow) => {
    try {
      const r = await fetch(`/api/vault/secrets/${encodeURIComponent(row.id)}/reveal`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const j = (await r.json().catch(() => ({}))) as { value?: string; error?: string };
      if (!r.ok || typeof j.value !== 'string') {
        throw new Error(typeof j.error === 'string' ? j.error : 'Reveal failed');
      }
      const until = Date.now() + 10000;
      setRevealMap((prev) => ({ ...prev, [row.id]: { value: j.value as string, until } }));
      scheduleRevealClear(row.id, until);
    } catch {
      setVaultError('Could not reveal secret.');
    }
  };

  const copyRevealed = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setVaultError('Clipboard unavailable.');
    }
  };

  const revokeVaultSecret = (row: VaultSecretRow) => {
    if (!window.confirm(`Revoke ${row.secret_name}? This marks it inactive.`)) return;
    void (async () => {
      try {
        const r = await fetch(`/api/vault/secrets/${encodeURIComponent(row.id)}`, {
          method: 'DELETE',
          credentials: 'same-origin',
        });
        if (!r.ok) throw new Error('Revoke failed');
        await loadVault();
      } catch {
        setVaultError('Could not revoke secret.');
      }
    })();
  };

  const rotateInform = (row: VaultSecretRow) => {
    if (!window.confirm(`Are you sure you want to rotate ${row.secret_name}?`)) return;
    void (async () => {
      try {
        const r = await fetch(`/api/vault/secrets/${encodeURIComponent(row.id)}/reveal`, {
          method: 'POST',
          credentials: 'same-origin',
        });
        const j = (await r.json().catch(() => ({}))) as { value?: string };
        if (!r.ok) throw new Error('Could not read current value');
        void j.value;
        window.alert(
          'Update this key in Cloudflare Secrets, then add the new value here via Add key. This dashboard cannot push secrets to Cloudflare automatically.',
        );
      } catch {
        setVaultError('Rotate flow failed.');
      }
    })();
  };

  const saveNewVaultSecret = () => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === newProvider);
    const days = Number.parseInt(newRotationDays, 10);
    const expires =
      Number.isFinite(days) && days > 0 ? Math.floor(Date.now() / 1000) + days * 86400 : null;
    void (async () => {
      setVaultSaving(true);
      try {
        const r = await fetch('/api/vault/secrets', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret_name: newKeyName.trim(),
            secret_value: newKeyValue,
            service_name: preset?.label ?? newProvider,
            description: newLabel.trim() || null,
            expires_at: expires,
          }),
        });
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Save failed');
        setNewKeyValue('');
        setNewLabel('');
        await loadVault();
      } catch (e) {
        setVaultError(e instanceof Error ? e.message : 'Save failed');
      } finally {
        setVaultSaving(false);
      }
    })();
  };

  const patchFinding = async (id: string, status: string) => {
    setFindingsBusy(id);
    setFindingActionMsg(null);
    try {
      const r = await fetch(`/api/settings/security/findings/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) {
        setFindingActionMsg('Status update is not available on the server yet.');
        return;
      }
      await data.loadSecurity();
    } catch {
      setFindingActionMsg('Could not update finding.');
    } finally {
      setFindingsBusy(null);
    }
  };

  const suspiciousUa = (ua: string) => {
    const u = ua.toLowerCase();
    return u.includes('python-requests') || u.includes('curl/');
  };

  const revokeAllOthers = () => {
    if (
      !window.confirm(
        'Revoke all sessions except the most recently active row shown? Confirm you are not locking yourself out.',
      )
    ) {
      return;
    }
    void data.revokeOtherSessions();
  };

  const openFindings = useMemo(
    () => data.findings.filter((f: { status?: string }) => (f.status ?? 'open') === 'open'),
    [data.findings],
  );

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <style>{`
        @keyframes iamVaultRevealBar {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        .iam-vault-reveal-bar {
          transform-origin: left center;
          animation: iamVaultRevealBar 10s linear forwards;
        }
      `}</style>

      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">
        Security &amp; vault
      </h2>

      {/* Panel 1 — API keys vault */}
      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-[var(--solar-cyan)]" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            API keys vault
          </h3>
        </div>
        {vaultLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-8 rounded-lg bg-[var(--bg-hover)]" />
            <div className="h-8 rounded-lg bg-[var(--bg-hover)]" />
            <div className="h-8 rounded-lg bg-[var(--bg-hover)]" />
          </div>
        ) : vaultError ? (
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--color-danger)]">
            {vaultError}
            <button
              type="button"
              onClick={() => void loadVault()}
              className="px-3 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-main)]"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {GROUP_ORDER.map((group) => {
              const rows = groupedSecrets.get(group) ?? [];
              if (rows.length === 0) return null;
              const open = expandedGroups[group] !== false;
              return (
                <div key={group} className="rounded-lg border border-[var(--border-subtle)] overflow-hidden">
                  <button
                    type="button"
                    className="w-full flex items-center justify-between px-3 py-2 bg-[var(--bg-panel)] text-left hover:bg-[var(--bg-hover)]"
                    onClick={() => setExpandedGroups((prev) => ({ ...prev, [group]: !open }))}
                  >
                    <span className="flex items-center gap-2 text-[11px] font-semibold text-[var(--text-main)]">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {group}
                      <span className="text-[9px] px-2 py-0.5 rounded-full bg-[var(--bg-hover)] text-[var(--text-muted)]">
                        {rows.length}
                      </span>
                    </span>
                  </button>
                  {open ? (
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {rows.map((row) => {
                        const revealed = revealMap[row.id];
                        const meta =
                          (() => {
                            try {
                              return JSON.parse(row.metadata_json || '{}') as { last4?: string };
                            } catch {
                              return {};
                            }
                          })();
                        return (
                          <div key={row.id} className="p-3 space-y-2 bg-[var(--bg-app)]">
                            <div className="flex flex-wrap items-center gap-2">
                              <Key className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                              <span className="text-[12px] font-semibold text-[var(--text-main)] font-mono">
                                {row.secret_name}
                              </span>
                              {row.description ? (
                                <span className="text-[10px] text-[var(--text-muted)]">{row.description}</span>
                              ) : null}
                              <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                                {meta.last4 ? `···${meta.last4}` : 'encrypted'}
                              </span>
                              <RotationBadge expiresAt={row.expires_at ?? null} />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[11px] text-[var(--text-muted)] min-w-[120px]">
                                {revealed ? (
                                  <span className="text-[var(--solar-green)]">{revealed.value}</span>
                                ) : (
                                  '················'
                                )}
                              </span>
                              <button
                                type="button"
                                title={revealed ? 'Mask' : 'Reveal'}
                                className="p-1.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                onClick={() => {
                                  if (revealed) {
                                    setRevealMap((prev) => {
                                      const next = { ...prev };
                                      delete next[row.id];
                                      return next;
                                    });
                                    void navigator.clipboard.writeText('').catch(() => null);
                                  } else {
                                    void revealSecret(row);
                                  }
                                }}
                              >
                                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                              {revealed ? (
                                <>
                                  <div className="flex-1 min-w-[140px] h-1 bg-[var(--bg-hover)] rounded overflow-hidden">
                                    <div className="h-full bg-[var(--solar-green)] iam-vault-reveal-bar" />
                                  </div>
                                  <button
                                    type="button"
                                    className="p-1.5 rounded border border-[var(--border-subtle)]"
                                    onClick={() => void copyRevealed(row.id, revealed.value)}
                                  >
                                    <Copy className="h-4 w-4 text-[var(--text-muted)]" />
                                  </button>
                                </>
                              ) : null}
                              <button
                                type="button"
                                className="p-1.5 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
                                title="Rotate"
                                onClick={() => rotateInform(row)}
                              >
                                <RotateCw className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                className="p-1.5 rounded border border-[var(--border-subtle)] text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                                title="Revoke"
                                onClick={() => revokeVaultSecret(row)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-[var(--border-subtle)] pt-4 space-y-3">
          <button
            type="button"
            className="text-[11px] font-semibold text-[var(--solar-cyan)]"
            onClick={() => setShowAddKeyForm((v) => !v)}
          >
            {showAddKeyForm ? 'Hide add key form' : 'Add key'}
          </button>
          {showAddKeyForm ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
                <span className="text-[var(--text-muted)]">Provider</span>
                <select
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value as ProviderGroup)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                >
                  {PROVIDER_PRESETS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
                <span className="text-[var(--text-muted)]">Key name</span>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] font-mono text-[var(--text-main)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
                <span className="text-[var(--text-muted)]">API key</span>
                <div className="relative">
                  <input
                    type={revealNewKeyValue ? 'text' : 'password'}
                    autoComplete="off"
                    value={newKeyValue}
                    onChange={(e) => setNewKeyValue(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 pr-10 text-[12px] text-[var(--text-main)]"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)]"
                    aria-label="Toggle visibility"
                    onClick={() => setRevealNewKeyValue((s) => !s)}
                  >
                    {revealNewKeyValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
                <span className="text-[var(--text-muted)]">Label</span>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
                <span className="text-[var(--text-muted)]">Rotation reminder</span>
                <select
                  value={newRotationDays}
                  onChange={(e) => setNewRotationDays(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                >
                  <option value="30">30 days</option>
                  <option value="60">60 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                </select>
              </label>
              <button
                type="button"
                disabled={vaultSaving || !newKeyName.trim() || !newKeyValue.trim()}
                onClick={() => saveNewVaultSecret()}
                className="sm:col-span-2 px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-40"
              >
                {vaultSaving ? 'Saving…' : 'Save to vault'}
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {/* Password / email / identities — preserved */}
      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Password</h3>
        {data.user?.passwordMethod === 'oauth' ? (
          <p className="text-[11px] text-[var(--text-muted)]">
            You sign in via {data.user?.provider ?? 'external provider'}. No password set.
          </p>
        ) : !data.user ? (
          <p className="text-[11px] text-[var(--text-muted)]">Loading…</p>
        ) : (
          <>
            <p className="text-[11px] text-[var(--text-muted)]">
              Last changed:{' '}
              {data.user?.passwordUpdatedAt ? formatVaultCreated(data.user.passwordUpdatedAt) : '—'}
            </p>
            {!showPasswordForm ? (
              <button
                type="button"
                onClick={() => {
                  setPwMsg(null);
                  setShowPasswordForm(true);
                }}
                className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30"
              >
                Change password
              </button>
            ) : (
              <form
                className="grid gap-3 max-w-md"
                onSubmit={(e) => {
                  e.preventDefault();
                  void (async () => {
                    if (pwNew.length < 10) {
                      setPwMsg({ ok: false, text: 'Min 10 characters' });
                      return;
                    }
                    if (pwNew !== pwConfirm) {
                      setPwMsg({ ok: false, text: 'Passwords do not match' });
                      return;
                    }
                    setPwLoading(true);
                    try {
                      const res = await fetch('/api/auth/password-change', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ currentPassword: pwCurrent, newPassword: pwNew }),
                        credentials: 'include',
                      });
                      const json = (await res.json().catch(() => ({}))) as { error?: string };
                      if (res.ok) {
                        setPwMsg({ ok: true, text: 'Password updated.' });
                        setShowPasswordForm(false);
                        setPwCurrent('');
                        setPwNew('');
                        setPwConfirm('');
                      } else {
                        setPwMsg({
                          ok: false,
                          text: typeof json.error === 'string' ? json.error : 'Failed to update password.',
                        });
                      }
                    } finally {
                      setPwLoading(false);
                    }
                  })();
                }}
              >
                <input
                  type="password"
                  autoComplete="current-password"
                  placeholder="Current password"
                  value={pwCurrent}
                  onChange={(e) => setPwCurrent(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="New password (min 10 chars)"
                  value={pwNew}
                  onChange={(e) => setPwNew(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder="Confirm new password"
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
                />
                <button
                  type="submit"
                  disabled={pwLoading}
                  className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-40"
                >
                  Save new password
                </button>
              </form>
            )}
            {pwMsg ? (
              <div
                className={`text-[11px] ${pwMsg.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
              >
                {pwMsg.text}
              </div>
            ) : null}
          </>
        )}
      </section>

      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Email address
        </h3>
        <p className="text-[11px] text-[var(--text-muted)]">
          Current: {data.user?.email ?? data.profileEmail ?? '—'}
        </p>
        {!showEmailForm ? (
          <button
            type="button"
            onClick={() => {
              setEmailMsg(null);
              setShowEmailForm(true);
            }}
            className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30"
          >
            Change email
          </button>
        ) : (
          <form
            className="grid gap-3 max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                setEmailLoading(true);
                try {
                  const res = await fetch('/api/auth/email-change/request', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ newEmail }),
                    credentials: 'include',
                  });
                  const json = (await res.json().catch(() => ({}))) as { error?: string };
                  if (res.ok) {
                    setEmailMsg({
                      ok: true,
                      text: 'Check your inbox to confirm the new address.',
                    });
                    setShowEmailForm(false);
                    setNewEmail('');
                  } else {
                    setEmailMsg({
                      ok: false,
                      text:
                        typeof json.error === 'string' ? json.error : 'Failed to send verification.',
                    });
                  }
                } finally {
                  setEmailLoading(false);
                }
              })();
            }}
          >
            <input
              type="email"
              autoComplete="email"
              placeholder="New email address"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
            />
            <button
              type="submit"
              disabled={emailLoading}
              className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-40"
            >
              Send verification
            </button>
          </form>
        )}
        {emailMsg ? (
          <div
            className={`text-[11px] ${emailMsg.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}
          >
            {emailMsg.text}
          </div>
        ) : null}
      </section>

      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Connected accounts
        </h3>
        {!identitiesLoaded ? null : identities.length === 0 ? (
          <p className="text-[11px] text-[var(--text-muted)]">No external accounts connected.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {identities.map((identity, idx) => (
              <div
                key={`${identity.provider}-${identity.email}-${idx}`}
                className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--text-main)]"
              >
                <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-panel)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                  {capitalizeProvider(identity.provider)}
                </span>
                <span className="text-[var(--text-muted)]">{identity.email}</span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  Connected {identity.created_at ? formatVaultCreated(identity.created_at) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Legacy LLM keys table — keep for BYOK slots */}
      <section className="space-y-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
          Model provider keys (BYOK)
        </h3>
        <p className="text-[11px] text-[var(--text-muted)]">
          Encrypted LLM keys for routing. Use the vault above for general secrets.
        </p>
        {data.llmKeys.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-app)] p-6 text-[12px] text-[var(--text-muted)]">
            No keys stored yet.
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
            <table className="w-full text-[11px]">
              <thead className="bg-[var(--bg-hover)] text-[var(--text-muted)] text-left">
                <tr>
                  <th className="px-3 py-2 font-semibold">Provider</th>
                  <th className="px-3 py-2 font-semibold">Masked</th>
                  <th className="px-3 py-2 font-semibold">Added</th>
                  <th className="px-3 py-2 font-semibold w-24" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data.llmKeys.map((k) => (
                  <tr key={k.id}>
                    <td className="px-3 py-2 text-[var(--text-main)]">{k.provider || k.key_name}</td>
                    <td className="px-3 py-2 font-mono text-[var(--solar-cyan)]">{k.masked}</td>
                    <td className="px-3 py-2 text-[var(--text-muted)]">{formatVaultCreated(k.created_at)}</td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        disabled={data.llmBusy === k.id}
                        onClick={() => void data.removeLlmKey(k.id)}
                        className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Add model key</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-[11px]">
            <span className="text-[var(--text-muted)]">Provider</span>
            <select
              value={data.vaultProvider}
              onChange={(e) =>
                data.setVaultProvider(e.target.value as typeof data.vaultProvider)
              }
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
            >
              <option value="OPENAI_API_KEY">OpenAI</option>
              <option value="ANTHROPIC_API_KEY">Anthropic</option>
              <option value="GEMINI_API_KEY">Gemini</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
            <span className="text-[var(--text-muted)]">Key name (vault slot)</span>
            <input
              type="text"
              readOnly
              value={data.vaultProvider}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] font-mono text-[var(--text-muted)]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] sm:col-span-2">
            <span className="text-[var(--text-muted)]">API key</span>
            <input
              type="password"
              autoComplete="off"
              value={data.vaultKeyValue}
              onChange={(e) => data.setVaultKeyValue(e.target.value)}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] px-3 py-2 text-[12px] text-[var(--text-main)]"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={data.llmBusy === data.vaultProvider || !data.vaultKeyValue.trim()}
          onClick={() => void data.saveVaultKeyFromSecurity()}
          className="px-4 py-2 rounded-lg bg-[var(--solar-cyan)]/20 text-[11px] font-semibold text-[var(--solar-cyan)] border border-[var(--solar-cyan)]/30 hover:bg-[var(--solar-cyan)]/30 disabled:opacity-40"
        >
          Save
        </button>
      </section>

      {/* Panel 2 — Security findings */}
      <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Security findings
          </h3>
        </div>
        {findingActionMsg ? (
          <p className="text-[10px] text-[var(--color-warning)]">{findingActionMsg}</p>
        ) : null}
        {openFindings.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-4 text-[11px] text-[var(--color-success)]">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            No open security findings
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {openFindings.map((f: Record<string, unknown>, i: number) => {
              const id = String(f.id ?? `idx_${i}`);
              const sev = String(f.severity ?? 'info').toUpperCase();
              const title = String(f.finding_type ?? f.title ?? 'finding');
              const snippet = String(f.snippet_redacted ?? f.description ?? '');
              const status = String(f.status ?? 'open');
              const created = f.created_at;
              return (
                <div
                  key={id}
                  className="rounded-lg border border-[var(--border-subtle)] p-3 space-y-2 bg-[var(--bg-app)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-widest border ${
                        sev === 'CRITICAL'
                          ? 'bg-[var(--color-danger)]/15 text-[var(--color-danger)] border-[var(--color-danger)]/40'
                          : sev === 'HIGH'
                            ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)] border-[var(--color-warning)]/40'
                            : 'bg-[var(--bg-hover)] text-[var(--text-muted)] border-[var(--border-subtle)]'
                      }`}
                    >
                      {sev}
                    </span>
                    <span className="text-[12px] text-[var(--text-main)]">{title}</span>
                    <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--text-muted)]">
                      {status}
                    </span>
                  </div>
                  <pre className="font-mono text-[10px] text-[var(--text-muted)] whitespace-pre-wrap break-all">
                    {snippet || '—'}
                  </pre>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {created != null ? <>Recorded {relativeTime(String(created))}</> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={findingsBusy === id}
                      onClick={() => void patchFinding(id, 'triaged')}
                      className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-main)]"
                    >
                      Acknowledge
                    </button>
                    <button
                      type="button"
                      disabled={findingsBusy === id}
                      onClick={() => void patchFinding(id, 'false_positive')}
                      className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)]"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Panel 3 — Active sessions */}
      <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
            Active sessions
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={data.sessionsLoading}
              onClick={() => void data.loadSecurity()}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)] hover:text-[var(--text-main)] disabled:opacity-40"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => revokeAllOthers()}
              className="px-3 py-1.5 rounded-lg border border-[var(--color-warning)]/40 text-[11px] text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10"
            >
              Revoke all others
            </button>
          </div>
        </div>
        {data.sessionsError ? (
          <div className="text-[11px] text-[var(--color-danger)]">{data.sessionsError}</div>
        ) : null}
        <div className="rounded-xl border border-[var(--border-subtle)] overflow-hidden bg-[var(--bg-panel)]">
          <div className="grid grid-cols-6 gap-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--text-muted)] border-b border-[var(--border-subtle)] bg-[var(--bg-app)]">
            <div className="col-span-1">Provider</div>
            <div className="col-span-1">IP</div>
            <div className="col-span-2">Agent</div>
            <div className="col-span-1">Active</div>
            <div className="col-span-1 text-right">Actions</div>
          </div>
          {data.sessions.map((s) => {
            const ua = String(s.user_agent || '');
            const browser = ua.includes('Chrome')
              ? 'Chrome'
              : ua.includes('Firefox')
                ? 'Firefox'
                : ua.slice(0, 30);
            const flag = suspiciousUa(ua);
            return (
              <div
                key={String(s.id)}
                className="grid grid-cols-6 gap-0 px-4 py-3 border-b border-[var(--border-subtle)] items-center text-[11px]"
              >
                <div className="col-span-1 flex flex-wrap items-center gap-1">
                  <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border-subtle)] text-[var(--text-muted)] font-black uppercase tracking-widest">
                    {String(s.provider || 'email')}
                  </span>
                  {flag ? (
                    <span className="inline-flex items-center gap-1 text-[8px] px-1.5 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)] border border-[var(--color-warning)]/40">
                      <ShieldAlert className="h-3 w-3" />
                      CLI
                    </span>
                  ) : null}
                </div>
                <div className="col-span-1 text-[10px] text-[var(--text-muted)] font-mono truncate">
                  {String(s.ip_address || '—')}
                </div>
                <div className="col-span-2 text-[10px] text-[var(--text-muted)] truncate">
                  {browser || '—'}
                </div>
                <div className="col-span-1 text-[10px] text-[var(--text-muted)]">
                  {s.last_active_at ? relativeTime(s.last_active_at) : '—'}
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const snapshot = data.sessions;
                      data.setSessions((p) => p.filter((x) => String(x.id) !== String(s.id)));
                      void data.revokeSession(String(s.id), snapshot);
                    }}
                    className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/40"
                  >
                    Revoke
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">MCP Auth Token</h3>
        <div className="flex items-center justify-between">
          <div className="text-[11px] text-[var(--text-muted)]">MCP Auth Token</div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--text-muted)] font-mono">••••••••••••</span>
            <span className="text-[9px] px-2 py-0.5 rounded bg-[var(--color-success)]/10 text-[var(--color-success)] border border-[var(--color-success)]/30 font-black uppercase tracking-widest">
              Active
            </span>
            <button
              type="button"
              title="Contact admin to rotate"
              className="px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] text-[11px] text-[var(--text-muted)]"
            >
              Rotate
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
