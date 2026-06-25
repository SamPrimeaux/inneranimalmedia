import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { InlineCadJobProgressLive } from '@/components/designstudio/shared/InlineCadJobProgressLive';
import type { CadJobPhase } from '@/components/designstudio/shared/cadJobPhase';
import type { ModePresenceIconKey } from '@/features/mode-presence/agentModePresenceMap';
import '@/components/designstudio/cad-studio/cad-studio.css';

const InlineJobProgress = lazy(() =>
  import('@/components/designstudio/shared/InlineJobProgress').then((m) => ({
    default: m.InlineJobProgress,
  })),
);

function isCadLiveTemplate(meta: Record<string, unknown>): boolean {
  const slug = String(meta.slug || '').toLowerCase();
  const title = String(meta.title || '').toLowerCase();
  if (meta.live_source === 'agentsam_cad_jobs') return true;
  if (slug.includes('terminal') || slug.includes('inline-terminal')) return true;
  if (slug.includes('meshy') || slug.includes('inline-meshy')) return true;
  if (title.includes('terminal cad') || title.includes('openscad')) return true;
  return false;
}

function preferTerminalEngine(meta: Record<string, unknown>): boolean {
  const slug = String(meta.slug || '').toLowerCase();
  return slug.includes('terminal') || slug.includes('openscad');
}

type DemoStep = {
  iconKey: ModePresenceIconKey;
  label: string;
  detail: string;
  progress: number;
  status: CadJobPhase['status'];
};

export function TemplateInlineDemo({
  meta,
  compact = false,
  manual = false,
  jobId = null,
  live = true,
}: {
  meta: Record<string, unknown>;
  compact?: boolean;
  manual?: boolean;
  jobId?: string | null;
  /** When true, CAD templates poll agentsam_cad_jobs instead of static demo steps. */
  live?: boolean;
}): ReactNode {
  const slug = String(meta.slug || '').toLowerCase();

  if (slug.includes('offline') || meta.icon === 'error-signal' || meta.presence_state === 'offline') {
    const step: DemoStep = {
      iconKey: 'error-signal',
      label: 'Network paused',
      detail: 'Agent Sam will resume when you reconnect',
      progress: 0,
      status: 'failed',
    };
    const phase: CadJobPhase = {
      iconKey: step.iconKey,
      label: step.label,
      detail: step.detail,
      progress: step.progress,
      status: step.status,
    };
    return (
      <div className="pt-inline-demo">
        <Suspense fallback={<div className="pt-inline-demo__loading">Loading…</div>}>
          <InlineJobProgress phase={phase} compact={compact} />
        </Suspense>
      </div>
    );
  }

  if (live && isCadLiveTemplate(meta)) {
    return (
      <div className="pt-inline-demo pt-inline-demo--live">
        <InlineCadJobProgressLive
          jobId={jobId}
          autoSelect={!jobId}
          preferTerminal={preferTerminalEngine(meta)}
          compact={compact}
          pollRealtime
        />
        {!jobId ? (
          <p className="pt-inline-demo__hint">
            Live — polling <code>agentsam_cad_jobs.progress_pct</code> every ~1.2s
          </p>
        ) : null}
      </div>
    );
  }

  return <StaticTemplateDemo meta={meta} compact={compact} manual={manual} />;
}

function StaticTemplateDemo({
  meta,
  compact,
  manual,
}: {
  meta: Record<string, unknown>;
  compact: boolean;
  manual: boolean;
}) {
  const steps = useMemo(() => staticStepsFromMeta(meta), [meta]);
  const [idx, setIdx] = useState(0);
  const step = steps[Math.min(idx, steps.length - 1)];
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
      {manual && steps.length > 1 ? (
        <label className="pt-inline-demo__phase-control">
          <span className="pt-inline-demo__hint">
            Static preview · phase {idx + 1} / {steps.length}
          </span>
          <input
            type="range"
            min={0}
            max={steps.length - 1}
            step={1}
            value={idx}
            onChange={(e) => setIdx(Number(e.target.value))}
          />
        </label>
      ) : null}
    </div>
  );
}

function staticStepsFromMeta(meta: Record<string, unknown>): DemoStep[] {
  const phases = meta.phases;
  if (Array.isArray(phases) && phases.length) {
    return phases.map((icon, i) => ({
      iconKey: String(icon) as ModePresenceIconKey,
      label: 'Preview phase',
      detail: String(icon),
      progress: Math.min(100, 10 + i * 20),
      status: (i === phases.length - 1 ? 'complete' : 'creating') as CadJobPhase['status'],
    }));
  }
  return [
    {
      iconKey: 'agent-spark',
      label: 'Preview',
      detail: 'Static component preview',
      progress: 40,
      status: 'creating',
    },
  ];
}
