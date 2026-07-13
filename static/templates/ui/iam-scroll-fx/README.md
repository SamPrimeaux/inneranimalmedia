# Scroll FX Library

A dependency-free set of reusable scroll-driven primitives, extracted into
standalone components. No GSAP, no Lenis, no build step — one core JS file
writes a single `--progress` custom property per chapter; CSS derives every
visual effect from it via `calc()`.

Open `index.html` to see all four primitives live and scrollable.

## Mental model

**Scroll is a number, not an event.** Each `[data-chapter]` element gets one
normalized float, `0 → 1`, recomputed every frame from cached geometry and
written to `--progress`. Nothing is "triggered." Nothing holds state. Scrub
backwards and it unwinds perfectly because it's recomputed, not replayed.

That's the entire architecture. Everything else in this repo is a CSS rule
that consumes that float.

## Files

```
index.html                Live showcase of all four primitives
css/
  tokens.css               Color, type, easing — retheme here only
  base.css                 Showcase page layout/typography (not reusable mechanics)
  scroll-engine.css        The sticky-chapter pin mechanism
  mask-wipe.css            Primitive 1 — directional gradient reveal
  letter-stagger.css       Primitive 2 — per-letter 3D stagger
  progress-primitives.css  Primitive 3/4 — progress bar, clip-path, parallax, scale-in
  demo-scenes.css           Showcase-only dressing, safe to delete
js/
  scroll-engine.js          Core: geometry caching, progress calc, reduced-motion gate
  split-text.js             Character/word splitting + IntersectionObserver arming
  demo.js                   Wires the showcase page only
components/                 Drop-in copies of the reusable files (no showcase deps)
```

## Quick start

```html
<link rel="stylesheet" href="tokens.css" />
<link rel="stylesheet" href="scroll-engine.css" />
<link rel="stylesheet" href="mask-wipe.css" />

<section class="chapter" data-chapter style="--track-h: 300vh">
  <div class="chapter__sticky">
    <h1 class="mask-wipe">Reveals as you scroll.</h1>
  </div>
</section>

<script src="scroll-engine.js"></script>
<script>
  ScrollEngine.init({ selector: "[data-chapter]" });
</script>
```

That's the whole integration. `--track-h` controls pin duration
(`track height − 100vh`); everything downstream is CSS.

## The four primitives

1. **Mask-wipe** (`mask-wipe.css`) — a gradient mask sweeps across an element.
   Works at any width, no measuring, no keyframes. `--rtl`, `--up`, `--down`,
   `--iris` modifiers change direction only; the math never changes.
2. **Letter stagger** (`letter-stagger.css` + `split-text.js`) — splits text
   into spans with incremental delays; CSS transitions do the interpolation.
   Three axes move at once (position + two rotations) — that's what makes it
   read as expensive instead of a fade.
3. **Progress bar / clip-path** (`progress-primitives.css`) — `scaleX` and
   `clip-path: inset()` driven by the same float. Compositor-only, no layout.
4. **Parallax-lite** (`progress-primitives.css` `.parallax`) — cheap depth via
   a per-element `--depth` multiplier on `translateY`. No 3D engine needed for
   this level of effect.

## Two bugs the reference build had — don't repeat them

1. **Layout thrash.** Never call `getBoundingClientRect()` inside the scroll
   handler and immediately write styles. `scroll-engine.js` measures
   `offsetTop`/`offsetHeight` once on load and on resize only — zero DOM reads
   in the scroll hot path.
2. **Divide by zero.** A track exactly `100vh` tall makes
   `height − viewport` equal `0`. `scroll-engine.js` guards this explicitly.

## What's deliberately not included

- **No 3D/WebGL layer.** If a project needs one, keep two clocks: scroll
  drives camera/object transforms, a separate `uTime`-style clock drives
  ambient idle motion. Render on demand (`invalidate()` on scroll change +
  a throttled ambient tick), never a naked 60fps `requestAnimationFrame`.
- **No smooth-scroll library.** Native scroll is used here on purpose so the
  library has zero dependencies. If you want inertia, layer something like
  Lenis on top — feed its virtual scroll value into `ScrollEngine` instead of
  `window.scrollY`, and make sure *only one* clock feeds both your 2D and any
  3D layer, or you'll get drift between them.
- **No `animation-timeline`/`scroll()` native CSS.** Where browser support
  allows, the mask-wipe and stagger primitives could move to native
  scroll-driven animations and drop the JS scroll listener entirely for the
  2D layer. Worth revisiting as support matures.

## Accessibility

Every primitive ships a `prefers-reduced-motion: reduce` fallback:
chapters collapse to normal document flow, masks/clips clear to fully
visible, and `scroll-engine.js` skips its frame loop entirely rather than
animating to a resting snap. This is not optional — bake it in at the same
time you add the effect, not after.

## Porting to a framework

- Move chapter content into your component tree; keep `data-chapter` and
  `--track-h` on the wrapping element.
- Call `ScrollEngine.init()` once, on mount, in a client-only context.
- Store `--progress` as a CSS variable, not React/Vue state — writing
  changing scroll values into component state will re-render on every frame
  and defeat the entire point of this architecture.
- Clean up with `engine.destroy()` on unmount.
