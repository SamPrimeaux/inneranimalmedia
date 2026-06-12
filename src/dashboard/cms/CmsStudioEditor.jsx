/**
 * Atelier CMS Studio — full-viewport iframe wired to live D1 bootstrap via cms-studio-bridge.js
 */
import { useMemo } from 'react';

const STUDIO_BASE = '/static/dashboard/app/cms/design-studio-cms.html';

export function CmsStudioEditor({
  projectSlug,
  pageId = null,
  panel = 'pages',
  workspaceId = '',
}) {
  const src = useMemo(() => {
    const q = new URLSearchParams();
    q.set('project', projectSlug || 'inneranimalmedia');
    if (pageId) q.set('page', pageId);
    if (panel && panel !== 'pages') q.set('panel', panel);
    if (workspaceId) q.set('workspace_id', workspaceId);
    return `${STUDIO_BASE}?${q.toString()}`;
  }, [projectSlug, pageId, panel, workspaceId]);

  return (
    <iframe
      title="CMS Studio"
      src={src}
      className="iam-cms-studio-frame"
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        border: 0,
        minHeight: 0,
        background: '#F6F2EA',
      }}
      allow="clipboard-read; clipboard-write"
    />
  );
}

export default CmsStudioEditor;
