import { useState, useEffect, useRef } from 'react';
import { 
  hydrateIdeFromApi, 
  persistIdeToApi, 
  IDE_PERSIST_VERSION,
  type IdeWorkspaceSnapshot, 
  type RecentFileEntry 
} from '../src/ideWorkspace';
import { LS_AGENT_CHAT_CONVERSATION_ID } from '../agentChatConstants';

export function useFileSystem() {
  const [ideWorkspace, setIdeWorkspace] = useState<IdeWorkspaceSnapshot>(() => ({ source: 'none' }));
  const [recentFiles, setRecentFiles] = useState<RecentFileEntry[]>([]);
  const [gitBranch, setGitBranch] = useState(() => 'main');
  
  const [agentChatConversationId, setAgentChatConversationId] = useState(() =>
    typeof window !== 'undefined' ? localStorage.getItem(LS_AGENT_CHAT_CONVERSATION_ID)?.trim() || '' : ''
  );

  const hydrateGenRef = useRef(0);

  // ── Sync IDE logic ────────────────────────────────────────────────────────
  useEffect(() => {
    const id = agentChatConversationId?.trim();
    if (!id) {
      setIdeWorkspace({ source: 'none' });
      setRecentFiles([]);
      return;
    }
    const gen = ++hydrateGenRef.current;
    let cancelled = false;

    void hydrateIdeFromApi(id).then(b => {
      if (cancelled || hydrateGenRef.current !== gen) return;
      setIdeWorkspace(b.ideWorkspace);
      setGitBranch(b.gitBranch);
      setRecentFiles(b.recentFiles);
    });

    return () => { cancelled = true; };
  }, [agentChatConversationId]);

  useEffect(() => {
    const id = agentChatConversationId?.trim();
    if (!id) return;
    const t = window.setTimeout(() => {
      void persistIdeToApi(id, { 
        v: IDE_PERSIST_VERSION, 
        ideWorkspace, 
        gitBranch, 
        recentFiles 
      });
    }, 650);
    return () => clearTimeout(t);
  }, [agentChatConversationId, ideWorkspace, gitBranch, recentFiles]);

  return {
    ideWorkspace,
    setIdeWorkspace,
    recentFiles,
    setRecentFiles,
    gitBranch,
    setGitBranch,
    agentChatConversationId,
    setAgentChatConversationId,
  };
}
