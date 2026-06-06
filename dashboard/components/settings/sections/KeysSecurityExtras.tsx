import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatVaultCreated, relativeTime } from '../settingsUi';

type IdentityRow = { provider: string; email: string; created_at: string };

type FindingRow = Record<string, unknown>;

function capitalizeProvider(p: string) {
  const s = String(p || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function KeysSecurityExtras() {
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [identitiesLoaded, setIdentitiesLoaded] = useState(false);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [findingsLoading, setFindingsLoading] = useState(true);
  const [findingsBusy, setFindingsBusy] = useState<string | null>(null);
  const [findingActionMsg, setFindingActionMsg] = useState<string | null>(null);

  const loadFindings = useCallback(async () => {
    setFindingsLoading(true);
    try {
      const r = await fetch('/api/settings/security/findings', { credentials: 'same-origin' });
      const j = (await r.json().catch(() => ({}))) as { findings?: FindingRow[] };
      setFindings(Array.isArray(j.findings) ? j.findings : []);
    } catch {
      setFindings([]);
    } finally {
      setFindingsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch('/api/auth/identities', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { identities?: IdentityRow[] }) => {
        setIdentities(Array.isArray(j.identities) ? j.identities : []);
        setIdentitiesLoaded(true);
      })
      .catch(() => setIdentitiesLoaded(true));
    void loadFindings();
  }, [loadFindings]);

  const openFindings = useMemo(
    () => findings.filter((f) => (f.status ?? 'open') === 'open'),
    [findings],
  );

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
      await loadFindings();
    } catch {
      setFindingActionMsg('Could not update finding.');
    } finally {
      setFindingsBusy(null);
    }
  };

  return (
    <>
      <section className="space-y-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-app)]">
        <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
          Connected accounts
        </h3>
        {!identitiesLoaded ? (
          <p className="text-[11px] text-[var(--text-muted)]">Loading…</p>
        ) : identities.length === 0 ? (
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

      <section className="space-y-2 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-panel)]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--text-muted)]">
              Security findings
            </h3>
          </div>
          <button
            type="button"
            disabled={findingsLoading}
            onClick={() => void loadFindings()}
            className="text-[10px] px-2 py-1 rounded border border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-main)]"
          >
            Refresh
          </button>
        </div>
        {findingActionMsg ? (
          <p className="text-[10px] text-[var(--color-warning)]">{findingActionMsg}</p>
        ) : null}
        {findingsLoading ? (
          <p className="text-[11px] text-[var(--text-muted)]">Loading findings…</p>
        ) : openFindings.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/5 p-4 text-[11px] text-[var(--color-success)]">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            No open security findings
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {openFindings.map((f, i) => {
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
    </>
  );
}
