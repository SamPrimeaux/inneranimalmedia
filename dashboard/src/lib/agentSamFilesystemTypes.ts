/** Unified file browser source — one tab, one tree/list surface per source. */
export type AgentSamFsSource = 'local' | 'r2' | 'github' | 'drive';

export const AGENT_SAM_FS_SOURCES: { id: AgentSamFsSource; label: string }[] = [
  { id: 'local', label: 'Local' },
  { id: 'r2', label: 'R2' },
  { id: 'github', label: 'GitHub' },
  { id: 'drive', label: 'Drive' },
];

export const AGENT_SAM_FS_SOURCE_STORAGE_KEY = 'iam_agent_sam_fs_source_v1';

export function loadPersistedAgentSamFsSource(): AgentSamFsSource | null {
  try {
    const raw = localStorage.getItem(AGENT_SAM_FS_SOURCE_STORAGE_KEY);
    if (raw === 'local' || raw === 'r2' || raw === 'github' || raw === 'drive') return raw;
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
