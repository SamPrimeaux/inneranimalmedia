import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { parseTemplateMeta } from './templatePreview';
import type { CmsTemplateRow } from './templatePreview';

export type TokenDef = {
  key: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  default: number;
  unit?: string;
};

const DEFAULT_LOADING_TOKENS: TokenDef[] = [
  { key: '--iam-speed', label: 'Speed', min: 0.4, max: 2.4, step: 0.05, default: 1 },
  { key: '--iam-glow', label: 'Glow', min: 0, max: 1, step: 0.05, default: 0.55 },
  { key: '--iam-scale', label: 'Scale', min: 0.7, max: 1.4, step: 0.02, default: 1 },
  { key: '--iam-density', label: 'Density', min: 0.5, max: 1.5, step: 0.05, default: 1 },
];

function tokensFromMeta(meta: Record<string, unknown>): TokenDef[] {
  const raw = meta.tokens ?? meta.css_tokens ?? meta.tunable;
  if (!raw || typeof raw !== 'object') return DEFAULT_LOADING_TOKENS;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (!entries.length) return DEFAULT_LOADING_TOKENS;
  return entries.map(([key, val]) => {
    const v = val && typeof val === 'object' ? (val as Record<string, unknown>) : {};
    return {
      key: key.startsWith('--') ? key : `--${key}`,
      label: String(v.label || key.replace(/^--iam-|^--/, '').replace(/-/g, ' ')),
      min: Number(v.min ?? 0),
      max: Number(v.max ?? 100),
      step: Number(v.step ?? 1),
      default: Number(v.default ?? v.value ?? 50),
      unit: v.unit ? String(v.unit) : undefined,
    } satisfies TokenDef;
  });
}

export type TemplateLiveControlsProps = {
  template: CmsTemplateRow | null;
  values: Record<string, number>;
  onChange: (key: string, value: number) => void;
  onReset?: () => void;
};

export function resolveTemplateTokenDefs(template: CmsTemplateRow | null): TokenDef[] {
  if (!template) return DEFAULT_LOADING_TOKENS;
  return tokensFromMeta(parseTemplateMeta(template));
}

export function buildDefaultTokenValues(defs: TokenDef[]): Record<string, number> {
  return Object.fromEntries(defs.map((d) => [d.key, d.default]));
}

export function cssVarsFromValues(values: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)]));
}

export function useTemplateLiveControls(template: CmsTemplateRow | null) {
  const defs = useMemo(() => resolveTemplateTokenDefs(template), [template]);
  const templateKey = template?.id ?? template?.slug ?? '';
  const [values, setValues] = useState<Record<string, number>>(() => buildDefaultTokenValues(defs));

  useEffect(() => {
    setValues(buildDefaultTokenValues(defs));
  }, [templateKey, defs]);

  const reset = useCallback(() => {
    setValues(buildDefaultTokenValues(defs));
  }, [defs]);

  const onChange = useCallback((key: string, value: number) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  return { defs, values, onChange, reset, cssVars: cssVarsFromValues(values) };
}

export function TemplateLiveControls({
  template,
  values,
  onChange,
  onReset,
}: TemplateLiveControlsProps): ReactNode {
  const defs = resolveTemplateTokenDefs(template);
  if (!defs.length) return null;

  return (
    <div className="pt-live-controls">
      <div className="pt-live-controls__head">
        <span className="pt-label">Live controls</span>
        {onReset ? (
          <button type="button" className="pt-btn" style={{ height: 28, padding: '0 10px', fontSize: 11 }} onClick={onReset}>
            Reset
          </button>
        ) : null}
      </div>
      <div className="pt-live-controls__grid">
        {defs.map((def) => {
          const val = values[def.key] ?? def.default;
          return (
            <label key={def.key} className="pt-live-control">
              <div className="pt-live-control__row">
                <span>{def.label}</span>
                <span className="pt-live-control__val">
                  {val.toFixed(def.step != null && def.step < 1 ? 2 : 0)}
                  {def.unit ? def.unit : ''}
                </span>
              </div>
              <input
                type="range"
                min={def.min}
                max={def.max}
                step={def.step ?? 1}
                value={val}
                onChange={(e) => onChange(def.key, Number(e.target.value))}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}
