import { FileCode, FileText, LayoutTemplate, Network, Package, Sparkles } from 'lucide-react';
import type { ArtifactRecord } from '../../api/artifacts';
import { formatArtifactType } from './utils';

type Props = { artifact: ArtifactRecord; className?: string };

export function ArtifactTypeIcon({ artifact, className = '' }: Props) {
  const t = (artifact.artifact_type || '').toLowerCase();
  let Icon = Package;
  if (t.includes('graph') || t.includes('schema')) Icon = Network;
  else if (t.includes('template') || t.includes('flow') || t.includes('drag')) Icon = LayoutTemplate;
  else if (t === 'markdown' || t.includes('md')) Icon = FileText;
  else if (t === 'report' || t.includes('spec')) Icon = FileCode;
  else if (t.includes('visualizer')) Icon = Sparkles;

  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-[var(--dashboard-panel)] border border-[var(--dashboard-border)] ${className}`}
      title={formatArtifactType(artifact.artifact_type)}
    >
      <Icon size={28} className="text-[var(--text-muted)] opacity-90" aria-hidden />
    </div>
  );
}
