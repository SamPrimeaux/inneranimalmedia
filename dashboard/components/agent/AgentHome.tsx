import { useEffect, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgentHomeScene } from './AgentHomeScene';
import { AgentHomeHero } from './AgentHomeHero';
import type { AgentHomeSceneConfig, AgentModeId } from '../../types/agentHomeScene';
import { DEFAULT_AGENT_HOME_SCENE, AGENT_MODE_PILLS } from '../../types/agentHomeScene';
import { applyDayPartToScene, greetingNameFromDisplay } from '../../lib/agentDayPart';
import { useAgentDayPart } from '../../src/hooks/useAgentDayPart';
import { warmAgentChunksForTab } from '../../src/pwa/warmAgentChunks';
import '../../styles/agent-home-tokens.css';
import './AgentHome.css';

interface AgentHomeProps {
  displayName?: string | null;
  showHero?: boolean;
  onComposerHost?: (el: HTMLDivElement | null) => void;
  onMessagesHost?: (el: HTMLDivElement | null) => void;
  onModeSelect: (mode: AgentModeId) => void;
}

/**
 * Bare `/dashboard/agent` — scene + greeting + mode pills + composer portal host.
 * Composer UI is portaled from ChatAssistant (iam-chat-composer-glass).
 */
export function AgentHome({
  displayName,
  showHero = true,
  onComposerHost,
  onMessagesHost,
  onModeSelect,
}: AgentHomeProps) {
  const navigate = useNavigate();
  const dayPart = useAgentDayPart();
  const [scene, setScene] = useState<AgentHomeSceneConfig>(DEFAULT_AGENT_HOME_SCENE);
  const [sceneSource, setSceneSource] = useState<'default' | 'user' | 'workspace'>('default');
  const [tabHidden, setTabHidden] = useState(
    typeof document !== 'undefined' ? document.hidden : false,
  );

  const name = greetingNameFromDisplay(displayName);

  useEffect(() => {
    const handler = () => setTabHidden(document.hidden);
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/agent/scene', { credentials: 'same-origin' })
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (data: {
          scene?: AgentHomeSceneConfig;
          source?: 'default' | 'user' | 'workspace';
        } | null) => {
          if (!active || !data?.scene || data.scene.version !== 1) return;
          setScene(data.scene);
          if (data.source) setSceneSource(data.source);
        },
      )
      .catch(() => {
        /* keep default */
      });
    return () => {
      active = false;
    };
  }, []);

  const displayScene = useMemo(
    () => applyDayPartToScene(scene, dayPart, sceneSource),
    [scene, dayPart, sceneSource],
  );

  const handlePillSelect = useCallback(
    (mode: AgentModeId) => {
      const pill = AGENT_MODE_PILLS.find((p) => p.id === mode);
      if (pill?.route) {
        warmAgentChunksForTab('code');
        navigate(pill.route);
        return;
      }
      onModeSelect(mode);
    },
    [navigate, onModeSelect],
  );

  const handleModeHover = useCallback(() => {
    warmAgentChunksForTab('code');
    void import('../../routes/AgentEditorRoute').catch(() => {});
  }, []);

  return (
    <div className="agent-home">
      <AgentHomeScene config={displayScene} paused={tabHidden} />

      <main className={`agent-home__center${showHero ? '' : ' agent-home__center--chat'}`}>
        <div className="agent-home__stack" onPointerEnter={handleModeHover}>
          {showHero ? (
            <AgentHomeHero name={name} dayPart={dayPart} onModeSelect={handlePillSelect} />
          ) : null}
          <div
            ref={onMessagesHost}
            className="agent-home__messages-host"
            aria-label="Agent Sam conversation"
          />
          <div
            ref={onComposerHost}
            className="agent-home__composer-host"
            aria-label="Agent Sam command input"
          />
        </div>
      </main>
    </div>
  );
}
