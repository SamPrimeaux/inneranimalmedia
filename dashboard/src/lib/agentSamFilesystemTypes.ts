import {
  FS_SOURCE_ICON_META,
  type FsSourceIconId,
} from './fsSourceIcons';

/** Unified file browser source — one tab, one tree/list surface per source. */
export type AgentSamFsSource = FsSourceIconId;

export const AGENT_SAM_FS_SOURCES: {
  id: AgentSamFsSource;
  label: string;
  title: string;
}[] = (
  ['local', 'react', 'r2', 'github', 'drive', 'container'] as const
).map((id) => ({
  id,
  label: FS_SOURCE_ICON_META[id].label,
  title: FS_SOURCE_ICON_META[id].title,
}));

export const AGENT_SAM_FS_SOURCE_STORAGE_KEY = 'iam_agent_sam_fs_source_v1';

const VALID_SOURCES = new Set<string>(AGENT_SAM_FS_SOURCES.map((s) => s.id));

export function loadPersistedAgentSamFsSource(): AgentSamFsSource | null {
  try {
    const raw = localStorage.getItem(AGENT_SAM_FS_SOURCE_STORAGE_KEY);
    if (raw && VALID_SOURCES.has(raw)) return raw as AgentSamFsSource;
  } catch {
    /* private mode */
  }
  return null;
}

export function persistAgentSamFsSource(source: AgentSamFsSource): void {
  try {
    localStorage.setItem(AGENT_SAM_FS_SOURCE_STORAGE_KEY, source);
  } catch {
    /* ignore */
  }
}

export function fsSourceIconId(source: AgentSamFsSource): FsSourceIconId {
  return source;
}
