import { warmAgentChunksForTab } from '../src/pwa/warmAgentChunks';

/**
 * Lazy chunk boundary for /dashboard/agent/editor.
 * Rendering still lives in App.tsx until Phase 3 splits the editor shell.
 */
export function AgentEditorRoute() {
  return null;
}

warmAgentChunksForTab('code');

export default AgentEditorRoute;
