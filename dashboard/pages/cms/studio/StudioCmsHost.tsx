import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import StudioCmsEditor from '../../../../studio-cms-editor/app/page';
import studioCss from '../../../../studio-cms-editor/app/globals.css?raw';

export type StudioCmsPanel = 'pages' | 'sections' | 'templates' | 'imports' | 'theme';

type Props = {
  projectSlug: string;
  pageId?: string | null;
  initialPanel: StudioCmsPanel;
  workspaceId?: string;
  sites?: Array<{ slug: string; name?: string; domain?: string | null; logo_url?: string | null }>;
  onSiteChange?: (slug: string) => void;
};

export function StudioCmsHost({ projectSlug, pageId, initialPanel, workspaceId, sites, onSiteChange }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [mount, setMount] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    if (!shadow.querySelector('style[data-studio-cms]')) {
      const style = document.createElement('style');
      style.dataset.studioCms = 'true';
      style.textContent = studioCss
        .replace('@import "tailwindcss";', '')
        .replaceAll(':root{', ':host{');
      shadow.appendChild(style);
    }
    let mount = shadow.querySelector<HTMLDivElement>('[data-studio-cms-mount]');
    if (!mount) {
      mount = document.createElement('div');
      mount.dataset.studioCmsMount = 'true';
      mount.style.cssText = 'display:block;width:100%;height:100%;min-width:0;min-height:0;';
      shadow.appendChild(mount);
    }
    setMount(mount);
    return () => setMount(null);
  }, []);

  return (
    <div ref={hostRef} className="studio-cms-native-host h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-[#09090b]" style={{ display: 'block' }}>
      {mount ? createPortal(
        <StudioCmsEditor
          projectSlug={projectSlug}
          initialPageId={pageId}
          initialPanel={initialPanel}
          workspaceId={workspaceId}
          siteCatalog={sites}
          onSiteChange={onSiteChange}
        />,
        mount,
      ) : null}
    </div>
  );
}
