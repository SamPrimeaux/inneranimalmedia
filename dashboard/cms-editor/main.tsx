import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CmsEditor from './CmsEditorApp';

const mount = document.getElementById('app');
if (mount) {
  createRoot(mount).render(
    <StrictMode>
      <CmsEditor />
    </StrictMode>
  );
}
