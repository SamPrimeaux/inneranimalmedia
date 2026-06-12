/* scroll.js — single source of truth for scroll progress.
   Smooths progress for a cinematic, damped feel, then drives the globe
   (window.GlobeScene), the DOM card choreography, headline, background
   and closing CTA. Also wires the small Tweaks panel. */
(function () {
  "use strict";
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const section = document.getElementById("globe-section");
  const stageBg = document.getElementById("stage-bg");
  const heroIntro = document.getElementById("hero-intro");
  const headline = document.getElementById("headline");
  const closing = document.getElementById("closing");
  const cardsWrap = document.getElementById("cards");
  const cards = {};
  document.querySelectorAll("[data-card]").forEach(c => { cards[c.getAttribute("data-card")] = c; });

  cardsWrap.style.perspective = "1500px";

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function isMobile() { return matchMedia("(max-width:760px)").matches; }
  if (isMobile()) section.classList.add("compact");

  // ----- scroll bands -----
  // The intro hero overlays the quiet globe, then lifts away while the scene
  // proper begins — so the globe is present from frame one and "comes in" as
  // the title/blurb leave. The scene's internal 0..1 timeline is preserved.
  const HERO_OUT0 = 0.04, HERO_OUT1 = 0.16, SCENE_START = 0.10;
  const sceneOf = (raw) => seg(raw, SCENE_START, 1.0);

  function setHero(raw) {
    const out = easeInOut(seg(raw, HERO_OUT0, HERO_OUT1));
    const y = -out * window.innerHeight * (isMobile() ? 0.14 : 0.18);
    const s = lerp(1, 0.955, out);
    heroIntro.style.opacity = (1 - out).toFixed(3);
    heroIntro.style.filter = out > 0.01 ? `blur(${(out * 7).toFixed(1)}px)` : "none";
    heroIntro.style.transform = `translate(-50%,-50%) translateY(${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
    heroIntro.style.pointerEvents = out > 0.5 ? "none" : "auto";
  }

  // ----- background light-space -> dark-space -----
  function colMix(c1, c2, t) {
    return c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
  }
  const glowA = [150, 168, 176], glowB = [54, 64, 70];      // top halo
  const baseA = [22, 26, 28], baseB = [7, 9, 10];           // top of linear
  const base2A = [12, 15, 16], base2B = [4, 5, 6];          // bottom of linear
  function setBg(p) {
    const t = easeInOut(seg(p, 0.05, 0.9));
    const g = colMix(glowA, glowB, t);
    const b = colMix(baseA, baseB, t);
    const b2 = colMix(base2A, base2B, t);
    stageBg.style.background =
      `radial-gradient(120% 85% at 50% -6%, rgb(${g[0]},${g[1]},${g[2]}) 0%, rgba(${g[0]},${g[1]},${g[2]},0) 46%),` +
      `linear-gradient(180deg, rgb(${b[0]},${b[1]},${b[2]}) 0%, rgb(${b2[0]},${b2[1]},${b2[2]}) 100%)`;
  }

  // ----- headline -----
  function setHeadline(p) {
    const reveal = seg(p, 0.06, 0.34);
    const op = lerp(0.08, 1, easeOut(reveal));
    const blur = lerp(16, 0, easeOut(reveal));
    const yIn = lerp(26, 0, easeOut(reveal));
    // late: lift up + shrink into a quiet top anchor as the closing takes over
    const lift = easeInOut(seg(p, 0.70, 0.94));
    const yLate = lift * (-(window.innerHeight) * (isMobile() ? 0.30 : 0.27));
    const scale = lerp(1, isMobile() ? 0.7 : 0.6, lift);
    const opLate = lerp(1, 0.5, lift);
    headline.style.opacity = (op * (reveal >= 1 ? 1 : 1)) * opLate;
    headline.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
    headline.style.transform = `translate(-50%,-50%) translateY(${(yIn + yLate).toFixed(1)}px) scale(${scale.toFixed(3)})`;
  }

  // ----- closing copy + CTA -----
  function setClosing(p) {
    const r = easeOut(seg(p, 0.86, 1.0));
    closing.style.opacity = r;
    closing.style.transform = `translateY(${lerp(34, 0, r).toFixed(1)}px)`;
    closing.style.pointerEvents = r > 0.5 ? "auto" : "none";
  }

  // ----- cards -----
  // each entry: from (entrance), to (settled), window [in0,in1]
  function layout() {
    const W = window.innerWidth, H = window.innerHeight, m = isMobile();
    if (m) {
      // vertical-ish stack, tighter, centered-lower, small chips hidden via CSS
      return {
        ideas:       { to: { x: 0, y: -H * 0.16, z: 30, r: 0, s: 0.82 }, from: { x: -W * 0.5, y: -H * 0.16, z: -40, r: 18, s: 0.7 }, win: [0.18, 0.40] },
        systems:     { to: { x: 0, y: 0,         z: 70, r: 0, s: 0.9  }, from: { x: 0, y: H * 0.18, z: -40, r: 0,  s: 0.74 }, win: [0.38, 0.58] },
        launch:      { to: { x: 0, y: H * 0.16,  z: 30, r: 0, s: 0.82 }, from: { x: W * 0.5, y: H * 0.16, z: -40, r: -18, s: 0.7 }, win: [0.46, 0.66] },
        response:    { to: { x: 0, y: 0, z: 0, r: 0, s: 0.7 }, from: { x: 0, y: 0, z: 0, r: 0, s: 0.7 }, win: [2, 3] },
        automations: { to: { x: 0, y: 0, z: 0, r: 0, s: 0.7 }, from: { x: 0, y: 0, z: 0, r: 0, s: 0.7 }, win: [2, 3] },
      };
    }
    const late = x => x; // placeholder
    return {
      ideas:       { to: { x: -W * 0.258, y: 10,  z: 10,  r: 16,  s: 0.92 }, from: { x: -W * 0.62, y: 10, z: -120, r: 26,  s: 0.78 }, win: [0.18, 0.40] },
      systems:     { to: { x: 0,          y: -8,  z: 130, r: 0,   s: 1.0  }, from: { x: 0, y: H * 0.18, z: -80, r: 0,   s: 0.80 }, win: [0.40, 0.58] },
      launch:      { to: { x: W * 0.258,  y: 10,  z: 10,  r: -16, s: 0.92 }, from: { x: W * 0.62, y: 10, z: -120, r: -26, s: 0.78 }, win: [0.46, 0.64] },
      response:    { to: { x: -W * 0.360, y: -H * 0.205, z: -50, r: 13,  s: 0.84 }, from: { x: -W * 0.62, y: -H * 0.30, z: -160, r: 22, s: 0.7 }, win: [0.52, 0.72] },
      automations: { to: { x: W * 0.368,  y: H * 0.215,  z: -50, r: -13, s: 0.84 }, from: { x: W * 0.62, y: H * 0.32, z: -160, r: -22, s: 0.7 }, win: [0.58, 0.78] },
    };
  }
  let L = layout();
  window.addEventListener("resize", () => { L = layout(); if (isMobile()) section.classList.add("compact"); else section.classList.remove("compact"); });

  function setCards(p) {
    const W = window.innerWidth, m = isMobile();
    // late global shift right (desktop) mirrors globe, opening bottom-left for copy
    const shift = m ? 0 : easeInOut(seg(p, 0.72, 1.0)) * W * 0.05;
    for (const key in L) {
      const card = cards[key]; if (!card) continue;
      const cfg = L[key];
      const t = easeOut(seg(p, cfg.win[0], cfg.win[1]));
      const x = lerp(cfg.from.x, cfg.to.x, t) + shift;
      const y = lerp(cfg.from.y, cfg.to.y, t);
      const z = lerp(cfg.from.z, cfg.to.z, t);
      const r = lerp(cfg.from.r, cfg.to.r, t);
      const s = lerp(cfg.from.s, cfg.to.s, t);
      const blur = lerp(14, 0, easeOut(seg(p, cfg.win[0], cfg.win[0] + (cfg.win[1] - cfg.win[0]) * 0.7)));
      card.style.opacity = clamp(t * 1.15, 0, 1);
      card.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : "none";
      card.style.transform =
        `translate3d(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px), ${z.toFixed(1)}px) rotateY(${r.toFixed(1)}deg) scale(${s.toFixed(3)})`;
    }
  }

  // ----- master apply -----
  let renderedP = 0;
  function apply(raw) {
    setHero(raw);
    const p = sceneOf(raw);
    setBg(p);
    setHeadline(p);
    setClosing(p);
    setCards(p);
    if (window.GlobeScene && window.GlobeScene.ready) window.GlobeScene.setProgress(p);
    section.setAttribute("data-screen-label", "globe " + Math.round(p * 100) + "%");
  }

  function targetProgress() {
    const rect = section.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    return clamp(-rect.top / total, 0, 1);
  }

  // scroll-driven smoothing loop: any scroll/resize schedules frames,
  // which lerp toward the target and stop once settled (cheap + robust).
  let raf = null;
  function frame() {
    raf = null;
    const tp = targetProgress();
    const damp = reduceMotion ? 1 : 0.16;
    renderedP += (tp - renderedP) * damp;
    if (Math.abs(tp - renderedP) < 0.0004) renderedP = tp;
    apply(renderedP);
    if (Math.abs(tp - renderedP) > 0.0002) schedule();
  }
  function schedule() { if (raf == null) raf = requestAnimationFrame(frame); }
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", () => { L = layout(); schedule(); });
  apply(0);
  schedule();

  // verification / robustness hook: apply any progress synchronously
  window.__applyScene = (p) => { renderedP = p; apply(p); if (window.GlobeScene && window.GlobeScene.renderNow) window.GlobeScene.renderNow(p); };

  // ================= Tweaks =================
  const toggle = document.getElementById("tweak-toggle");
  const panel = document.getElementById("tweak-panel");
  toggle.addEventListener("click", () => panel.classList.toggle("hidden"));
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) panel.classList.add("hidden");
  });

  // card glass
  panel.querySelector('[data-tw="cards"]').addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    panel.querySelectorAll('[data-tw="cards"] button').forEach(x => x.setAttribute("aria-pressed", x === b));
    document.body.classList.toggle("cards-dark", b.dataset.val === "dark");
  });
  // globe tint — each swatch is a full scene "mood": the globe surface and
  // atmosphere lerp smoothly (in globe.js), and a soft scene-wide wash shifts
  // the temperature so the change reads as polish, not a hard swap.
  const MOODS = {
    mineral: { tint: [0.55, 0.60, 0.64], atmo: [0.80, 0.87, 0.92] },
    slate:   { tint: [0.46, 0.54, 0.62], atmo: [0.72, 0.82, 0.96] },
    clay:    { tint: [0.60, 0.565, 0.515], atmo: [0.93, 0.86, 0.77] },
  };
  panel.querySelector('[data-tw="tint"]').addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    panel.querySelectorAll('[data-tw="tint"] button').forEach(x => x.setAttribute("aria-pressed", x === b));
    const m = MOODS[b.dataset.mood]; if (!m) return;
    document.body.setAttribute("data-mood", b.dataset.mood);
    const trySet = () => {
      if (window.GlobeScene && window.GlobeScene.setTint) {
        window.GlobeScene.setTint(m.tint);
        if (window.GlobeScene.setAtmo) window.GlobeScene.setAtmo(m.atmo);
      } else setTimeout(trySet, 120);
    };
    trySet();
  });
  // motion
  const motion = document.getElementById("tw-motion");
  const motionVal = document.getElementById("motion-val");
  motion.addEventListener("input", () => {
    const m = motion.value / 100;
    motionVal.textContent = motion.value + "%";
    const trySet = () => { if (window.GlobeScene && window.GlobeScene.setMotion) window.GlobeScene.setMotion(m); else setTimeout(trySet, 120); };
    trySet();
  });
})();
