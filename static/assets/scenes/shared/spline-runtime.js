/**
 * Shared Spline runtime bootstrap for IAM CMS scene embeds.
 * Source .spline files live in scenes/_source/; set SCENE_URL after Spline publish.
 */
export const SPLINE_RUNTIME_VERSION = '1.9.98';
export const SPLINE_RUNTIME_CDN = `https://esm.sh/@splinetool/runtime@${SPLINE_RUNTIME_VERSION}`;

/**
 * @param {{
 *   canvas: HTMLCanvasElement | null;
 *   sceneUrl?: string;
 *   logPrefix?: string;
 *   findRootNames?: string[];
 *   fallbackBodyClass?: string;
 * }} config
 */
export function createSplineSceneController(config) {
  const {
    canvas,
    sceneUrl = '',
    logPrefix = '[spline]',
    findRootNames = ['Scene', 'Group', 'Root'],
    fallbackBodyClass = 'no-spline',
  } = config;

  /** @type {{ ready: boolean; app: import('@splinetool/runtime').Application | null; boot: () => Promise<typeof API>; findRoot: () => unknown; requestRender: () => void }} */
  const API = {
    ready: false,
    app: null,
    boot: bootScene,
    findRoot: () => null,
    requestRender() {
      try {
        API.app?.requestRender();
      } catch (_) {
        /* noop */
      }
    },
  };

  function findRoot(app) {
    for (const name of findRootNames) {
      try {
        const obj = app.findObjectByName(name);
        if (obj) return obj;
      } catch (_) {
        /* scene-specific */
      }
    }
    return null;
  }

  function showFallback(reason) {
    if (reason) console.warn(`${logPrefix} ${reason}`);
    document.body?.classList.add(fallbackBodyClass);
  }

  async function bootScene() {
    if (!canvas) {
      API.ready = true;
      return API;
    }

    const url = String(sceneUrl || '').trim();
    if (!url) {
      showFallback('No scene URL — open _source/*.spline in Spline, publish, then set SCENE_URL.');
      API.ready = true;
      return API;
    }

    try {
      const { Application } = await import(SPLINE_RUNTIME_CDN);
      const app = new Application(canvas, { renderOnDemand: true });
      await app.load(url);
      API.app = app;
      API.findRoot = () => findRoot(app);
      API.ready = true;
      API.requestRender();
    } catch (err) {
      showFallback(`load failed: ${err?.message || err}`);
      API.ready = true;
    }

    return API;
  }

  return API;
}
