import './index.css';
import './src/seti-icons.css';
import './src/monaco-diff.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { EditorProvider } from './src/EditorContext';
import { WorkspaceProvider } from './src/context/WorkspaceContext';
import { bootstrapSupabaseFromSession, setSupabaseBootstrap } from './src/lib/supabase';
import {
  ensureDashboardBootstrapBeforeMount,
  isDashboardBootstrapPath,
  readDashboardBootstrapCache,
} from './src/loadDashboardBootstrap';

async function mountDashboard() {
  if (isDashboardBootstrapPath()) {
    await ensureDashboardBootstrapBeforeMount();
  }

  const bootClient = readDashboardBootstrapCache(60_000)?.client;
  if (bootClient?.supabaseUrl && bootClient?.supabaseAnonKey) {
    setSupabaseBootstrap(bootClient.supabaseUrl, bootClient.supabaseAnonKey);
  }

  void bootstrapSupabaseFromSession();

  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Could not find root element to mount to');

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
    </React.StrictMode>,
  );
}

void mountDashboard();
