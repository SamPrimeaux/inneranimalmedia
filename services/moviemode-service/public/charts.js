/* charts.js — clean monochrome mini-charts drawn as inline SVG.
   Inherits color from each chart container (currentColor), so it adapts
   to the light/dark card theme automatically. Deterministic shapes. */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const el = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
  function makeSvg(w, h) {
    const s = el("svg", { viewBox: `0 0 ${w} ${h}` });
    s.setAttribute("fill", "none");
    return s;
  }

  // gentle deterministic series
  const wave = (n, base, amp, freq, phase) =>
    Array.from({ length: n }, (_, i) =>
      base + Math.sin(i * freq + phase) * amp + Math.sin(i * freq * 2.3 + 1.7) * amp * 0.35);

  function dots(node) {
    const W = 280, H = 74, n = 24, pad = 4;
    const s = makeSvg(W, H);
    const ys = wave(n, H * 0.5, H * 0.18, 0.62, 0.4);
    // faint baseline
    s.appendChild(el("line", { x1: pad, y1: H - 6, x2: W - pad, y2: H - 6, stroke: "currentColor", "stroke-width": 1, "stroke-opacity": 0.18, "stroke-dasharray": "2 4" }));
    for (let i = 0; i < n; i++) {
      const x = pad + (i / (n - 1)) * (W - pad * 2);
      s.appendChild(el("circle", { cx: x.toFixed(1), cy: ys[i].toFixed(1), r: 2.1, fill: "currentColor", "fill-opacity": i > n - 5 ? 0.35 : 0.7 }));
    }
    // "today" guide
    s.appendChild(el("line", { x1: W - 40, y1: 6, x2: W - 40, y2: H - 6, stroke: "currentColor", "stroke-width": 1, "stroke-opacity": 0.22, "stroke-dasharray": "3 3" }));
    node.appendChild(s);
  }

  function bars(node) {
    const W = 280, H = 74, n = 26, pad = 3, gap = 2;
    const s = makeSvg(W, H);
    const bw = (W - pad * 2 - gap * (n - 1)) / n;
    const hs = wave(n, H * 0.5, H * 0.34, 0.8, 1.2).map(v => Math.max(8, Math.min(H - 6, v)));
    for (let i = 0; i < n; i++) {
      const x = pad + i * (bw + gap);
      const bh = hs[i];
      s.appendChild(el("rect", { x: x.toFixed(1), y: (H - bh).toFixed(1), width: bw.toFixed(1), height: bh.toFixed(1), rx: Math.min(1.6, bw / 2), fill: "currentColor", "fill-opacity": i % 7 === 4 ? 0.85 : 0.55 }));
    }
    node.appendChild(s);
  }

  function smoothPath(pts) {
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  }

  function line(node) {
    const W = 280, H = 74, n = 9, pad = 4;
    const s = makeSvg(W, H);
    const ys = wave(n, H * 0.5, H * 0.26, 0.95, 0.2);
    const pts = ys.map((y, i) => [pad + (i / (n - 1)) * (W - pad * 2), Math.max(8, Math.min(H - 8, y))]);
    const d = smoothPath(pts);
    // area fill
    const area = el("path", { d: `${d} L ${W - pad} ${H} L ${pad} ${H} Z`, fill: "currentColor", "fill-opacity": 0.06 });
    s.appendChild(area);
    s.appendChild(el("path", { d, stroke: "currentColor", "stroke-width": 1.6, "stroke-opacity": 0.8, "stroke-linecap": "round", fill: "none" }));
    s.appendChild(el("circle", { cx: pts[pts.length - 1][0].toFixed(1), cy: pts[pts.length - 1][1].toFixed(1), r: 2.6, fill: "currentColor" }));
    node.appendChild(s);
  }

  function spark(node, seed) {
    const W = 170, H = 34, n = 14, pad = 2;
    const s = makeSvg(W, H);
    const ys = wave(n, H * 0.5, H * 0.3, 1.1, seed);
    const pts = ys.map((y, i) => [pad + (i / (n - 1)) * (W - pad * 2), Math.max(4, Math.min(H - 4, y))]);
    s.appendChild(el("path", { d: smoothPath(pts), stroke: "currentColor", "stroke-width": 1.4, "stroke-opacity": 0.7, fill: "none", "stroke-linecap": "round" }));
    node.appendChild(s);
  }

  function init() {
    document.querySelectorAll("[data-chart]").forEach(node => {
      const kind = node.getAttribute("data-chart");
      if (kind === "dots") dots(node);
      else if (kind === "bars") bars(node);
      else if (kind === "line") line(node);
      else if (kind === "spark") spark(node, 0.4);
      else if (kind === "spark2") spark(node, 2.1);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
