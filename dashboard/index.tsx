import './index.css';
import './src/seti-icons.css';
import './src/monaco-diff.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { EditorProvider } from './src/EditorContext';
import { WorkspaceProvider } from './src/context/WorkspaceContext';
import { bootstrapSupabaseFromSession } from './src/lib/supabase';

void bootstrapSupabaseFromSession();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error("Could not find root element to mount to");

type DashboardRoot = ReturnType<typeof ReactDOM.createRoot>;
const w = window as Window & { __IAM_DASHBOARD_ROOT__?: DashboardRoot };
if (!w.__IAM_DASHBOARD_ROOT__) {
  w.__IAM_DASHBOARD_ROOT__ = ReactDOM.createRoot(rootElement);
}
w.__IAM_DASHBOARD_ROOT__.render(
  <React.StrictMode>
    <BrowserRouter>
      <EditorProvider>
        <WorkspaceProvider>
          <App />
        </WorkspaceProvider>
      </EditorProvider>
    </BrowserRouter>
  </React.StrictMode>
);
