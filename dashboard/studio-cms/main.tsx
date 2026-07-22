import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import StudioCmsEditor from '../../studio-cms-editor/app/page';
import studioCss from '../../studio-cms-editor/app/globals.css?raw';

function readParams() {
  const params = new URLSearchParams(window.location.search);
  const panelRaw = params.get('panel') || 'pages';
  const panel =
    panelRaw === 'sections' ||
    panelRaw === 'templates' ||
    panelRaw === 'imports' ||
    panelRaw === 'theme'
      ? panelRaw
      : 'pages';
  return {
    projectSlug: params.get('site') || params.get('project') || 'inneranimalmedia',
    pageId: params.get('page') || null,
    panel: panel as 'pages' | 'sections' | 'templates' | 'imports' | 'theme',
    workspaceId: params.get('workspace') || '',
  };
}

function injectStudioCss() {
  if (document.querySelector('style[data-studio-cms]')) return;
  const style = document.createElement('style');
  style.dataset.studioCms = 'true';
  style.textContent = String(studioCss || '').replace('@import "tailwindcss";', '');
  document.head.appendChild(style);
}

injectStudioCss();

const mount = document.getElementById('app');
const boot = readParams();

if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <StudioCmsEditor
        projectSlug={boot.projectSlug}
        initialPageId={boot.pageId}
        initialPanel={boot.panel}
        workspaceId={boot.workspaceId}
        siteCatalog={[]}
        onSiteChange={(slug) => {
          const url = new URL(window.location.href);
          url.searchParams.set('site', slug);
          window.history.replaceState({}, '', url.toString());
          window.parent?.postMessage({ type: 'iam-studio-cms-site', slug }, window.location.origin);
        }}
      />
    </StrictMode>,
  );
}
