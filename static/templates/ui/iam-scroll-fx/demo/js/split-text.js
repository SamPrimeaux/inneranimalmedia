/**
 * splitText — wraps characters or words in spans with an incremental
 * --d delay custom property, so CSS transitions can stagger with zero
 * JS animation logic. See README Primitive 2 (letter stagger).
 *
 * Usage:
 *   <h1 data-split="chars">Digital experiences</h1>
 *   splitText(document.querySelectorAll('[data-split]'));
 *
 * Then observe with IntersectionObserver and toggle a class, e.g. `.in`,
 * to trigger the CSS transition defined in letter-stagger.css.
 */
(function (global) {
  "use strict";

  function splitText(nodes, options) {
    const opts = Object.assign({ stepMs: 16, unit: null }, options || {});
    const list = nodes.length ? nodes : [nodes];

    Array.prototype.forEach.call(list, (node) => {
      const mode = opts.unit || node.dataset.split || "chars";
      const text = node.textContent;
      node.textContent = "";
      node.setAttribute("aria-label", text);

      const pieces = mode === "words" ? text.split(/(\s+)/) : Array.from(text);

      pieces.forEach((piece, i) => {
        const span = global.document.createElement("span");
        span.className = "ch";
        span.style.setProperty("--d", `${i * opts.stepMs}ms`);
        span.textContent = piece === " " ? "\u00A0" : piece;
        if (piece.trim() === "") span.setAttribute("aria-hidden", "true");
        node.appendChild(span);
      });
    });
  }

  function observeSplit(nodes, options) {
    const opts = Object.assign({ activeClass: "in", threshold: 0.4 }, options || {});
    const list = nodes.length ? nodes : [nodes];

    const reducedMotion = global.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reducedMotion) {
      Array.prototype.forEach.call(list, (n) => n.classList.add(opts.activeClass));
      return null;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add(opts.activeClass);
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: opts.threshold }
    );

    Array.prototype.forEach.call(list, (n) => io.observe(n));
    return io;
  }

  global.splitText = splitText;
  global.observeSplit = observeSplit;
})(window);
