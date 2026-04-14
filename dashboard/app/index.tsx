/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// ─── Styles ───────────────────────────────────────────────────────────────────
// index.css layers Tailwind utilities on top.
import '../public/inneranimalmedia.css';
import './index.css';

// ─── React ────────────────────────────────────────────────────────────────────
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { EditorProvider } from './src/EditorContext';

// ─── Mount ────────────────────────────────────────────────────────────────────
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('[IAM] Could not find #root element to mount to');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <EditorProvider>
      <App />
    </EditorProvider>
  </React.StrictMode>
);
