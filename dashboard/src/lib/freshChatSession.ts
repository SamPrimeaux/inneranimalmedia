/**
 * Fresh chat session — no repo, connector, or Mac assumptions beyond workspace + identity.
 */
import { writeComposerSources } from '../../components/ChatAssistant/composer/composerSourcesStorage';
import { writeStoredExecLane } from './execLane';
import { writeChatGithubContext } from '../../components/ChatAssistant/types';

export type FreshSessionResetOptions = {
  composerSourcesKey: string;
  githubContextStorageKey: string;
  onClearGithubState: () => void;
  onClearAttachments?: () => void;
  onClearProject?: () => void;
};

/** Reset client-side chat context for a new thread (ephemeral until user opts in). */
export function applyFreshChatSessionDefaults(opts: FreshSessionResetOptions): void {
  writeComposerSources(opts.composerSourcesKey, []);
  writeStoredExecLane('auto');
  try {
    writeChatGithubContext(opts.githubContextStorageKey, {
      repo: null,
      path: null,
      branch: 'main',
      content: null,
      content_truncated: false,
      content_sha: null,
    });
  } catch {
    /* ignore */
  }
  opts.onClearGithubState();
  opts.onClearAttachments?.();
  opts.onClearProject?.();
  try {
    sessionStorage.removeItem('iam:session-enabled-connectors');
  } catch {
    /* ignore */
  }
}

const SESSION_CONNECTORS_KEY = 'iam:session-enabled-connectors';

export function readSessionEnabledConnectors(): string[] {
  try {
    const raw = sessionStorage.getItem(SESSION_CONNECTORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export function writeSessionEnabledConnectors(keys: string[]): void {
  try {
    sessionStorage.setItem(SESSION_CONNECTORS_KEY, JSON.stringify(keys.slice(0, 24)));
  } catch {
    /* ignore */
  }
}

export function toggleSessionConnector(providerKey: string, enabled: boolean): string[] {
  const set = new Set(readSessionEnabledConnectors());
  const pk = providerKey.trim();
  if (!pk) return [...set];
  if (enabled) set.add(pk);
  else set.delete(pk);
  const next = [...set];
  writeSessionEnabledConnectors(next);
  return next;
}
