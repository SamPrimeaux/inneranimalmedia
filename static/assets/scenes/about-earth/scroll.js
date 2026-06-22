/* scroll.js — scroll choreography for /about culture + promise scene.
   Drives DOM panels and window.EarthScene.setProgress from one timeline. */
(function () {
  "use strict";

  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const section = document.getElementById("earth-section");
  if (!section) return;

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

  // scroll bands
  const CULTURE_IN = [0.06, 0.22];
  const CULTURE_OUT = [0.38, 0.52];
  const PROMISE_IN = [0.44, 0.58];
  const PROMISE_OUT = [0.74, 0.86];
  const CLOSE_IN = [0.82, 0.96];
  const HINT_OUT = [0.04, 0.14];

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
    const t = easeInOut(seg(p, 0.1, 0.75));
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

  function setHint(p) {
    if (!hint) return;
    const out = easeInOut(seg(p, HINT_OUT[0], HINT_OUT[1]));
    hint.style.opacity = (1 - out).toFixed(3);
  }

  let renderedP = 0;
  function apply(raw) {
    setPanel(culture, raw, CULTURE_IN, CULTURE_OUT, "left");
    setPanel(promise, raw, PROMISE_IN, PROMISE_OUT, "right");
    setBg(raw);
    setClosing(raw);
    setHint(raw);
    if (window.EarthScene && window.EarthScene.ready) {
      window.EarthScene.setProgress(raw);
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
