// Scene config for /agent home background.
// Theme defaults: cms_themes.components_json.agent_home
// User overrides: agent_home_scene.scene_json (optional)

export type SceneLayer =
  | { type: 'image'; url: string; blur?: number; parallax?: number }
  | { type: 'video'; url: string; muted: boolean }
  | { type: 'gradient'; stops: string[]; angle: number }
  | { type: 'preset'; id: ScenePresetId }
  | { type: 'webgl'; presetId: string; params: Record<string, number> };

export type ScenePresetId =
  | 'auto-time'
  | 'moonlit-sea'
  | 'dawn'
  | 'day'
  | 'dusk'
  | 'night'
  | 'aurora'
  | 'minimal-dark';

export interface AgentHomeBackdrop {
  layers: SceneLayer[];
  imageUrl?: string;
}

export interface AgentHomeCmsConfig {
  version: 1;
  mode?: 'auto-time' | 'fixed';
  fixedPreset?: ScenePresetId;
  /** Legacy single-stack layers (user overrides). */
  layers?: SceneLayer[];
  backdrops?: Partial<Record<ScenePresetId | 'minimal-dark', AgentHomeBackdrop>>;
  atmosphere?: {
    vignette?: number;
    grain?: number;
    glowAccent?: string;
  };
  ui?: {
    greetingStyle?: 'serif' | 'sans';
    glassOpacity?: number;
  };
}

/** Render-ready scene passed to AgentHomeScene (layers resolved for current day-part). */
export interface AgentHomeSceneConfig {
  version: 1;
  layers: SceneLayer[];
  atmosphere?: AgentHomeCmsConfig['atmosphere'];
  ui?: AgentHomeCmsConfig['ui'];
}

export const DEFAULT_AGENT_HOME_CMS: AgentHomeCmsConfig = {
  version: 1,
  mode: 'auto-time',
  atmosphere: { vignette: 0.38, grain: 0.035, glowAccent: 'var(--color-primary)' },
  ui: { greetingStyle: 'serif', glassOpacity: 0.18 },
  backdrops: {
    dawn: {
      layers: [
        {
          type: 'gradient',
          angle: 165,
          stops: ['#0c1220 0%', '#1e2840 38%', '#5a4870 62%', '#c9a090 88%', '#8aa8b8 100%'],
        },
      ],
    },
    day: {
      layers: [
        {
          type: 'gradient',
          angle: 175,
          stops: ['#071018 0%', '#0f2840 35%', '#1a5070 58%', '#3a8aab 78%', '#0a2030 100%'],
        },
      ],
    },
    dusk: {
      layers: [
        {
          type: 'gradient',
          angle: 180,
          stops: ['#0a0612 0%', '#241530 40%', '#5a2848 68%', '#1a2838 100%'],
        },
      ],
    },
    night: {
      layers: [
        {
          type: 'gradient',
          angle: 180,
          stops: ['#020810 0%', '#0a1c2c 42%', '#0e2c3c 68%', '#051018 100%'],
        },
        {
          type: 'gradient',
          angle: 135,
          stops: [
            'transparent 0%',
            'rgba(167,219,230,0.06) 42%',
            'rgba(220,242,246,0.14) 52%',
            'rgba(167,219,230,0.05) 62%',
            'transparent 100%',
          ],
        },
      ],
    },
    'minimal-dark': {
      layers: [{ type: 'gradient', angle: 180, stops: ['#050b12 0%', '#050b12 100%'] }],
    },
  },
};

export const DEFAULT_AGENT_HOME_SCENE: AgentHomeSceneConfig = {
  version: 1,
  layers: DEFAULT_AGENT_HOME_CMS.backdrops!.night!.layers,
  atmosphere: DEFAULT_AGENT_HOME_CMS.atmosphere,
  ui: DEFAULT_AGENT_HOME_CMS.ui,
};

export type AgentModeId = 'code' | 'write' | 'create' | 'learn' | 'life';

export interface AgentModePill {
  id: AgentModeId;
  label: string;
  route?: string;
}

export const AGENT_MODE_PILLS: AgentModePill[] = [
  { id: 'code', label: 'Code', route: '/dashboard/agent/editor' },
  { id: 'write', label: 'Write' },
  { id: 'create', label: 'Create' },
  { id: 'learn', label: 'Learn' },
  { id: 'life', label: 'Life stuff' },
];
