/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { EditorProvider } from './src/EditorContext';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <EditorProvider>
      <App />
    </EditorProvider>
  </React.StrictMode>
);
