import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Link as LinkIcon } from 'lucide-react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { ImagesOutletContext } from './ImagesShell';
import { ImagesToastStack } from './ImagesUsageAccountSidebar';
import { Dropdown, type DropdownOption } from './Dropdown';
import {
  imagesDetailUrl,
  imagesPreviewUrl,
  imagesTransformUrl,
  useImagesToast,
} from './imagesApi';

const DOCS_URL = 'https://developers.cloudflare.com/images/optimization/binding/';

/**
 * See the fit-options note in ImagesDeliveryVariantCreatePage.tsx — scale-down,
 * contain, cover, crop, pad, scale-up are documented; stretch matches the CF
 * dashboard's own dropdown but is unconfirmed against the documented API schema.
 */
const FIT_OPTIONS: DropdownOption[] = [
  { value: 'scale-down', label: 'Scale down' },
  { value: 'contain', label: 'Contain' },
  { value: 'cover', label: 'Cover' },
  { value: 'crop', label: 'Crop' },
  { value: 'pad', label: 'Pad' },
  { value: 'stretch', label: 'Stretch' },
  { value: 'scale-up', label: 'Scale up' },
];

const FORMAT_OPTIONS: DropdownOption[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'webp', label: 'WebP' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'png', label: 'PNG' },
  { value: 'avif', label: 'AVIF' },
];

type OpsState = {
  width: string;
  height: string;
  fit: string;
  brightness: string;
  contrast: string;
  rotate: string;
  format: string;
  quality: string;
  watermark: boolean;
};

const DEFAULT_OPS: OpsState = {
  width: '',
  height: '',
  fit: 'scale-down',
  brightness: '1',
  contrast: '1',
  rotate: '0',
  format: 'webp',
  quality: '85',
  watermark: false,
};

function opsToRecord(ops: OpsState): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (ops.width) out.width = Number(ops.width);
  if (ops.height) out.height = Number(ops.height);
  if (ops.fit) out.fit = ops.fit;
  if (ops.brightness !== '' && ops.brightness !== '1') out.brightness = Number(ops.brightness);
  if (ops.contrast !== '' && ops.contrast !== '1') out.contrast = Number(ops.contrast);
  if (ops.rotate && ops.rotate !== '0') out.rotate = Number(ops.rotate);
  if (ops.format && ops.format !== 'auto') out.format = ops.format;
  if (ops.quality) out.quality = Number(ops.quality);
  return out;
}

export function ImagesEditPage() {
  const { id } = useParams<{ id: string }>();
  const { workspaceId, setDocsUrl } = useOutletContext<ImagesOutletContext>();
  const navigate = useNavigate();
  const { toasts, add: toast } = useImagesToast();

  useEffect(() => {
    setDocsUrl(DOCS_URL);
    return () => setDocsUrl(null);
  }, [setDocsUrl]);

  const [filename, setFilename] = useState('');
  const [ops, setOps] = useState<OpsState>(DEFAULT_OPS);
  const [previewSrc, setPreviewSrc] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newId, setNewId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(imagesDetailUrl(id, workspaceId), { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => {
        const row = d.item || d.image || d;
        if (row?.filename) setFilename(String(row.filename));
        if (row?.url) setPreviewSrc(String(row.url));
      })
      .catch(() => {});
  }, [id, workspaceId]);

  const previewQueryUrl = useMemo(() => {
    if (!id) return '';
    const record = opsToRecord(ops);
    if (ops.watermark) {
      // watermark is a query flag on preview-url, not an op key
    }
    const base = imagesPreviewUrl(id, record, workspaceId);
    if (!ops.watermark) return base;
    return base.includes('?') ? `${base}&watermark=1` : `${base}?watermark=1`;
  }, [id, ops, workspaceId]);

  useEffect(() => {
    if (!id || !previewQueryUrl) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setPreviewBusy(true);
      // Streamed binding preview: use the URL directly as img src (credentials via same-origin).
      // If mode=delivery JSON is preferred later, branch here.
      const src = previewQueryUrl;
      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          setPreviewSrc(src);
          setPreviewBusy(false);
        }
      };
      img.onerror = () => {
        if (!cancelled) {
          // Keep prior preview; surface soft fail
          setPreviewBusy(false);
        }
      };
      img.src = src;
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [id, previewQueryUrl]);

  const set =
    (key: keyof OpsState) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
      setOps((p) => ({ ...p, [key]: val }));
    };

  const onSave = async () => {
    if (!id) return;
    setSaving(true);
    setNewId(null);
    try {
      const body = {
        ops: opsToRecord(ops),
        mode: 'derivative' as const,
        watermark: ops.watermark,
      };
      const r = await fetch(imagesTransformUrl(id, workspaceId), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok || d.error) {
        toast(d.error || `Transform failed (${r.status})`, 'err');
        return;
      }
      const row = d.item || d.image;
      const nid = row?.id ? String(row.id) : null;
      setNewId(nid);
      toast(nid ? `Derivative saved` : 'Transform saved');
    } catch (e: unknown) {
      toast(e instanceof Error ? e.message : 'Transform failed', 'err');
    } finally {
      setSaving(false);
    }
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

  if (!id) {
    return <div style={{ padding: 24, color: '#f87171' }}>Missing image id</div>;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '16px 24px 32px' }}>
      <Link
        to={`/dashboard/images/${encodeURIComponent(id)}`}
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
        {filename || id}
      </Link>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 18,
          flexWrap: 'wrap',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>Edit image</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => navigate(`/dashboard/images/${encodeURIComponent(id)}`)}
            style={{
              padding: '8px 12px',
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
            disabled={saving}
            onClick={() => void onSave()}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--solar-cyan)',
              color: '#000',
              fontSize: 12,
              fontWeight: 600,
              cursor: saving ? 'wait' : 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {saving ? 'Saving…' : 'Save derivative'}
          </button>
        </div>
      </div>

      {newId && (
        <div
          style={{
            marginBottom: 14,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid color-mix(in srgb, var(--solar-cyan) 40%, var(--border-subtle))',
            background: 'color-mix(in srgb, var(--solar-cyan) 8%, var(--bg-panel))',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <LinkIcon size={13} style={{ color: 'var(--solar-cyan)' }} />
          Derivative created:{' '}
          <Link
            to={`/dashboard/images/${encodeURIComponent(newId)}`}
            style={{ color: 'var(--solar-cyan)', fontWeight: 600 }}
          >
            {newId}
          </Link>
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 400px) 1fr',
          gap: 24,
          alignItems: 'start',
        }}
      >
        <div
          style={{
            padding: 20,
            borderRadius: 12,
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-panel)',
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>Configuration</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Width</label>
              <input type="number" min={1} max={4096} value={ops.width} onChange={set('width')} style={input} placeholder="auto" />
            </div>
            <div>
              <label style={fieldLabel}>Height</label>
              <input type="number" min={1} max={4096} value={ops.height} onChange={set('height')} style={input} placeholder="auto" />
            </div>
          </div>

          <label style={fieldLabel}>Fit</label>
          <div style={{ marginBottom: 14 }}>
            <Dropdown
              value={ops.fit}
              options={FIT_OPTIONS}
              onChange={(v) => setOps((p) => ({ ...p, fit: v }))}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Brightness</label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.05}
                value={ops.brightness}
                onChange={set('brightness')}
                style={input}
              />
            </div>
            <div>
              <label style={fieldLabel}>Contrast</label>
              <input
                type="number"
                min={0}
                max={2}
                step={0.05}
                value={ops.contrast}
                onChange={set('contrast')}
                style={input}
              />
            </div>
          </div>

          <label style={fieldLabel}>Rotate</label>
          <input
            type="number"
            min={0}
            max={359}
            value={ops.rotate}
            onChange={set('rotate')}
            style={{ ...input, marginBottom: 14 }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Format</label>
              <Dropdown
                value={ops.format}
                options={FORMAT_OPTIONS}
                onChange={(v) => setOps((p) => ({ ...p, format: v }))}
              />
            </div>
            <div>
              <label style={fieldLabel}>Quality</label>
              <input
                type="number"
                min={1}
                max={100}
                value={ops.quality}
                onChange={set('quality')}
                style={input}
              />
            </div>
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              color: 'var(--text-main)',
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={ops.watermark} onChange={set('watermark')} />
            Watermark
          </label>
        </div>

        {/* Preview panel — image renders directly, edge-to-edge, no nested "card" box */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>Preview</div>
            {previewBusy && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updating…</span>
            )}
          </div>
          {previewSrc ? (
            <img
              key={previewSrc}
              src={previewSrc}
              alt="Transform preview"
              style={{
                display: 'block',
                width: '100%',
                maxHeight: 620,
                objectFit: 'cover',
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
              }}
            />
          ) : (
            <div
              style={{
                borderRadius: 12,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-elevated)',
                minHeight: 320,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text-muted)',
                fontSize: 12,
              }}
            >
              No preview
            </div>
          )}
        </div>
      </div>

      <ImagesToastStack toasts={toasts} />
    </div>
  );
}

export default ImagesEditPage;
