/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useWorkbench } from './hooks/useWorkbench';
import { useFileSystem } from './hooks/useFileSystem';
import { useStudioEngine } from './hooks/useStudioEngine';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { VoxelEngine } from './services/VoxelEngine';
import { fetchAndApplyActiveCmsTheme, applyCachedCmsThemeFallback } from './src/applyCmsTheme';

// Shell Components
import { Layout } from './components/shell/Layout';
// import { ActivityBar } from './components/shell/ActivityBar'; // Replaced by LeftSidebarPanel
import { TopBar } from './components/shell/TopBar';
import { MainWorkbench } from './components/shell/MainWorkbench';
import { AgentPanel } from './components/shell/AgentPanel';
import { UnifiedSearchBar } from './components/UnifiedSearchBar';
import { StatusBar } from './components/StatusBar';
import { WorkspaceLauncher } from './components/WorkspaceLauncher';
import LeftSidebarPanel from './components/LeftSidebarPanel';

import { useEditor } from './src/EditorContext';
import { SHELL_VERSION } from './src/shellVersion';
import { formatWorkspaceStatusLine } from './src/ideWorkspace';

const PRODUCT_NAME = 'Agent Sam';

const App: React.FC = () => {
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const workbench = useWorkbench();
  const fileSystem = useFileSystem();
  const studio = useStudioEngine();
  const { tabs, activeTabId, openFile } = useEditor();


  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const collabWsRef = useRef<WebSocket | null>(null);
  const engineRef = useRef<VoxelEngine | null>(null);
  const [voxelCount, setVoxelCount] = useState(0);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  useKeyboardShortcuts([
    { key: 'j', meta: true, action: () => workbench.setIsTerminalOpen(!workbench.isTerminalOpen) },
    { key: 'b', meta: true, action: () => workbench.setAgentPosition(p => p === 'off' ? 'right' : 'off') },
    { key: 'k', meta: true, action: () => setIsSearchOpen(true) },
  ]);

  // ── Computed ──────────────────────────────────────────────────────────────
  const workspaceDisplayName = useMemo(() => {
    if (workbench.activeWorkspace?.name) return workbench.activeWorkspace.name;
    return formatWorkspaceStatusLine(fileSystem.ideWorkspace);
  }, [workbench.activeWorkspace, fileSystem.ideWorkspace]);

  const [messages, setMessages] = React.useState<any[]>([]);
  const activeFile = tabs.find(t => t.id === activeTabId) || null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSendMessage = (msg: string) => {
     window.dispatchEvent(new CustomEvent('iam-chat-send', { detail: { message: msg } }));
  };

  // ── Effects ───────────────────────────────────────────────────────────────

  // 1. Initial Theme Hydration
  React.useEffect(() => {
    applyCachedCmsThemeFallback();
    fetchAndApplyActiveCmsTheme(workbench.authWorkspaceId);
  }, [workbench.authWorkspaceId]);

  // 2. Real-time Collaboration (WebSocket)
  React.useEffect(() => {
    const workspaceId = 'global';
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/collab/room/${workspaceId}`;
    const ws = new WebSocket(wsUrl);
    collabWsRef.current = ws;

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'theme_update' && msg.cssVars) {
          Object.entries(msg.cssVars).forEach(([k, v]) => {
            document.documentElement.style.setProperty(k, v as string);
          });
        }
        if (msg.type === 'canvas_update') {
          window.dispatchEvent(new CustomEvent('iam:canvas_update', { detail: msg.elements }));
        }
      } catch (_) {}
    };

    return () => {
      try { ws.close(); } catch (_) {}
    };
  }, []);

  // 3. Voxel Engine Lifecycle
  React.useEffect(() => {
    // Basic service init — we'll wire the canvas elements in the CAD route
    if (!engineRef.current) {
      // engineRef.current = new VoxelEngine(...); 
      // Note: Real initialization happens when the 3D canvas mounts in StudioSidebar or StudioEngine
    }
  }, []);

  // 4. Keyboard Shortcuts & Global Events
  React.useEffect(() => {
    const handleSearchNavigate = (e: any) => {
      const nav = e.detail;
      if (nav.kind === 'command' && nav.cmd === 'db') {
        workbench.navigate('database');
      }
      // Add other navigation handling here as needed
    };
    window.addEventListener('iam-search-navigate', handleSearchNavigate);
    return () => window.removeEventListener('iam-search-navigate', handleSearchNavigate);
  }, [workbench]);

  const handleFileOpen = async (path: string) => {

    // Basic wiring: fetch file content then open in editor
    try {
      const res = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`);
      if (res.ok) {
        const file = await res.json();
        openFile(file);
      }
    } catch (err) {
      console.error('[App] Failed to open file:', path, err);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Layout layoutMode={workbench.layoutMode}>
      
      <TopBar 
        productLabel={PRODUCT_NAME}
        workspaceName={workspaceDisplayName}
        layoutMode={workbench.layoutMode}
        onLayoutChange={workbench.setLayoutMode}
        onSearchToggle={() => setIsSearchOpen(true)}
        onSettingsToggle={() => workbench.navigate('cms')}
        tunnelHealthy={true}
        tunnelLabel="Tunnel Active"
      />

      <div className="shell-main">
        <LeftSidebarPanel
          workspaceName={workspaceDisplayName}
          activeFile={activeFile?.workspacePath}

          onFileOpen={handleFileOpen}

          fetchFileTree={() => fetch('/api/workspace/files').then(r => r.json())}
          fetchGitStatus={() => fetch('/api/agent/git/status').then(r => r.json())}
          fetchCommits={() => fetch('/api/agent/git/log').then(r => r.json())}
          fetchOutline={(file) => fetch(`/api/workspace/outline?file=${encodeURIComponent(file)}`).then(r => r.json())}
          fetchTimeline={(file) => fetch(`/api/workspace/timeline?file=${encodeURIComponent(file)}`).then(r => r.json())}
          fetchDebugConfigs={() => fetch('/api/workspace/debug/configs').then(r => r.json())}
          fetchSshTargets={() => fetch('/api/ssh/targets').then(r => r.json())}
          fetchWorkflowRuns={() => fetch('/api/agent/cicd').then(r => r.json())}

          onSearch={(params: any) => fetch('/api/workspace/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
          }).then(r => r.json())}
          onCommit={(message, files) => fetch('/api/workspace/git/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message, files }),
          }).then(() => {})}
          onStage={(path) => fetch('/api/workspace/git/stage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
          }).then(() => {})}
          onUnstage={(path) => fetch('/api/workspace/git/unstage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path }),
          }).then(() => {})}
          onAgentReview={(changes) => fetch('/api/agent/review', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ changes }),
          }).then(r => r.json())}
          onLaunchDebug={(config) => fetch('/api/debug/launch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config),
          }).then(() => {
            workbench.setIsTerminalOpen(true);
          })}
          onSshConnect={(target) => fetch('/api/ssh/connect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(target),
          }).then(() => {})}

          onNavigate={workbench.navigate}
          isCollapsed={workbench.activeRoute === 'database'}
          className={`iam-left-sidebar ${workbench.activeRoute === 'database' ? 'collapsed' : ''}`}
        />

        <div className="workbench-wrapper">
          <MainWorkbench 
            activeRoute={workbench.activeRoute}
            onNavigate={workbench.navigate}
            layoutMode={workbench.layoutMode}
            isTerminalOpen={workbench.isTerminalOpen}
            onTerminalToggle={() => workbench.setIsTerminalOpen(false)}
            workspaceProps={{
              onOpenFolder: () => {},
              onConnectWorkspace: () => workbench.setWorkspaceLauncherOpen(true),
              onGithubSync: () => {},
              recentFiles: fileSystem.recentFiles,
              workspaceRows: workbench.workspaceRows,
              authWorkspaceId: workbench.authWorkspaceId,
              onSwitchWorkspace: workbench.setAuthWorkspaceId,
              onSendMessage: handleSendMessage,
              logoUrl: '', 
              productLabel: PRODUCT_NAME
            }}
            editorProps={{}}
            browserProps={{}}
            terminalProps={{
              workspaceLabel: workspaceDisplayName,
              workspaceId: workbench.authWorkspaceId || '',
              productLabel: PRODUCT_NAME,
              showWelcomeBar: false,
              outputLines: []
            }}
          />
        </div>

        {workbench.agentPosition !== 'off' && workbench.activeRoute !== 'database' && (
          <div className="w-[320px] shrink-0 h-full">
            <AgentPanel 
              productLabel={PRODUCT_NAME}
              onClose={() => workbench.setAgentPosition('off')}
              activeProject={studio.activeProject}
              ideWorkspace={fileSystem.ideWorkspace}
              activeFile={activeFile}
              onSendMessage={handleSendMessage}
              conversationId={fileSystem.agentChatConversationId}
              onConversationChange={fileSystem.setAgentChatConversationId}
              messages={messages}
              setMessages={setMessages}
            />
          </div>
        )}
      </div>

      <StatusBar 
        branch={fileSystem.gitBranch}
        workspace={workspaceDisplayName}
        errorCount={0}
        warningCount={0}
        showCursor={false}
        line={1}
        col={1}
        version={SHELL_VERSION}
        healthOk={true}
        tunnelHealthy={true}
        tunnelLabel="IAM-OK"
        terminalOk={true}
        lastDeployLine={null}
        indentLabel="Spaces: 2"
        encodingLabel="UTF-8"
        eolLabel="LF"
        notifications={[]}
        notifUnreadCount={0}
        onMarkNotificationRead={() => {}}
        canFormatDocument={false}
        onBrandClick={() => {}}
        onGitBranchClick={() => {}}
        onWorkspaceClick={() => workbench.setWorkspaceLauncherOpen(true)}
        onErrorsClick={() => {}}
        onWarningsClick={() => {}}
        onCursorClick={() => {}}
        onVersionClick={() => {}}
        onFormatClick={() => {}}
      />

      {isSearchOpen && (
        <UnifiedSearchBar onClose={() => setIsSearchOpen(false)} />
      )}

      {workbench.isWorkspaceLauncherOpen && (
        <WorkspaceLauncher 
          onClose={() => workbench.setWorkspaceLauncherOpen(false)}
          onOpenLocalFolder={() => {}}
          onConnectWorkspace={() => workbench.setWorkspaceLauncherOpen(false)}
        />
      )}

      {toastMsg && (
        <div className="fixed bottom-16 left-1/2 z-[200] -translate-x-1/2 px-4 py-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[11px] text-[var(--text-main)] shadow-lg" role="status">
          {toastMsg}
        </div>
      )}

    </Layout>
  );
};

export default App;
