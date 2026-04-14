/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import './inneranimalmedia.css';
import { useWorkbench } from './hooks/useWorkbench';
import { useFileSystem } from './hooks/useFileSystem';
import { useStudioEngine } from './hooks/useStudioEngine';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

// Shell Components
import { Layout } from './components/shell/Layout';
import { ActivityBar } from './components/shell/ActivityBar';
import { TopBar } from './components/shell/TopBar';
import { MainWorkbench } from './components/shell/MainWorkbench';
import { AgentPanel } from './components/shell/AgentPanel';
import { UnifiedSearchBar } from './components/UnifiedSearchBar';
import { StatusBar } from './components/StatusBar';
import { WorkspaceLauncher } from './components/WorkspaceLauncher';

import { useEditor } from './src/EditorContext';
import { SHELL_VERSION } from './src/shellVersion';
import { formatWorkspaceStatusLine } from './src/ideWorkspace';

const PRODUCT_NAME = 'Agent Sam';

const App: React.FC = () => {
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const workbench = useWorkbench();
  const fileSystem = useFileSystem();
  const studio = useStudioEngine();
  const { tabs, activeTabId } = useEditor();

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

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
        <ActivityBar 
          activeRoute={workbench.activeRoute} 
          onNavigate={workbench.navigate}
          onSearchToggle={() => {}} 
          onSettingsToggle={() => workbench.navigate('cms')}
        />

        <div className="workbench-wrapper">
          <MainWorkbench 
            activeRoute={workbench.activeRoute}
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

        {workbench.agentPosition !== 'off' && (
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
