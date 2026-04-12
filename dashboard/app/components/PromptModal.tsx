/**
 * PromptModal.tsx — Voxel builder AI prompt modal
 * Inner Animal Media — Agent Sam Dashboard
 *
 * Zero Tailwind. Zero external animation libs.
 * All chrome via global.css tokens. Keyframes injected once at module load.
 * Multi-provider: Anthropic / OpenAI / Google
 *
 * onSubmit receives (prompt, provider, modelId) — wire to your
 * voxel generation endpoint or /api/agent/chat with agent_id.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Wand2, Hammer, Loader2, Sparkles, ChevronDown, Zap, Brain, Gauge } from 'lucide-react';

// ─── Keyframes (injected once, no tailwindcss-animate needed) ─────────────────

const KEYFRAMES = `
  @keyframes iam-backdrop-in {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes iam-modal-in {
    from { opacity: 0; transform: translateY(12px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }
  @keyframes iam-modal-out {
    from { opacity: 1; transform: translateY(0)    scale(1);    }
    to   { opacity: 0; transform: translateY(8px)  scale(0.98); }
  }
  @keyframes iam-spin {
    from { transform: rotate(0deg);   }
    to   { transform: rotate(360deg); }
  }
  @keyframes iam-pulse-dot {
    0%, 100% { opacity: 1;    transform: scale(1);    }
    50%       { opacity: 0.3; transform: scale(0.65); }
  }
  @keyframes iam-error-in {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
`;

let _keyframesInjected = false;
function injectKeyframes() {
  if (_keyframesInjected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.id = 'iam-modal-keyframes';
  el.textContent = KEYFRAMES;
  document.head.appendChild(el);
  _keyframesInjected = true;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoxelMode = 'create' | 'morph';
export type Provider  = 'anthropic' | 'openai' | 'google';
export type Capability = 'fast' | 'balanced' | 'powerful';

export interface ModelOption {
  id:         string;
  label:      string;
  context:    string;   // e.g. "200K"
  capability: Capability;
  note?:      string;   // e.g. "reasoning"
}

export interface ProviderConfig {
  id:     Provider;
  label:  string;
  color:  string;       // accent color for this provider
  models: ModelOption[];
}

export interface PromptModalProps {
  isOpen:          boolean;
  mode:            VoxelMode;
  onClose:         () => void;
  /** Receives full selection — wire to your generation endpoint */
  onSubmit:        (prompt: string, provider: Provider, modelId: string) => Promise<void>;
  defaultProvider?: Provider;
  defaultModel?:   string;
}

// ─── Provider / model registry ────────────────────────────────────────────────

const CAPABILITY_META: Record<Capability, { label: string; Icon: typeof Zap; color: string }> = {
  fast:     { label: 'Fast',      Icon: Zap,   color: 'var(--accent-secondary)' },
  balanced: { label: 'Balanced',  Icon: Gauge, color: 'var(--accent-primary)'   },
  powerful: { label: 'Powerful',  Icon: Brain, color: 'var(--accent-warning)'   },
};

export const PROVIDERS: ProviderConfig[] = [
  {
    id:    'anthropic',
    label: 'Claude',
    color: '#D97757',
    models: [
      { id: 'claude-opus-4-6',          label: 'Claude Opus 4.6',    context: '200K', capability: 'powerful'  },
      { id: 'claude-sonnet-4-6',        label: 'Claude Sonnet 4.6',  context: '200K', capability: 'balanced'  },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  context: '200K', capability: 'fast'      },
    ],
  },
  {
    id:    'openai',
    label: 'OpenAI',
    color: '#19C37D',
    models: [
      { id: 'o3',         label: 'o3',          context: '200K', capability: 'powerful', note: 'reasoning' },
      { id: 'gpt-4o',     label: 'GPT-4o',      context: '128K', capability: 'balanced'                   },
      { id: 'o4-mini',    label: 'o4-mini',     context: '128K', capability: 'balanced', note: 'reasoning' },
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', context: '128K', capability: 'fast'                      },
    ],
  },
  {
    id:    'google',
    label: 'Gemini',
    color: '#4A90D9',
    models: [
      { id: 'gemini-2.5-pro',   label: 'Gemini 2.5 Pro',   context: '1M',   capability: 'powerful' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', context: '1M',   capability: 'fast'     },
      { id: 'gemini-1.5-pro',   label: 'Gemini 1.5 Pro',   context: '2M',   capability: 'balanced' },
    ],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Inline SVG spinner — no Loader2 animation class needed */
function Spinner({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.5}
      strokeLinecap="round"
      style={{ animation: 'iam-spin 0.75s linear infinite', flexShrink: 0 }}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

/** Provider pill selector */
function ProviderTab({
  provider,
  active,
  onClick,
}: {
  provider: ProviderConfig;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:           6,
        padding:      '6px 12px',
        borderRadius: 'var(--radius-md)',
        border:       `1px solid ${active ? provider.color + '60' : 'var(--border-subtle)'}`,
        background:   active ? `${provider.color}18` : 'transparent',
        color:        active ? provider.color : 'var(--text-muted)',
        fontFamily:   'var(--font-sans)',
        fontSize:      12,
        fontWeight:    active ? 700 : 500,
        cursor:       'pointer',
        transition:   'background 0.15s, border-color 0.15s, color 0.15s',
        whiteSpace:   'nowrap',
      }}
    >
      {/* Provider dot */}
      <span style={{
        width:        6,
        height:       6,
        borderRadius: '50%',
        background:   active ? provider.color : 'var(--border-subtle)',
        flexShrink:   0,
        transition:   'background 0.15s',
        animation:    active ? 'iam-pulse-dot 2s ease infinite' : 'none',
      }} />
      {provider.label}
    </button>
  );
}

/** Model select dropdown — custom, no native <select> styling issues */
function ModelSelect({
  models,
  value,
  onChange,
  accentColor,
}: {
  models:      ModelOption[];
  value:       string;
  onChange:    (id: string) => void;
  accentColor: string;
}) {
  const [open, setOpen]   = useState(false);
  const wrapRef           = useRef<HTMLDivElement>(null);
  const selected          = models.find(m => m.id === value) ?? models[0];
  const { Icon, label: capLabel, color: capColor } = CAPABILITY_META[selected?.capability ?? 'balanced'];

  useEffect(() => {
    function outside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:             8,
          width:          '100%',
          padding:        '8px 12px',
          borderRadius:   'var(--radius-md)',
          border:         `1px solid ${open ? accentColor + '70' : 'var(--border-subtle)'}`,
          background:     'var(--bg-app)',
          color:          'var(--text-main)',
          fontFamily:     'var(--font-sans)',
          fontSize:        13,
          cursor:         'pointer',
          transition:     'border-color 0.15s',
          boxShadow:      open ? `0 0 0 3px ${accentColor}20` : 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <Icon size={13} color={capColor} strokeWidth={2.5} style={{ flexShrink: 0 }} />
          <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selected?.label ?? 'Select model'}
          </span>
          {selected?.note && (
            <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 'var(--radius-xs, 2px)', background: `${accentColor}20`, color: accentColor, fontWeight: 700, whiteSpace: 'nowrap' }}>
              {selected.note}
            </span>
          )}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {selected?.context}
          </span>
          <ChevronDown
            size={14}
            color="var(--text-muted)"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
          />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:     'absolute',
          top:          'calc(100% + 4px)',
          left:          0,
          right:         0,
          background:   'var(--bg-elevated)',
          border:       `1px solid ${accentColor}40`,
          borderRadius: 'var(--radius-md)',
          boxShadow:    '0 8px 28px rgba(0,0,0,0.4)',
          zIndex:        10,
          overflow:     'hidden',
        }}>
          {models.map(m => {
            const { Icon: MIcon, color: mColor } = CAPABILITY_META[m.capability];
            const isActive = m.id === value;
            return (
              <button
                key={m.id}
                onClick={() => { onChange(m.id); setOpen(false); }}
                style={{
                  display:     'flex',
                  alignItems:  'center',
                  gap:          10,
                  width:       '100%',
                  padding:     '9px 12px',
                  background:  isActive ? `${accentColor}14` : 'none',
                  border:      'none',
                  borderBottom: '1px solid var(--border-subtle)',
                  cursor:      'pointer',
                  fontFamily:  'var(--font-sans)',
                  textAlign:   'left',
                  transition:  'background 0.1s',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'none'; }}
              >
                <MIcon size={13} color={mColor} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--text-heading)' : 'var(--text-main)' }}>
                  {m.label}
                </span>
                {m.note && (
                  <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', padding: '1px 5px', borderRadius: 'var(--radius-xs, 2px)', background: `${accentColor}20`, color: accentColor, fontWeight: 700 }}>
                    {m.note}
                  </span>
                )}
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {m.context}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── PromptModal ──────────────────────────────────────────────────────────────

export const PromptModal: React.FC<PromptModalProps> = ({
  isOpen,
  mode,
  onClose,
  onSubmit,
  defaultProvider = 'anthropic',
  defaultModel,
}) => {
  injectKeyframes();

  const [prompt,      setPrompt]    = useState('');
  const [error,       setError]     = useState('');
  const [isLoading,   setIsLoading] = useState(false);
  const [provider,    setProvider]  = useState<Provider>(defaultProvider);
  const [modelId,     setModelId]   = useState<string>('');
  const [closing,     setClosing]   = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const providerCfg = PROVIDERS.find(p => p.id === provider) ?? PROVIDERS[0];

  // Sync default model when provider changes
  useEffect(() => {
    const firstModel = providerCfg.models[0]?.id ?? '';
    setModelId(defaultModel && providerCfg.models.find(m => m.id === defaultModel)
      ? defaultModel
      : firstModel
    );
  }, [provider, defaultModel]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setPrompt('');
      setError('');
      setIsLoading(false);
      setClosing(false);
      setProvider(defaultProvider);
      setTimeout(() => textareaRef.current?.focus(), 120);
    }
  }, [isOpen, defaultProvider]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !isLoading) handleClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, isLoading]);

  const handleClose = useCallback(() => {
    if (isLoading) return;
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 180);
  }, [isLoading, onClose]);

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!prompt.trim() || isLoading) return;
    setIsLoading(true);
    setError('');
    try {
      await onSubmit(prompt.trim(), provider, modelId);
      setPrompt('');
      handleClose();
    } catch (err) {
      console.error('[PromptModal]', err);
      setError(err instanceof Error ? err.message : 'Generation failed. Check provider config and retry.');
    } finally {
      setIsLoading(false);
    }
  }, [prompt, isLoading, provider, modelId, onSubmit, handleClose]);

  if (!isOpen && !closing) return null;

  const isCreate         = mode === 'create';
  const modeColor        = isCreate ? 'var(--accent-primary)' : 'var(--accent-warning)';
  const ModeIcon         = isCreate ? Wand2 : Hammer;

  const PLACEHOLDER = isCreate
    ? 'e.g., A medieval fortress, a giant mech, a coral reef ecosystem...'
    : 'e.g., Turn it into a rocket, make it a cathedral, rebuild as a cityscape...';

  const DESCRIPTION = isCreate
    ? 'Describe the voxel structure to generate from scratch.'
    : 'Describe how to rebuild or transform the current voxels.';

  return (
    <div
      aria-modal="true"
      role="dialog"
      aria-label={isCreate ? 'New voxel build' : 'Rebuild voxels'}
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
      style={{
        position:       'fixed',
        inset:           0,
        zIndex:          1000,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '16px',
        background:     'rgba(0, 33, 43, 0.72)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation:      closing
          ? 'iam-backdrop-in 0.18s ease reverse forwards'
          : 'iam-backdrop-in 0.2s ease forwards',
        fontFamily:     'var(--font-sans)',
      }}
    >
      <div
        style={{
          width:           '100%',
          maxWidth:         480,
          background:      'var(--bg-panel)',
          border:          `1px solid ${providerCfg.color}30`,
          borderTop:       `3px solid ${providerCfg.color}`,
          borderRadius:    'var(--radius-xl)',
          boxShadow:       `0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px var(--border-subtle)`,
          overflow:        'hidden',
          animation:       closing
            ? 'iam-modal-out 0.18s cubic-bezier(0.4,0,1,1) forwards'
            : 'iam-modal-in  0.22s cubic-bezier(0.16,1,0.3,1) forwards',
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '16px 18px 14px',
          borderBottom:   '1px solid var(--border-subtle)',
          background:     'var(--bg-elevated)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Mode icon */}
            <div style={{
              width:          34,
              height:          34,
              borderRadius:   'var(--radius-md)',
              background:     `${modeColor.includes('var') ? '' : modeColor}`,
              backgroundImage: `linear-gradient(135deg, ${isCreate ? 'var(--accent-primary)' : 'var(--accent-warning)'}22, ${isCreate ? 'var(--accent-secondary)' : 'var(--solar-orange, #d95f1c)'}18)`,
              border:         `1px solid ${isCreate ? 'var(--accent-primary)' : 'var(--accent-warning)'}40`,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexShrink:      0,
            }}>
              <ModeIcon
                size={16}
                strokeWidth={2.5}
                color={isCreate ? 'var(--accent-primary)' : 'var(--accent-warning)'}
              />
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-heading)', letterSpacing: '-0.01em' }}>
                {isCreate ? 'New Build' : 'Rebuild Voxels'}
              </div>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 1, letterSpacing: '0.06em' }}>
                {isCreate ? 'VOXEL GENERATOR' : 'VOXEL TRANSFORMER'}
              </div>
            </div>
          </div>

          <button
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Close"
            style={{
              width:          28,
              height:          28,
              borderRadius:   'var(--radius-sm)',
              border:         '1px solid var(--border-subtle)',
              background:     'transparent',
              color:          'var(--text-muted)',
              cursor:         isLoading ? 'default' : 'pointer',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              opacity:        isLoading ? 0.35 : 1,
              transition:     'color 0.15s, border-color 0.15s, background 0.15s',
              flexShrink:      0,
            }}
            onMouseEnter={e => { if (!isLoading) { (e.currentTarget as HTMLElement).style.color = 'var(--text-main)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-muted)'; } }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}
          >
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Body ── */}
        <form onSubmit={handleSubmit} style={{ padding: '18px' }}>

          {/* Provider selector */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 7 }}>
              Provider
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PROVIDERS.map(p => (
                <ProviderTab
                  key={p.id}
                  provider={p}
                  active={provider === p.id}
                  onClick={() => setProvider(p.id)}
                />
              ))}
            </div>
          </div>

          {/* Model selector */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 7 }}>
              Model
            </label>
            <ModelSelect
              models={providerCfg.models}
              value={modelId}
              onChange={setModelId}
              accentColor={providerCfg.color}
            />
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 16 }} />

          {/* Prompt label */}
          <label
            htmlFor="voxel-prompt"
            style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8 }}
          >
            {DESCRIPTION}
          </label>

          {/* Prompt textarea */}
          <textarea
            id="voxel-prompt"
            ref={textareaRef}
            value={prompt}
            onChange={e => { setPrompt(e.target.value); if (error) setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit(); } }}
            placeholder={PLACEHOLDER}
            disabled={isLoading}
            rows={4}
            style={{
              width:        '100%',
              padding:      '10px 12px',
              borderRadius: 'var(--radius-md)',
              border:       `1px solid ${error ? 'var(--accent-danger)' : 'var(--border-subtle)'}`,
              background:   'var(--bg-app)',
              color:        'var(--text-main)',
              fontFamily:   'var(--font-sans)',
              fontSize:      13,
              lineHeight:    1.55,
              resize:       'vertical',
              outline:      'none',
              boxSizing:    'border-box',
              opacity:      isLoading ? 0.5 : 1,
              transition:   'border-color 0.15s, box-shadow 0.15s',
            }}
            onFocus={e  => { if (!error) { e.target.style.borderColor = providerCfg.color + '80'; e.target.style.boxShadow = `0 0 0 3px ${providerCfg.color}18`; } }}
            onBlur={e   => { e.target.style.borderColor = error ? 'var(--accent-danger)' : 'var(--border-subtle)'; e.target.style.boxShadow = 'none'; }}
          />

          {/* Char hint */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, marginBottom: error ? 10 : 16 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: prompt.length > 800 ? 'var(--accent-warning)' : 'var(--text-muted)', opacity: 0.6 }}>
              {prompt.length} / 1000
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              display:      'flex',
              alignItems:   'flex-start',
              gap:           8,
              padding:      '9px 12px',
              marginBottom:  16,
              borderRadius: 'var(--radius-md)',
              background:   'rgba(230, 51, 51, 0.08)',
              border:       '1px solid rgba(230, 51, 51, 0.25)',
              animation:    'iam-error-in 0.18s ease forwards',
            }}>
              <X size={13} color="var(--accent-danger)" strokeWidth={3} style={{ marginTop: 1, flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--accent-danger)', fontWeight: 600, lineHeight: 1.4 }}>
                {error}
              </span>
            </div>
          )}

          {/* Footer: provider note + actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Active provider note */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: providerCfg.color, flexShrink: 0, animation: 'iam-pulse-dot 2s ease infinite' }} />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {providerCfg.label} · {PROVIDERS.find(p => p.id === provider)?.models.find(m => m.id === modelId)?.label ?? modelId}
              </span>
            </div>

            {/* Cancel */}
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              style={{
                padding:      '8px 14px',
                borderRadius: 'var(--radius-md)',
                border:       '1px solid var(--border-subtle)',
                background:   'transparent',
                color:        'var(--text-muted)',
                fontFamily:   'var(--font-sans)',
                fontSize:      13,
                fontWeight:    500,
                cursor:       isLoading ? 'default' : 'pointer',
                opacity:      isLoading ? 0.4 : 1,
                transition:   'background 0.15s, color 0.15s',
                flexShrink:    0,
              }}
              onMouseEnter={e => { if (!isLoading) { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-main)'; } }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              Cancel
            </button>

            {/* Generate */}
            <button
              type="submit"
              disabled={!prompt.trim() || isLoading || prompt.length > 1000}
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:           6,
                padding:      '8px 18px',
                borderRadius: 'var(--radius-md)',
                border:       'none',
                background:   !prompt.trim() || isLoading
                  ? 'var(--bg-elevated)'
                  : providerCfg.color,
                color:        !prompt.trim() || isLoading ? 'var(--text-muted)' : '#fff',
                fontFamily:   'var(--font-sans)',
                fontSize:      13,
                fontWeight:    700,
                cursor:       !prompt.trim() || isLoading ? 'default' : 'pointer',
                transition:   'background 0.2s, color 0.2s, opacity 0.15s, transform 0.1s',
                flexShrink:    0,
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => { if (prompt.trim() && !isLoading) (e.currentTarget as HTMLElement).style.opacity = '0.88'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              onMouseDown={e  => { if (prompt.trim() && !isLoading) (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
              onMouseUp={e    => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
              {isLoading ? (
                <>
                  <Spinner size={14} color="var(--text-muted)" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles size={14} fill="currentColor" strokeWidth={0} />
                  Generate
                </>
              )}
            </button>
          </div>

          {/* Keyboard hint */}
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', opacity: 0.45 }}>
              Cmd+Enter to generate · Esc to close
            </span>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PromptModal;
