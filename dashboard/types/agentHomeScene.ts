// Scene config for /agent home background.
// Mirrors the shape persisted server-side in `agent_home_scene.scene_json`.
// Keep this in sync with CURSOR_BACKEND_BRIEF.md Phase 1.

export type SceneLayer =
  | { type: 'image'; url: string; blur?: number; parallax?: number }
  | { type: 'video'; url: string; muted: boolean }
  | { type: 'gradient'; stops: string[]; angle: number }
  | { type: 'preset'; id: ScenePresetId }
  | { type: 'webgl'; presetId: string; params: Record<string, number> };

export type ScenePresetId = 'moonlit-sea' | 'aurora' | 'minimal-dark';

export interface AgentHomeSceneConfig {
  version: 1;
  layers: SceneLayer[];
  atmosphere?: {
    vignette?: number; // 0-1
    grain?: number; // 0-1
    glowAccent?: string; // css var reference, e.g. 'var(--accent-cyan)'
  };
  ui?: {
    greetingStyle?: 'serif' | 'sans';
    glassOpacity?: number; // 0-1
  };
}

// Built-in default — never persisted, served by GET /api/agent/scene
// when the user has no row yet.
export const DEFAULT_AGENT_HOME_SCENE: AgentHomeSceneConfig = {
  version: 1,
  layers: [{ type: 'preset', id: 'moonlit-sea' }],
  atmosphere: { vignette: 0.35, grain: 0.04, glowAccent: 'var(--accent-cyan)' },
  ui: { greetingStyle: 'serif', glassOpacity: 0.18 },
};

export type AgentModeId = 'code' | 'write' | 'create' | 'learn' | 'life';

export interface AgentModePill {
  id: AgentModeId;
  label: string;
  /** Where the pill navigates. Code is the only one that leaves chat for a route. */
  route?: string;
}

export const AGENT_MODE_PILLS: AgentModePill[] = [
  { id: 'code', label: 'Code', route: '/dashboard/agent/editor' },
  { id: 'write', label: 'Write' },
  { id: 'create', label: 'Create' },
  { id: 'learn', label: 'Learn' },
  { id: 'life', label: 'Life stuff' },
];
