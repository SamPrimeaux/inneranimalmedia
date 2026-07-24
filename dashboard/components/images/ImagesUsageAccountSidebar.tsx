import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle, Copy, KeyRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  cfDeliveryBase,
  fetchImagesCapabilities,
  imagesListUrl,
  type ImagesCapabilities,
} from './imagesApi';

async function resolveAccount(
  workspaceId?: string | null,
): Promise<{ accountHash: string; transformed: string | number; caps: ImagesCapabilities | null }> {
  const caps = await fetchImagesCapabilities(workspaceId);
  let accountHash = String(caps?.account_hash || caps?.accountHash || '').trim();
  let transformed: string | number = caps?.images_transformed ?? '—';
  if (!accountHash) {
    try {
      const r = await fetch(imagesListUrl(workspaceId, 'cf_images', 1, 1), {
        credentials: 'same-origin',
      });
      const d = await r.json();
      if (d.accountHash) accountHash = String(d.accountHash);
      if (d.images_transformed != null) transformed = d.images_transformed;
    } catch {
      /* ignore */
    }
  }
  return { accountHash, transformed, caps };
}

export type ImagesUsageAccountSidebarProps = {
  workspaceId?: string | null;
  imagesStored: number;
  imagesTransformed?: string | number;
  accountHash?: string;
  onCopy?: (msg: string) => void;
};

/** Shared Usage + Account panel used by Storage and Delivery. */
export function ImagesUsageAccountSidebar({
  workspaceId: _workspaceId,
  imagesStored,
  imagesTransformed = '—',
  accountHash = '',
  onCopy,
}: ImagesUsageAccountSidebarProps) {
  void _workspaceId;
  const deliveryUrl = accountHash ? cfDeliveryBase(accountHash) : '';

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onCopy?.(label);
    } catch {
      onCopy?.('Copy failed');
    }
  };

  const card: React.CSSProperties = {
    padding: 14,
    borderRadius: 12,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-elevated)',
    marginBottom: 12,
  };

  return (
    <aside style={{ width: 260, flexShrink: 0 }}>
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--text-main)' }}>
          Usage
        </div>
        <Row label="Images stored" value={String(imagesStored)} />
        <Row label="Images transformed" value={String(imagesTransformed ?? '—')} />
      </div>
      <div style={card}>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 12, color: 'var(--text-main)' }}>
          Account
        </div>
        {accountHash ? (
          <>
            <Row
              label="Account hash"
              value={accountHash}
              action={
                <IconBtn
                  label="Copy hash"
                  onClick={() => void copy(accountHash, 'Account hash copied')}
                >
                  <Copy size={12} />
                </IconBtn>
              }
            />
            <Row
              label="Delivery URL"
              value={deliveryUrl}
              action={
                <IconBtn
                  label="Copy delivery URL"
                  onClick={() => void copy(deliveryUrl, 'Delivery URL copied')}
                >
                  <Copy size={12} />
                </IconBtn>
              }
            />
          </>
        ) : (
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 12px' }}>
              Connect Cloudflare Images to get an account hash and delivery URL.
            </p>
            <Link
              to="/dashboard/images/keys"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '7px 12px',
                borderRadius: 8,
                background: 'var(--solar-cyan)',
                color: '#000',
                fontSize: 12,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <KeyRound size={13} />
              Connect
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

function Row({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <code
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11,
            color: 'var(--text-main)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={value}
        >
          {value}
        </code>
        {action}
      </div>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        display: 'flex',
        padding: 4,
        borderRadius: 5,
        border: '1px solid var(--border-subtle)',
        background: 'var(--bg-panel)',
        color: 'var(--text-muted)',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  );
}

export function ImagesToastStack({
  toasts,
}: {
  toasts: { id: number; msg: string; type: 'ok' | 'err' }[];
}) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 500,
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '9px 16px',
            borderRadius: 10,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            color: t.type === 'err' ? '#f87171' : 'var(--solar-cyan)',
            fontSize: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {t.type === 'ok' ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
          {t.msg}
        </div>
      ))}
    </div>
  );
}

export function useImagesAccountState(workspaceId?: string | null) {
  const [accountHash, setAccountHash] = useState('');
  const [transformed, setTransformed] = useState<string | number>('—');
  const [caps, setCaps] = useState<ImagesCapabilities | null>(null);

  const refresh = useCallback(async () => {
    const r = await resolveAccount(workspaceId);
    setAccountHash(r.accountHash);
    setTransformed(r.transformed);
    setCaps(r.caps);
    return r;
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { accountHash, setAccountHash, transformed, caps, refresh };
}

export default ImagesUsageAccountSidebar;
