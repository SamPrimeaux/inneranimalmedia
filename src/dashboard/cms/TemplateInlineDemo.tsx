import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CadJobPhase } from '@/components/designstudio/shared/cadJobPhase';
import type { ModePresenceIconKey } from '@/features/mode-presence/agentModePresenceMap';
import '@/components/designstudio/cad-studio/cad-studio.css';

const InlineJobProgress = lazy(() =>
  import('@/components/designstudio/shared/InlineJobProgress').then((m) => ({
    default: m.InlineJobProgress,
  })),
);

type DemoStep = {
  iconKey: ModePresenceIconKey;
  label: string;
  detail: string;
  progress: number;
  status: CadJobPhase['status'];
};

const DEFAULT_MESHY_STEPS: DemoStep[] = [
  {
    iconKey: 'agent-spark',
    label: 'Creating your model',
    detail: 'Building mesh from prompt',
    progress: 18,
    status: 'creating',
  },
  {
    iconKey: 'path',
    label: 'Sculpting geometry',
    detail: 'Refining surface topology',
    progress: 42,
    status: 'creating',
  },
  {
    iconKey: 'pixel',
    label: 'Applying textures',
    detail: 'Refining surface and materials',
    progress: 68,
    status: 'creating',
  },
  {
    iconKey: 'files',
    label: 'Saving to library',
    detail: 'Uploading asset to storage',
    progress: 88,
    status: 'uploading',
  },
  {
    iconKey: 'done-bloom',
    label: 'Model ready',
    detail: 'Asset is in your library',
    progress: 100,
    status: 'complete',
  },
];

const TERMINAL_STEPS: DemoStep[] = [
  {
    iconKey: 'agent-spark',
    label: 'Starting CAD runner',
    detail: 'OpenSCAD job queued',
    progress: 22,
    status: 'creating',
  },
  {
    iconKey: 'terminal',
    label: 'Running OpenSCAD',
    detail: 'Generating mesh from script',
    progress: 55,
    status: 'creating',
  },
  {
    iconKey: 'files',
    label: 'Saving to library',
    detail: 'Uploading GLB to storage',
    progress: 82,
    status: 'uploading',
  },
  {
    iconKey: 'done-bloom',
    label: 'Model ready',
    detail: 'Asset is in your library',
    progress: 100,
    status: 'complete',
  },
];

function stepsFromMeta(meta: Record<string, unknown>): DemoStep[] {
  const slug = String(meta.slug || '').toLowerCase();
  if (slug.includes('terminal') || String(meta.title || '').toLowerCase().includes('terminal')) {
    return TERMINAL_STEPS;
  }
  if (slug.includes('offline') || meta.icon === 'error-signal' || meta.presence_state === 'offline') {
    return [
      {
        iconKey: 'error-signal',
        label: 'Network paused',
        detail: 'Agent Sam will resume when you reconnect',
        progress: 0,
        status: 'failed',
      },
    ];
  }
  const phases = meta.phases;
  if (Array.isArray(phases) && phases.length) {
    const labels = [
      'Creating your model',
      'Sculpting geometry',
      'Applying textures',
      'Saving to library',
      'Model ready',
    ];
    const details = [
      'Building mesh from prompt',
      'Refining surface topology',
      'Refining surface and materials',
      'Uploading asset to storage',
      'Asset is in your library',
    ];
    return phases.map((icon, i) => {
      const iconKey = String(icon) as ModePresenceIconKey;
      const isLast = i === phases.length - 1;
      const isError = iconKey === 'error-signal';
      return {
        iconKey,
        label: isError ? 'Generation stopped' : labels[i] || 'Working…',
        detail: isError ? 'Job failed before completing' : details[i] || '',
        progress: isLast && !isError ? 100 : Math.min(92, 12 + i * 18),
        status: isError ? 'failed' : isLast ? 'complete' : i >= phases.length - 2 ? 'uploading' : 'creating',
      } satisfies DemoStep;
    });
  }
  return DEFAULT_MESHY_STEPS;
}

export function TemplateInlineDemo({
  meta,
  compact = false,
}: {
  meta: Record<string, unknown>;
  compact?: boolean;
}): ReactNode {
  const steps = useMemo(() => stepsFromMeta(meta), [meta]);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (steps.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setIdx((current) => (current + 1) % steps.length);
    }, 2400);
    return () => window.clearInterval(timer);
  }, [steps.length]);

  const step = steps[idx];
  const phase: CadJobPhase = {
    iconKey: step.iconKey,
    label: step.label,
    detail: step.detail,
    progress: step.progress,
    status: step.status,
  };

  return (
    <div className="pt-inline-demo">
      <Suspense fallback={<div className="pt-inline-demo__loading">Loading component preview…</div>}>
        <InlineJobProgress phase={phase} compact={compact} />
      </Suspense>
      {steps.length > 1 ? (
        <p className="pt-inline-demo__hint">Live demo — cycles through pipeline phases</p>
      ) : null}
    </div>
  );
}
