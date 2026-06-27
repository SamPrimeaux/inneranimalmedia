import React, { useCallback, useEffect, useState } from 'react';

type ClientWorkerCmsStudioProps = {
  workspaceId?: string;
  projectSlug: string | null;
  projectName?: string | null;
  studioUrl?: string | null;
  publicDomain?: string | null;
  bridgeSupported?: boolean;
  apiProfile?: string | null;
};

export default function ClientWorkerCmsStudio({
  workspaceId,
  projectSlug,
  projectName,
  studioUrl,
  publicDomain,
  bridgeSupported,
  apiProfile,
}: ClientWorkerCmsStudioProps) {
  const [embedUrl, setEmbedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEmbed = useCallback(async () => {
    if (!projectSlug) {
      setLoading(false);
      setError('No CMS site selected');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cms/bridge/embed-session', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_slug: projectSlug, workspace_id: workspaceId || undefined }),
      });
      const data = (await res.json()) as {
        embed_url?: string;
        studio_url?: string;
        error?: string;
        hint?: string;
      };
      if (!res.ok) {
        setEmbedUrl(data.studio_url || studioUrl || null);
        setError(data.error || data.hint || res.statusText);
        return;
      }
      setEmbedUrl(data.embed_url || data.studio_url || studioUrl || null);
    } catch (e) {
      setEmbedUrl(studioUrl || null);
      setError(e instanceof Error ? e.message : 'Failed to mint embed session');
    } finally {
      setLoading(false);
    }
  }, [projectSlug, workspaceId, studioUrl]);

  useEffect(() => {
    void loadEmbed();
  }, [loadEmbed]);

  const fallbackUrl = studioUrl || embedUrl;

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--dashboard-border)] px-4 py-2 text-sm">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-[var(--text-heading)]">
            Client worker · {projectName || projectSlug}
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {publicDomain || 'client worker CMS'}
            {apiProfile ? ` · ${apiProfile}` : ''}
            {bridgeSupported === false ? ' · bridge pending' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {fallbackUrl ? (
            <a
              href={fallbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md border border-[var(--dashboard-border)] px-2 py-1 text-xs hover:bg-[var(--bg-hover)]"
            >
              Open studio ↗
            </a>
          ) : null}
          <button
            type="button"
            className="rounded-md border border-[var(--dashboard-border)] px-2 py-1 text-xs hover:bg-[var(--bg-hover)]"
            onClick={() => {
              void loadEmbed();
            }}
          >
            Retry embed
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
          Minting embed session…
        </div>
      ) : null}

      {!loading && error ? (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-200">
          {error}
          {fallbackUrl ? ' — use Open studio or retry after client worker bridge ships (Agent 4).' : ''}
        </div>
      ) : null}

      {!loading && embedUrl ? (
        <iframe
          title={`CMS studio · ${projectSlug}`}
          src={embedUrl}
          className="flex-1 min-h-0 w-full border-0 bg-[var(--dashboard-canvas)]"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      ) : null}

      {!loading && !embedUrl && fallbackUrl ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-sm text-[var(--text-muted)]">
          <p>Embed session unavailable. Open the client studio directly.</p>
          <a
            href={fallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-[var(--dashboard-border)] px-3 py-2 hover:bg-[var(--bg-hover)]"
          >
            Open {publicDomain || 'client studio'}
          </a>
        </div>
      ) : null}
    </div>
  );
}
