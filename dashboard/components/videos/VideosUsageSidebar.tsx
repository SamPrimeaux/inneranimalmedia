import React from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { CF_STREAM_DOCS_URL } from './videosRegistry';

const card: React.CSSProperties = {
  padding: 14,
  borderRadius: 12,
  border: '1px solid var(--border-subtle)',
  background: 'var(--bg-elevated)',
  marginBottom: 12,
  fontFamily: 'inherit',
};

function Row({ label, value, onCopy }: { label: string; value: string; onCopy?: () => void }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 10px',
          borderRadius: 8,
          border: '1px solid var(--border-subtle)',
          background: 'var(--bg-app)',
          fontSize: 12,
          color: 'var(--text-main)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {value || '—'}
        </span>
        {value && onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            title="Copy"
            style={{
              border: 'none',
              background: 'transparent',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: 2,
            }}
          >
            <Copy size={13} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type VideosUsageSidebarProps = {
  videosStored: number;
  accountId?: string | null;
  customerSubdomain?: string | null;
  onCopy?: (msg: string, type?: 'ok' | 'err') => void;
};

export function VideosUsageSidebar({
  videosStored,
  accountId,
  customerSubdomain,
  onCopy,
}: VideosUsageSidebarProps) {
  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onCopy?.(`${label} copied`);
    } catch {
      onCopy?.('Copy failed', 'err');
    }
  };

  return (
    <aside style={{ width: 280, flexShrink: 0, fontFamily: 'inherit' }}>
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-main)' }}>
          Usage
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Videos stored</div>
        <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--text-main)' }}>{videosStored}</div>
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-main)' }}>
          Account details
        </div>
        <Row
          label="Account ID"
          value={accountId || ''}
          onCopy={accountId ? () => void copy(accountId, 'Account ID') : undefined}
        />
        <Row
          label="Customer subdomain"
          value={customerSubdomain || ''}
          onCopy={
            customerSubdomain
              ? () => void copy(customerSubdomain, 'Customer subdomain')
              : undefined
          }
        />
      </div>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-main)' }}>
          Resources
        </div>
        {(
          [
            ['Stream docs', CF_STREAM_DOCS_URL],
            ['Uploads', `${CF_STREAM_DOCS_URL}uploading/`],
            ['Embed', `${CF_STREAM_DOCS_URL}viewing/using-the-stream-player/`],
            ['Webhooks', `${CF_STREAM_DOCS_URL}stream-live/webhooks/`],
          ] as const
        ).map(([label, href]) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 0',
              borderBottom: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              textDecoration: 'none',
              fontSize: 12,
            }}
          >
            <span>{label}</span>
            <ExternalLink size={12} style={{ opacity: 0.6 }} />
          </a>
        ))}
      </div>
    </aside>
  );
}

export default VideosUsageSidebar;
