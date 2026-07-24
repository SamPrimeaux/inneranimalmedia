import React, { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import type { ImagesOutletContext } from './ImagesShell';
import { ImagesToastStack } from './ImagesUsageAccountSidebar';
import { useImagesToast } from './imagesApi';

const FIT_OPTIONS = ['scale-down', 'contain', 'cover', 'crop', 'pad'] as const;
const METADATA_OPTIONS = ['none', 'keep', 'copyright'] as const;

export function ImagesDeliveryVariantCreatePage() {
  useOutletContext<ImagesOutletContext>();
  const navigate = useNavigate();
  const { toasts, add: toast } = useImagesToast();

  const [variantId, setVariantId] = useState('');
  const [width, setWidth] = useState('400');
  const [height, setHeight] = useState('400');
  const [fit, setFit] = useState<(typeof FIT_OPTIONS)[number]>('scale-down');
  const [metadata, setMetadata] = useState<(typeof METADATA_OPTIONS)[number]>('none');
  const [watermark, setWatermark] = useState(false);
  const [publicAccess, setPublicAccess] = useState(true);

  const onCreate = () => {
    const id = variantId.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!id) {
      toast('Enter a variant id', 'err');
      return;
    }
    // Named variants are account-level in Cloudflare Images (dashboard / API), not per-image.
    // IAM does not yet proxy CF variant create — document via toast.
    toast(
      `Variants are account-level in Cloudflare Images. Create “${id}” (${width}×${height}, fit=${fit}) in the CF dashboard or Images API.`,
    );
  };

  const fieldLabel: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    color: 'var(--text-muted)',
    marginBottom: 5,
    fontWeight: 500,
  };

  const input: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border-subtle)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-main)',
    fontSize: 13,
    fontFamily: 'inherit',
    outline: 'none',
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 24px 32px' }}>
      <Link
        to="/dashboard/images/delivery"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: 'var(--text-muted)',
          textDecoration: 'none',
          marginBottom: 14,
        }}
      >
        <ChevronLeft size={14} />
        Delivery
      </Link>

      <h2 style={{ margin: '0 0 18px', fontSize: 18, fontWeight: 600 }}>Create a variant</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 420px) 1fr',
          gap: 24,
          alignItems: 'start',
        }}
      >
        {/* Configuration — CF create-variant layout */}
        <div
          style={{
            padding: 20,
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Configuration</div>

          <label style={fieldLabel}>Variant ID</label>
          <input
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            placeholder="e.g. product_thumb"
            style={{ ...input, marginBottom: 14 }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Width</label>
              <input
                type="number"
                min={1}
                max={4096}
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                style={input}
              />
            </div>
            <div>
              <label style={fieldLabel}>Height</label>
              <input
                type="number"
                min={1}
                max={4096}
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                style={input}
              />
            </div>
          </div>

          <label style={fieldLabel}>Fit</label>
          <select
            value={fit}
            onChange={(e) => setFit(e.target.value as (typeof FIT_OPTIONS)[number])}
            style={{ ...input, marginBottom: 14, cursor: 'pointer' }}
          >
            {FIT_OPTIONS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>

          <label style={fieldLabel}>Metadata</label>
          <select
            value={metadata}
            onChange={(e) => setMetadata(e.target.value as (typeof METADATA_OPTIONS)[number])}
            style={{ ...input, marginBottom: 14, cursor: 'pointer' }}
          >
            {METADATA_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text-main)',
              marginBottom: 10,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={watermark}
              onChange={(e) => setWatermark(e.target.checked)}
            />
            Watermark
          </label>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text-main)',
              marginBottom: 20,
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={publicAccess}
              onChange={(e) => setPublicAccess(e.target.checked)}
            />
            Public access
          </label>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => navigate('/dashboard/images/delivery')}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                color: 'var(--text-muted)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onCreate}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--solar-cyan)',
                color: '#000',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Create
            </button>
          </div>
        </div>

        {/* Preview panel */}
        <div
          style={{
            padding: 20,
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            minHeight: 360,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Preview</div>
          <div
            style={{
              flex: 1,
              borderRadius: 8,
              border: '1px dashed var(--border-subtle)',
              background: 'var(--bg-panel)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              fontSize: 12,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ marginBottom: 8 }}>
                {width || '—'} × {height || '—'} · fit={fit}
              </div>
              <div style={{ fontSize: 11 }}>
                Named variant preview requires an account-level definition in Cloudflare Images.
              </div>
            </div>
          </div>
        </div>
      </div>

      <ImagesToastStack toasts={toasts} />
    </div>
  );
}

export default ImagesDeliveryVariantCreatePage;
