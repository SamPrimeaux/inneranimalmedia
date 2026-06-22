/* scroll.js — scroll choreography for /about earth scene (hero + culture + promise).
   Drives hero intro, DOM panels, and window.EarthScene.setProgress from one timeline. */
(function () {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const section = document.getElementById("earth-section");
  if (!section) return;

  const heroIntro = document.getElementById("hero-intro");
  const culture = document.getElementById("culture-panel");
  const promise = document.getElementById("promise-panel");
  const closing = document.getElementById("earth-closing");
  const hint = document.getElementById("scroll-hint");
  const stageBg = document.getElementById("earth-stage-bg");

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  function isMobile() { return matchMedia("(max-width:860px)").matches; }
  if (isMobile()) section.classList.add("compact");

  // hero lifts away first; scene timeline starts slightly before hero fully exits
  const HERO_OUT0 = 0.02, HERO_OUT1 = 0.14, SCENE_START = 0.08;
  const sceneOf = (raw) => seg(raw, SCENE_START, 1.0);

  const CULTURE_IN = [0.10, 0.26];
  const CULTURE_OUT = [0.40, 0.54];
  const PROMISE_IN = [0.46, 0.60];
  const PROMISE_OUT = [0.76, 0.88];
  const CLOSE_IN = [0.84, 0.98];
  const HINT_OUT = [0.06, 0.16];

  function setHero(raw) {
    if (!heroIntro) return;
    const out = easeInOut(seg(raw, HERO_OUT0, HERO_OUT1));
    const y = -out * window.innerHeight * (isMobile() ? 0.12 : 0.16);
    const s = lerp(1, 0.96, out);
    heroIntro.style.opacity = (1 - out).toFixed(3);
    heroIntro.style.filter = out > 0.01 ? `blur(${(out * 8).toFixed(1)}px)` : "none";
    heroIntro.style.transform = `translate(-50%,-50%) translateY(${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
    heroIntro.style.pointerEvents = out > 0.55 ? "none" : "auto";
  }

  function setPanel(el, p, winIn, winOut, fromSide) {
    if (!el) return;
    const m = isMobile();
    const inT = easeOut(seg(p, winIn[0], winIn[1]));
    const outT = easeInOut(seg(p, winOut[0], winOut[1]));
    const op = inT * (1 - outT);
    const blur = lerp(14, 0, easeOut(seg(p, winIn[0], winIn[0] + (winIn[1] - winIn[0]) * 0.65)));
    const slide = fromSide === "left"
      ? lerp(m ? 0 : -48, 0, inT) + outT * (m ? -24 : -36)
      : lerp(m ? 0 : 48, 0, inT) + outT * (m ? 24 : 36);
    const yLift = outT * -28;
    el.style.opacity = op.toFixed(3);
    el.style.filter = blur > 0.1 ? `blur(${blur.toFixed(1)}px)` : "none";
    el.style.transform = `translateY(calc(-50% + ${yLift.toFixed(1)}px)) translateX(${slide.toFixed(1)}px)`;
  }

  function setBg(p) {
    if (!stageBg) return;
    const t = easeInOut(seg(p, 0.08, 0.78));
    const blue = Math.round(lerp(28, 42, t));
    const cyan = Math.round(lerp(14, 22, t));
    stageBg.style.background =
      `radial-gradient(circle at ${lerp(12, 22, t).toFixed(0)}% 18%, rgba(47,123,255,${lerp(0.28, 0.38, t).toFixed(2)}), transparent 38%),` +
      `radial-gradient(circle at 88% 72%, rgba(103,232,255,${lerp(0.14, 0.22, t).toFixed(2)}), transparent 42%),` +
      `linear-gradient(180deg, rgb(5,7,${blue}) 0%, rgb(10,16,${cyan}) 100%)`;
  }

  function setClosing(p) {
    if (!closing) return;
    const r = easeOut(seg(p, CLOSE_IN[0], CLOSE_IN[1]));
    closing.style.opacity = r.toFixed(3);
    closing.style.transform = `translateX(-50%) translateY(${lerp(28, 0, r).toFixed(1)}px)`;
    closing.style.pointerEvents = r > 0.45 ? "auto" : "none";
  }

  function setHint(raw) {
    if (!hint) return;
    const out = easeInOut(seg(raw, HINT_OUT[0], HINT_OUT[1]));
    hint.style.opacity = (1 - out).toFixed(3);
  }

  let renderedP = 0;
  function apply(raw) {
    setHero(raw);
    const p = sceneOf(raw);
    setPanel(culture, p, CULTURE_IN, CULTURE_OUT, "left");
    setPanel(promise, p, PROMISE_IN, PROMISE_OUT, "right");
    setBg(p);
    setClosing(p);
    setHint(raw);
    if (window.EarthScene && window.EarthScene.ready) {
      window.EarthScene.setProgress(p);
    }
    section.setAttribute("data-screen-label", "earth " + Math.round(raw * 100) + "%");
  }

  function targetProgress() {
    const rect = section.getBoundingClientRect();
    const total = rect.height - window.innerHeight;
    if (total <= 0) return 0;
    return clamp(-rect.top / total, 0, 1);
  }

  let raf = null;
  function frame() {
    raf = null;
    const tp = targetProgress();
    const damp = reduceMotion ? 1 : 0.14;
    renderedP += (tp - renderedP) * damp;
    if (Math.abs(tp - renderedP) < 0.0004) renderedP = tp;
    apply(renderedP);
    if (Math.abs(tp - renderedP) > 0.0002) schedule();
  }
  function schedule() { if (raf == null) raf = requestAnimationFrame(frame); }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", () => {
    if (isMobile()) section.classList.add("compact");
    else section.classList.remove("compact");
    schedule();
  });

  apply(0);
  schedule();

  window.__applyEarthScene = (p) => { renderedP = p; apply(p); };
})();
