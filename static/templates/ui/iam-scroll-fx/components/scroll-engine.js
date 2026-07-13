/**
 * ScrollEngine — a dependency-free scroll-progress core.
 *
 * Mental model (see README §Mental Models):
 *   Scroll is a number, not an event. Every chapter gets one normalized
 *   float, 0 → 1, recomputed on every frame from cached geometry, written
 *   to a single CSS custom property. CSS derives everything else via
 *   calc(). This file's only job is producing that number correctly,
 *   cheaply, and without layout thrash.
 *
 * Usage:
 *   <section class="chapter" data-chapter>
 *     <div class="chapter__sticky">...</div>
 *   </section>
 *
 *   ScrollEngine.init({ selector: '[data-chapter]' });
 *
 * Each matched element gets `--progress` written to it every frame while
 * it's within its scroll track, clamped [0, 1]. A `chapter.dataset.active`
 * flag ("true"/"false") is also toggled so CSS can gate expensive rules
 * (e.g. `[data-active="false"] { visibility: hidden }`) outside the track.
 */
(function (global) {
  "use strict";

  function clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  }

  function ScrollEngine(options) {
    this.opts = Object.assign(
      {
        selector: "[data-chapter]",
        // Property name written to each matched element.
        cssVar: "--progress",
        // Extra vh of "runway" before/after a chapter counts toward its
        // progress, so effects can start slightly early. 0 = exact.
        lead: 0,
        onFrame: null,
      },
      options || {}
    );

    this.reducedMotion = global.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    this.tracks = [];
    this.ticking = false;
    this.scrollY = global.scrollY || 0;
    this.viewportH = global.innerHeight;

    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);
    this._raf = this._raf.bind(this);

    this._measure();
    this._bind();

    if (this.reducedMotion) {
      // Snap every chapter to its resting state and skip the frame loop
      // entirely. Cheapest possible reduced-motion path, and correct:
      // there is nothing to animate if nothing is measured.
      this.tracks.forEach((t) => this._write(t, 1, true));
    } else {
      this._raf();
    }
  }

  ScrollEngine.prototype._measure = function () {
    const nodes = global.document.querySelectorAll(this.opts.selector);
    this.tracks = Array.prototype.map.call(nodes, (el) => ({
      el,
      top: el.offsetTop,
      height: el.offsetHeight,
    }));
  };

  ScrollEngine.prototype._bind = function () {
    global.addEventListener("scroll", this._onScroll, { passive: true });
    global.addEventListener("resize", this._onResize);
  };

  ScrollEngine.prototype.destroy = function () {
    global.removeEventListener("scroll", this._onScroll);
    global.removeEventListener("resize", this._onResize);
  };

  ScrollEngine.prototype._onScroll = function () {
    this.scrollY = global.scrollY;
    if (!this.ticking && !this.reducedMotion) {
      this.ticking = true;
      global.requestAnimationFrame(this._raf);
    }
  };

  ScrollEngine.prototype._onResize = function () {
    this.viewportH = global.innerHeight;
    this._measure(); // geometry only recomputed here, never in the hot path
    if (this.reducedMotion) {
      this.tracks.forEach((t) => this._write(t, 1, true));
    }
  };

  ScrollEngine.prototype._write = function (track, progress, active) {
    track.el.style.setProperty(this.opts.cssVar, progress.toFixed(4));
    track.el.dataset.active = active ? "true" : "false";
  };

  ScrollEngine.prototype._raf = function () {
    const lead = this.opts.lead;
    const vh = this.viewportH;

    for (let i = 0; i < this.tracks.length; i++) {
      const t = this.tracks[i];
      const denom = t.height - vh;
      const p =
        denom > 0
          ? clamp((this.scrollY - t.top + lead) / (denom + lead * 2), 0, 1)
          : this.scrollY >= t.top
          ? 1
          : 0; // guard: track exactly viewport height (§3, bug #2)

      const active = this.scrollY + vh > t.top && this.scrollY < t.top + t.height;
      this._write(t, p, active);
    }

    if (typeof this.opts.onFrame === "function") {
      this.opts.onFrame(this.tracks);
    }

    this.ticking = false;
  };

  global.ScrollEngine = {
    init: function (options) {
      return new ScrollEngine(options);
    },
  };
})(window);
