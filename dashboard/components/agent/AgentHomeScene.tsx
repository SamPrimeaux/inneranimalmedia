import { useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import type { AgentHomeSceneConfig, SceneLayer } from '../../types/agentHomeScene';
import { DEFAULT_AGENT_HOME_SCENE } from '../../types/agentHomeScene';
import '../../styles/agent-home-tokens.css';
import './AgentHomeScene.css';

interface AgentHomeSceneProps {
  config?: AgentHomeSceneConfig;
  /** Pause all motion/webgl — pass `document.hidden` or route !== '/agent' */
  paused?: boolean;
}

/**
 * Renders the moonlit-sea (or custom) background behind the hero.
 * Zero-WebGL by default: the 'preset' and 'gradient' layer types are pure
 * CSS. 'webgl' layers are dynamically imported and only touched if a user
 * has actually picked one in the scene editor — see Phase 1 of the backend
 * brief for where presets get persisted.
 */
export function AgentHomeScene({ config, paused }: AgentHomeSceneProps) {
  const scene = config ?? DEFAULT_AGENT_HOME_SCENE;
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="agent-scene" aria-hidden="true">
      {scene.layers.map((layer, i) => (
        <SceneLayerView
          key={i}
          layer={layer}
          paused={paused || reducedMotion}
        />
      ))}
      <div
        className="agent-scene__vignette"
        style={{
          opacity: scene.atmosphere?.vignette ?? 0.35,
        }}
      />
      {!reducedMotion && (
        <div
          className="agent-scene__grain"
          style={{ opacity: scene.atmosphere?.grain ?? 0.04 }}
        />
      )}
    </div>
  );
}

function SceneLayerView({
  layer,
  paused,
}: {
  layer: SceneLayer;
  paused?: boolean;
}) {
  switch (layer.type) {
    case 'preset':
      return <PresetLayer id={layer.id} animated={!paused} />;
    case 'gradient':
      return (
        <div
          className="agent-scene__gradient"
          style={{
            backgroundImage: `linear-gradient(${layer.angle}deg, ${layer.stops.join(', ')})`,
          }}
        />
      );
    case 'image':
      return (
        <div
          className="agent-scene__image"
          style={{
            backgroundImage: `url(${layer.url})`,
            filter: layer.blur ? `blur(${layer.blur}px)` : undefined,
          }}
        />
      );
    case 'video':
      return (
        <video
          className="agent-scene__video"
          src={layer.url}
          muted={layer.muted}
          autoPlay={!paused}
          loop
          playsInline
        />
      );
    case 'webgl':
      return <LazyWebglLayer presetId={layer.presetId} params={layer.params} paused={paused} />;
    default:
      return null;
  }
}

/** Pure-CSS built-in scenes. No canvas, no WebGL — this is what 95% of users see. */
function PresetLayer({ id, animated }: { id: string; animated: boolean }) {
  if (id === 'moonlit-sea') {
    return (
      <div className="agent-scene__preset agent-scene__preset--moonlit-sea">
        <div className="agent-scene__haze" />
        <div className="agent-scene__moon" />
        <div className="agent-scene__moon-halo" />
        <div
          className={
            animated
              ? 'agent-scene__water agent-scene__water--animated'
              : 'agent-scene__water'
          }
        />
      </div>
    );
  }
  if (id === 'aurora') {
    return <div className="agent-scene__preset agent-scene__preset--aurora" />;
  }
  return <div className="agent-scene__preset agent-scene__preset--minimal-dark" />;
}

/** WebGL presets are opt-in only — each preset is its own lazy chunk. */
const WEBGL_PRESET_LOADERS: Record<
  string,
  () => Promise<{ default: ComponentType<{ params: Record<string, number>; paused?: boolean }> }>
> = {
  // Register presets here, e.g. 'particles': () => import('../scenes/webgl/particles.tsx'),
};

function LazyWebglLayer({
  presetId,
  params,
  paused,
}: {
  presetId: string;
  params: Record<string, number>;
  paused?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [Comp, setComp] = useState<ComponentType<{ params: Record<string, number>; paused?: boolean }> | null>(null);

  useEffect(() => {
    let active = true;
    const loader = WEBGL_PRESET_LOADERS[presetId];
    if (!loader) {
      setComp(null);
      return () => {
        active = false;
      };
    }
    loader()
      .then((mod) => {
        if (active) setComp(() => mod.default);
      })
      .catch(() => {
        if (active) setComp(null);
      });
    return () => {
      active = false;
    };
  }, [presetId]);

  return (
    <div ref={containerRef} className="agent-scene__webgl">
      {Comp ? <Comp params={params} paused={paused} /> : null}
    </div>
  );
}

function usePrefersReducedMotion() {
  return useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);
}
