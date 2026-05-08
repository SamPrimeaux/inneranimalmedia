import React, { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Toggle } from '../settingsUi';

const PREF_KEYS = {
  sync_layouts: 'iam_pref_sync_layouts',
  show_status_bar: 'iam_pref_show_status_bar',
  autohide_editor: 'iam_pref_autohide_editor',
  autoinject_code: 'iam_pref_autoinject_code',
} as const;

type PrefApiKey = keyof typeof PREF_KEYS;

function readStoredBool(storageKey: string, defaultOn: boolean) {
  try {
    const v = localStorage.getItem(storageKey);
    if (v === null) return defaultOn;
    return v === '1' || v === 'true';
  } catch {
    return defaultOn;
  }
}

export function GeneralSection({ workspaceId }: { workspaceId?: string | null }) {
  const navigate = useNavigate();
  const [syncLayouts, setSyncLayouts] = useState(true);
  const [showStatusBar, setShowStatusBar] = useState(true);
  const [autohideEditor, setAutohideEditor] = useState(false);
  const [autoinjectCode, setAutoinjectCode] = useState(true);

  useEffect(() => {
    setSyncLayouts(readStoredBool(PREF_KEYS.sync_layouts, true));
    setShowStatusBar(readStoredBool(PREF_KEYS.show_status_bar, true));
    setAutohideEditor(readStoredBool(PREF_KEYS.autohide_editor, false));
    setAutoinjectCode(readStoredBool(PREF_KEYS.autoinject_code, true));
  }, []);

  const patchUserPolicyFireAndForget = (body: Record<string, unknown>) => {
    try {
      void fetch('/api/settings/user-policy', {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace_id: workspaceId?.trim() || '',
          ...body,
        }),
      });
    } catch {
      /* ignore */
    }
  };

  const persistToggle = (storageKey: string, apiKey: PrefApiKey, value: boolean) => {
    try {
      localStorage.setItem(storageKey, value ? '1' : '0');
    } catch {
      /* ignore */
    }
    patchUserPolicyFireAndForget({ [apiKey]: value ? 1 : 0 });
  };

  const rows: Array<{
    label: string;
    desc: string;
    on: boolean;
    setOn: (v: boolean) => void;
    storageKey: string;
    apiKey: PrefApiKey;
  }> = [
    {
      label: 'Sync layouts across windows',
      desc: 'All windows share the same panel layout',
      on: syncLayouts,
      setOn: setSyncLayouts,
      storageKey: PREF_KEYS.sync_layouts,
      apiKey: 'sync_layouts',
    },
    {
      label: 'Show Status Bar',
      desc: 'Show context bar at the bottom of the editor',
      on: showStatusBar,
      setOn: setShowStatusBar,
      storageKey: PREF_KEYS.show_status_bar,
      apiKey: 'show_status_bar',
    },
    {
      label: 'Auto-hide editor when empty',
      desc: 'Expand chat when all editors are closed',
      on: autohideEditor,
      setOn: setAutohideEditor,
      storageKey: PREF_KEYS.autohide_editor,
      apiKey: 'autohide_editor',
    },
    {
      label: 'Auto-inject code to Monaco',
      desc: 'Agent code blocks auto-open in editor',
      on: autoinjectCode,
      setOn: setAutoinjectCode,
      storageKey: PREF_KEYS.autoinject_code,
      apiKey: 'autoinject_code',
    },
  ];

  return (
    <div className="flex flex-col gap-5 max-w-xl">
      <h2 className="text-[13px] font-bold text-[var(--text-heading)] uppercase tracking-widest">General</h2>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-center justify-between py-3 border-b border-[var(--border-subtle)]/50"
        >
          <div>
            <div className="text-[12px] font-semibold text-[var(--text-main)]">{row.label}</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{row.desc}</div>
          </div>
          <Toggle
            on={row.on}
            onChange={(v) => {
              row.setOn(v);
              persistToggle(row.storageKey, row.apiKey, v);
            }}
          />
        </div>
      ))}
      <div className="flex items-start justify-between py-3 border-b border-[var(--border-subtle)]/50">
        <div>
          <div className="text-[12px] font-semibold text-[var(--text-main)]">Manage Account</div>
          <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Billing, seats, and usage limits</div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/dashboard/settings/plan-usage')}
          className="flex items-center gap-1 px-2.5 py-1.5 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-lg text-[11px] hover:border-[var(--solar-cyan)]/50 transition-colors"
        >
          Open <ExternalLink size={10} />
        </button>
      </div>
    </div>
  );
}
