/* spline.js — holographic earth scene (Spline runtime).
   Exposes window.EarthScene = { setProgress, ready, renderNow }.
   Falls back gracefully if WebGL or Spline load fails. */
(function () {
  "use strict";

  const SCENE_URL = "https://prod.spline.design/CNI9Bx5eUGw7Eom2/scene.splinecode";
  const canvas = document.getElementById("earth-canvas");
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const API = {
    ready: false,
    setProgress() {},
    renderNow() {},
  };
  window.EarthScene = API;

  if (!canvas) return;

  let app = null;
  let rootObj = null;
  let scrollVar = null;
  let lastProgress = -1;

  function findRoot(spline) {
    const names = ["Earth", "Globe", "Planet", "Scene", "Group", "Root"];
    for (const n of names) {
      try {
        const obj = spline.findObjectByName(n);
        if (obj) return obj;
      } catch (_) { /* scene-specific */ }
    }
    return null;
  }

  function detectScrollVariable(spline) {
    try {
      const vars = spline.getVariables();
      const keys = Object.keys(vars || {});
      const hit = keys.find((k) => /scroll|progress/i.test(k));
      return hit || null;
    } catch (_) {
      return null;
    }
  }

  function applyProgress(p) {
    if (!app || !API.ready) return;
    if (Math.abs(p - lastProgress) < 0.0003) return;
    lastProgress = p;

    if (scrollVar) {
      try { app.setVariable(scrollVar, p); } catch (_) { /* noop */ }
    }

    if (rootObj) {
      rootObj.rotation.y = p * Math.PI * 1.6;
      rootObj.rotation.x = Math.sin(p * Math.PI) * 0.12;
    }

    try { app.requestRender(); } catch (_) { /* noop */ }
  }

  API.setProgress = applyProgress;
  API.renderNow = applyProgress;

  async function boot() {
    try {
      const { Application } = await import(
        "https://esm.sh/@splinetool/runtime@1.9.98"
      );
      app = new Application(canvas, { renderOnDemand: true });
      await app.load(SCENE_URL);

      rootObj = findRoot(app);
      scrollVar = detectScrollVariable(app);

      if (!scrollVar) {
        const fallbacks = ["scrollProgress", "scroll", "progress"];
        for (const name of fallbacks) {
          try {
            app.setVariable(name, 0);
            scrollVar = name;
            break;
          } catch (_) { /* variable absent */ }
        }
      }

      API.ready = true;
      applyProgress(0);
    } catch (err) {
      console.warn("[about-earth] Spline load failed, using fallback:", err);
      document.body.classList.add("no-spline");
      API.ready = true;
    }
  }

  boot();

  if (!reduceMotion) {
    let raf = null;
    function tick() {
      raf = null;
      if (API.ready && typeof window.__earthTargetProgress === "number") {
        applyProgress(window.__earthTargetProgress);
      }
    }
    API.renderNow = function (p) {
      window.__earthTargetProgress = p;
      if (raf == null) raf = requestAnimationFrame(tick);
    };
  }
})();
