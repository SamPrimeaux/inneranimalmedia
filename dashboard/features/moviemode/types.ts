import type { FileKind } from '../../src/lib/fileKind';
import type { MovieModeTimeline } from '../../src/types/moviemode';

export type MediaLibraryItem = {
  id: string;
  name: string;
  kind: FileKind;
  previewUrl: string;
  contentType?: string | null;
  size?: number | null;
  source: 'local' | 'r2' | 'api';
  workspacePath?: string;
  r2Bucket?: string;
  r2Key?: string;
  assetId?: string;
};

export type MovieModeStudioProps = {
  timeline: MovieModeTimeline | null;
  onTimelineChange: (timeline: MovieModeTimeline) => void;
};
