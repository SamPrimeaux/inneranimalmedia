/**
 * Agent home scene defaults + cms_themes.components_json.agent_home parsing.
 * Keeps dashboard/types/agentHomeScene.ts shapes in sync conceptually.
 */

export const DEFAULT_AGENT_HOME_CMS = {
  version: 1,
  mode: 'auto-time',
  atmosphere: {
    vignette: 0.38,
    grain: 0.035,
    glowAccent: 'var(--color-primary)',
  },
  ui: {
    greetingStyle: 'serif',
    glassOpacity: 0.18,
  },
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

const PRESET_IDS = new Set(['dawn', 'day', 'dusk', 'night', 'minimal-dark', 'moonlit-sea', 'auto-time', 'aurora']);
const GREETING_STYLES = new Set(['serif', 'sans']);

function clamp01(n, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(1, Math.max(0, v));
}

function parseJsonSafe(raw, fallback = {}) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return fallback;
  }
}

function sanitizeLayer(layer) {
  if (!layer || typeof layer !== 'object') return null;
  const type = String(layer.type || '').trim();
  if (type === 'gradient') {
    const stops = Array.isArray(layer.stops)
      ? layer.stops.map((s) => String(s).trim()).filter(Boolean).slice(0, 8)
      : [];
    if (stops.length < 2) return null;
    const angle = Number(layer.angle);
    return { type: 'gradient', stops, angle: Number.isFinite(angle) ? angle : 180 };
  }
  if (type === 'image') {
    const url = String(layer.url || '').trim();
    if (!url || url.length > 2048) return null;
    const blur = layer.blur != null ? Number(layer.blur) : undefined;
    return {
      type: 'image',
      url,
      blur: Number.isFinite(blur) ? Math.min(48, Math.max(0, blur)) : undefined,
    };
  }
  if (type === 'preset') {
    const id = String(layer.id || '').trim();
    if (!PRESET_IDS.has(id)) return null;
    return { type: 'preset', id };
  }
  return null;
}

function sanitizeBackdrop(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const imageUrl = String(raw.imageUrl || raw.image_url || '').trim();
  if (imageUrl) {
    const layer = sanitizeLayer({ type: 'image', url: imageUrl });
    return layer ? { layers: [layer], imageUrl } : null;
  }
  const layers = Array.isArray(raw.layers)
    ? raw.layers.map(sanitizeLayer).filter(Boolean).slice(0, 4)
    : [];
  if (!layers.length) return null;
  return { layers };
}

export function sanitizeAgentHomeCms(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (Number(raw.version) !== 1) return null;

  const atmosphere = raw.atmosphere && typeof raw.atmosphere === 'object' ? raw.atmosphere : {};
  const ui = raw.ui && typeof raw.ui === 'object' ? raw.ui : {};
  const greetingStyle = String(ui.greetingStyle || 'serif').trim();

  const backdropsIn = raw.backdrops && typeof raw.backdrops === 'object' ? raw.backdrops : {};
  /** @type {Record<string, { layers: object[] }>} */
  const backdrops = {};
  for (const key of ['dawn', 'day', 'dusk', 'night', 'minimal-dark']) {
    const sanitized = sanitizeBackdrop(backdropsIn[key]);
    if (sanitized) backdrops[key] = sanitized;
  }

  const mode = String(raw.mode || 'auto-time').trim() === 'fixed' ? 'fixed' : 'auto-time';
  const fixedPreset = String(raw.fixedPreset || raw.fixed_preset || '').trim();

  const legacyLayers = Array.isArray(raw.layers)
    ? raw.layers.map(sanitizeLayer).filter(Boolean).slice(0, 6)
    : [];

  /** @type {Record<string, unknown>} */
  const out = {
    version: 1,
    mode,
    atmosphere: {
      vignette: clamp01(atmosphere.vignette, DEFAULT_AGENT_HOME_CMS.atmosphere.vignette),
      grain: clamp01(atmosphere.grain, DEFAULT_AGENT_HOME_CMS.atmosphere.grain),
      glowAccent:
        typeof atmosphere.glowAccent === 'string' && atmosphere.glowAccent.trim()
          ? atmosphere.glowAccent.trim().slice(0, 120)
          : DEFAULT_AGENT_HOME_CMS.atmosphere.glowAccent,
    },
    ui: {
      greetingStyle: GREETING_STYLES.has(greetingStyle) ? greetingStyle : 'serif',
      glassOpacity: clamp01(ui.glassOpacity, DEFAULT_AGENT_HOME_CMS.ui.glassOpacity),
    },
    backdrops: Object.keys(backdrops).length ? backdrops : { ...DEFAULT_AGENT_HOME_CMS.backdrops },
  };

  if (mode === 'fixed' && PRESET_IDS.has(fixedPreset)) {
    out.fixedPreset = fixedPreset;
  }
  if (legacyLayers.length) {
    out.layers = legacyLayers;
  }

  return out;
}

export function parseAgentHomeFromComponentsJson(componentsJsonRaw) {
  const components = parseJsonSafe(componentsJsonRaw, {});
  const raw = components?.agent_home ?? components?.agentHome ?? null;
  return sanitizeAgentHomeCms(raw) || { ...DEFAULT_AGENT_HOME_CMS, backdrops: { ...DEFAULT_AGENT_HOME_CMS.backdrops } };
}

export function mergeAgentHomeCms(existingRaw, patchRaw) {
  const base = sanitizeAgentHomeCms(existingRaw) || { ...DEFAULT_AGENT_HOME_CMS, backdrops: { ...DEFAULT_AGENT_HOME_CMS.backdrops } };
  if (!patchRaw || typeof patchRaw !== 'object') return base;

  const patch = sanitizeAgentHomeCms(patchRaw);
  if (!patch) return base;

  const backdrops = { ...(base.backdrops || {}) };
  if (patch.backdrops) {
    for (const [k, v] of Object.entries(patch.backdrops)) {
      if (v) backdrops[k] = v;
    }
  }

  return {
    ...base,
    ...patch,
    atmosphere: { ...(base.atmosphere || {}), ...(patch.atmosphere || {}) },
    ui: { ...(base.ui || {}), ...(patch.ui || {}) },
    backdrops,
  };
}

/** Map local hour segment → backdrop key (matches dashboard/lib/agentDayPart.ts). */
export function scenePresetForDayPart(part) {
  switch (part) {
    case 'late-night':
      return 'night';
    case 'evening':
      return 'dusk';
    case 'morning':
      return 'dawn';
    case 'afternoon':
      return 'day';
    default:
      return 'night';
  }
}

/**
 * Resolve a renderable AgentHomeSceneConfig `{ version, layers, atmosphere, ui }`.
 * @param {Record<string, unknown>} cmsConfig
 * @param {string} [dayPart] — AgentDayPart string from client clock
 */
export function resolveAgentHomeSceneForDisplay(cmsConfig, dayPart = 'afternoon') {
  const cfg = sanitizeAgentHomeCms(cmsConfig) || DEFAULT_AGENT_HOME_CMS;
  const atmosphere = cfg.atmosphere || DEFAULT_AGENT_HOME_CMS.atmosphere;
  const ui = cfg.ui || DEFAULT_AGENT_HOME_CMS.ui;

  let presetKey = scenePresetForDayPart(dayPart);
  if (cfg.mode === 'fixed' && cfg.fixedPreset) {
    const fixed = String(cfg.fixedPreset);
    if (fixed === 'moonlit-sea' || fixed === 'night') presetKey = 'night';
    else if (PRESET_IDS.has(fixed)) presetKey = fixed;
  }

  const backdrops = cfg.backdrops || DEFAULT_AGENT_HOME_CMS.backdrops;
  let layers = backdrops[presetKey]?.layers || backdrops.night?.layers || DEFAULT_AGENT_HOME_CMS.backdrops.night.layers;

  if (Array.isArray(cfg.layers) && cfg.layers.length && !cfg.backdrops) {
    layers = cfg.layers;
  }

  if (presetKey === 'minimal-dark') {
    layers = backdrops['minimal-dark']?.layers || DEFAULT_AGENT_HOME_CMS.backdrops['minimal-dark'].layers;
  }

  return {
    version: 1,
    layers: layers.map((l) => ({ ...l })),
    atmosphere: { ...atmosphere },
    ui: { ...ui },
  };
}

export function agentHomeCmsToLegacyScene(cmsConfig, dayPart = 'afternoon') {
  return resolveAgentHomeSceneForDisplay(cmsConfig, dayPart);
}
