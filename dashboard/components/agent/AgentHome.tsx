import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentHomeScene } from './AgentHomeScene';
import { AgentHomeHero } from './AgentHomeHero';
import { AgentRail } from './AgentRail';
import type { AgentHomeSceneConfig, AgentModeId } from '../../types/agentHomeScene';
import { DEFAULT_AGENT_HOME_SCENE, AGENT_MODE_PILLS } from '../../types/agentHomeScene';
import { warmAgentChunksForTab } from '../../src/pwa/warmAgentChunks';
import '../../styles/agent-home-tokens.css';
import './AgentHome.css';

interface AgentHomeProps {
  userName: string;
  userInitials: string;
  workspaceId?: string;
  /** Called for non-route modes (write/create/learn/life) — hands off to chat. */
  onChatPrompt: (prompt: string, mode?: AgentModeId) => void;
  onRailNavigate?: (target: string) => void;
}

/**
 * Entire bundle for bare `/dashboard/agent`. Must not import Monaco, xterm,
 * file explorer, or BrowserView — those live behind /agent/editor.
 */
export function AgentHome({
  userName,
  userInitials,
  workspaceId,
  onChatPrompt,
  onRailNavigate,
}: AgentHomeProps) {
  const navigate = useNavigate();
  const [scene, setScene] = useState<AgentHomeSceneConfig>(DEFAULT_AGENT_HOME_SCENE);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [tabHidden, setTabHidden] = useState(
    typeof document !== 'undefined' ? document.hidden : false,
  );

  useEffect(() => {
    const handler = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/agent/scene', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { scene?: AgentHomeSceneConfig } | null) => {
        if (!active || !data?.scene || data.scene.version !== 1) return;
        setScene(data.scene);
      })
      .catch(() => {
        /* keep DEFAULT_AGENT_HOME_SCENE */
      });
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const handlePillSelect = useCallback(
    (mode: AgentModeId) => {
      const pill = AGENT_MODE_PILLS.find((p) => p.id === mode);
      if (pill?.route) {
        warmAgentChunksForTab('code');
        navigate(pill.route);
        return;
      }
      onChatPrompt('', mode);
    },
    [navigate, onChatPrompt],
  );

  const handleModeHover = useCallback((mode: AgentModeId) => {
    if (mode === 'code') {
      warmAgentChunksForTab('code');
      void import('../../routes/AgentEditorRoute').catch(() => {});
    }
  }, []);

  const handleRailNavigate = useCallback(
    (target: string) => {
      if (onRailNavigate) {
        onRailNavigate(target);
        return;
      }
      if (target.startsWith('/')) {
        navigate(target);
      }
    },
    [navigate, onRailNavigate],
  );

  return (
    <div className="agent-home">
      <AgentHomeScene config={scene} paused={tabHidden} />

      <div className="agent-home__layout">
        <AgentRail
          collapsed={railCollapsed}
          onToggleCollapsed={() => setRailCollapsed((c) => !c)}
          onNavigate={handleRailNavigate}
          userInitials={userInitials}
          hasUpdate
        />

        <main className="agent-home__center">
          <div onPointerEnter={() => handleModeHover('code')}>
            <AgentHomeHero
              name={userName}
              onSubmit={(prompt) => onChatPrompt(prompt)}
              onModeSelect={handlePillSelect}
              glassOpacity={scene.ui?.glassOpacity}
            />
          </div>
        </main>
      </div>
    </div>
  );
}
