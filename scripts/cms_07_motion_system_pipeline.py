#!/usr/bin/env python3
"""
cms_07_motion_system_pipeline.py

Purpose:
  Convert the IAM animation/motion philosophy into CMS-ready artifacts.

Outputs:
  artifacts/cms_motion_system/
    00_motion_playbook.md
    01_motion_principles.json
    02_motion_patterns.json
    03_motion_tokens.css
    04_motion_runtime.js
    05_motion_demo.html
    06_cms_motion_seed.sql
    07_cursor_implementation_brief.md

Non-mutating by default:
  This script only writes local artifacts.
  It does NOT write to D1 or R2.

Intended pipeline:
  1. Review artifacts.
  2. Store tokens/runtime in R2 or cms_assets.
  3. Register records into cms_component_templates / cms_sections / cms_assets
     after confirming your final table contract.
"""

from __future__ import annotations

import argparse
import json
import re
import time
from pathlib import Path
from typing import Any


ROOT = Path.cwd()
OUT_DIR = ROOT / "artifacts/cms_motion_system"

TENANT_ID = "tenant_sam_primeaux"
WORKSPACE_ID = "ws_inneranimalmedia"
PROJECT_SLUG = "inneranimalmedia"
SYSTEM_SLUG = "iam-motion-system-v1"


CORE_PRINCIPLES = [
    {
        "id": "motion_purpose_driven",
        "order": 1,
        "title": "Purpose-Driven Motion",
        "summary": "Every animation must guide, inform, or delight instead of existing only to look cool.",
        "cms_usage": "Use as a review gate before adding animation to any CMS section.",
        "quality_gate": "Can someone explain what user need this motion serves?",
    },
    {
        "id": "motion_polite_micro_feedback",
        "order": 2,
        "title": "Micro-Interactions = Polite Feedback",
        "summary": "Tiny hover, focus, press, and confirmation motions make interfaces feel alive and intelligent.",
        "cms_usage": "Apply to buttons, cards, nav links, controls, filters, and upload/drop targets.",
        "quality_gate": "Does the interaction confirm state without distracting?",
    },
    {
        "id": "motion_loading_confidence",
        "order": 3,
        "title": "Loading Feels Faster with Animation",
        "summary": "Spinners, skeletons, progress bars, and staged placeholders reduce frustration by proving the system is working.",
        "cms_usage": "Use for API-backed cards, R2 assets, model calls, dashboard tables, and generated media previews.",
        "quality_gate": "Does the wait state communicate progress, shape, or expected result?",
    },
    {
        "id": "motion_smooth_navigation",
        "order": 4,
        "title": "Smooth Navigation Transitions",
        "summary": "Menus, page changes, and section transitions should flow instead of snap to preserve context and comfort.",
        "cms_usage": "Apply to route shells, drawers, tabs, modals, accordions, and page sections.",
        "quality_gate": "Does this transition help the user understand where they are going?",
    },
    {
        "id": "motion_brand_storytelling",
        "order": 5,
        "title": "Brand Storytelling Through Motion",
        "summary": "Animated logos, scroll-triggered scenes, and subtle brand elements make the experience personal and memorable.",
        "cms_usage": "Use in hero scenes, branded headers, immersive galleries, and high-value landing sections.",
        "quality_gate": "Does the motion reinforce the brand story without slowing the page?",
    },
    {
        "id": "motion_natural_easing",
        "order": 6,
        "title": "Ease-In, Ease-Out, Physics-Based Motion",
        "summary": "Motion feels natural when it mimics inertia, acceleration, deceleration, and physical timing.",
        "cms_usage": "Use standardized easing tokens across all CMS sections.",
        "quality_gate": "Does movement feel smooth instead of robotic?",
    },
    {
        "id": "motion_subtlety_wins",
        "order": 7,
        "title": "Subtlety Wins",
        "summary": "Avoid gimmicks. Micro movement usually feels more premium than huge animation.",
        "cms_usage": "Default to small transforms, fades, depth shifts, and restrained auto-motion.",
        "quality_gate": "Would this still feel professional after seeing it ten times?",
    },
    {
        "id": "motion_performance_first",
        "order": 8,
        "title": "Optimize for Performance",
        "summary": "Use GPU-friendly transforms and opacity, limit heavy JS, avoid layout thrash, and keep mobile lightweight.",
        "cms_usage": "Attach performance budget metadata to motion-heavy templates.",
        "quality_gate": "Does it animate transform/opacity instead of layout properties?",
    },
    {
        "id": "motion_emotional_tone",
        "order": 9,
        "title": "Emotion Through Motion",
        "summary": "Soft fades feel calm, bouncy hovers feel playful, and deliberate reveals feel premium.",
        "cms_usage": "Map motion presets to brand tone: calm, tactical, premium, playful, technical.",
        "quality_gate": "Does the motion match the page mood?",
    },
    {
        "id": "motion_director_mindset",
        "order": 10,
        "title": "Be the Director",
        "summary": "Sequence animations intentionally like scenes in a film to guide focus.",
        "cms_usage": "Use stagger, reveal order, sticky story blocks, and scene sequencing for important pages.",
        "quality_gate": "Does the sequence guide attention in the right order?",
    },
]


MOTION_PATTERNS = [
    {
        "id": "hover_scale",
        "order": 11,
        "name": "Hover Scale",
        "category": "micro_interaction",
        "intent": "Signal clickability and depth.",
        "selector": "[data-motion='hover-scale']",
        "recommended_for": ["buttons", "cards", "nav items", "media tiles"],
        "css_class": "iam-motion-hover-scale",
        "risk": "low",
        "css": """
.iam-motion-hover-scale {
  transition: transform var(--iam-motion-duration-fast) var(--iam-motion-ease-standard),
              box-shadow var(--iam-motion-duration-fast) var(--iam-motion-ease-standard);
  transform: translateZ(0);
  will-change: transform;
}
.iam-motion-hover-scale:hover {
  transform: translateY(-2px) scale(1.035);
}
.iam-motion-hover-scale:active {
  transform: translateY(0) scale(0.985);
}
""".strip(),
    },
    {
        "id": "hover_color_shift",
        "order": 12,
        "name": "Hover Color Shift",
        "category": "micro_interaction",
        "intent": "Show interactive affordance without moving layout.",
        "selector": "[data-motion='hover-color']",
        "recommended_for": ["links", "secondary buttons", "chips", "menu items"],
        "css_class": "iam-motion-hover-color",
        "risk": "low",
        "css": """
.iam-motion-hover-color {
  transition: color var(--iam-motion-duration-fast) var(--iam-motion-ease-standard),
              background-color var(--iam-motion-duration-fast) var(--iam-motion-ease-standard),
              border-color var(--iam-motion-duration-fast) var(--iam-motion-ease-standard);
}
.iam-motion-hover-color:hover {
  color: var(--iam-motion-accent);
  border-color: color-mix(in srgb, var(--iam-motion-accent), transparent 55%);
}
""".strip(),
    },
    {
        "id": "tap_press",
        "order": 13,
        "name": "Click/Tap Press Feedback",
        "category": "micro_interaction",
        "intent": "Confirm a click or tap immediately.",
        "selector": "[data-motion='tap-press']",
        "recommended_for": ["buttons", "icon buttons", "mobile controls"],
        "css_class": "iam-motion-tap-press",
        "risk": "low",
        "css": """
.iam-motion-tap-press {
  transition: transform 110ms var(--iam-motion-ease-standard);
  transform: translateZ(0);
}
.iam-motion-tap-press:active {
  transform: scale(0.965);
}
""".strip(),
    },
    {
        "id": "scroll_fade_up",
        "order": 14,
        "name": "Scroll Fade Up Reveal",
        "category": "scroll_reveal",
        "intent": "Introduce content as it enters view.",
        "selector": "[data-motion='fade-up']",
        "recommended_for": ["section headings", "cards", "feature rows", "article blocks"],
        "css_class": "iam-motion-fade-up",
        "risk": "low",
        "requires_js": True,
        "css": """
.iam-motion-fade-up {
  opacity: 0;
  transform: translateY(24px);
  transition: opacity var(--iam-motion-duration-slow) var(--iam-motion-ease-standard),
              transform var(--iam-motion-duration-slow) var(--iam-motion-ease-standard);
}
.iam-motion-fade-up.is-visible {
  opacity: 1;
  transform: translateY(0);
}
""".strip(),
    },
    {
        "id": "skeleton_loader",
        "order": 15,
        "name": "Skeleton Loader",
        "category": "loading",
        "intent": "Show the expected shape of loading content.",
        "selector": "[data-motion='skeleton']",
        "recommended_for": ["API cards", "CMS previews", "media grids", "dashboard tables"],
        "css_class": "iam-motion-skeleton",
        "risk": "low",
        "css": """
.iam-motion-skeleton {
  position: relative;
  overflow: hidden;
  border-radius: var(--iam-motion-radius-md);
  background: color-mix(in srgb, var(--iam-motion-surface), white 8%);
}
.iam-motion-skeleton::after {
  content: "";
  position: absolute;
  inset: 0;
  transform: translateX(-100%);
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.14), transparent);
  animation: iamSkeletonSweep 1.45s infinite var(--iam-motion-ease-standard);
}
@keyframes iamSkeletonSweep {
  100% { transform: translateX(100%); }
}
""".strip(),
    },
    {
        "id": "page_fade_through",
        "order": 16,
        "name": "Fade-Through Page Transition",
        "category": "navigation",
        "intent": "Make route or section changes feel calm and continuous.",
        "selector": "[data-motion='page-fade-through']",
        "recommended_for": ["page wrappers", "tab panels", "modal content"],
        "css_class": "iam-motion-page-fade-through",
        "risk": "medium",
        "css": """
.iam-motion-page-fade-through {
  animation: iamPageFadeThrough var(--iam-motion-duration-page) var(--iam-motion-ease-standard) both;
}
@keyframes iamPageFadeThrough {
  0% { opacity: 0; transform: translateY(10px) scale(.992); filter: blur(6px); }
  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
}
""".strip(),
    },
    {
        "id": "subtle_drift",
        "order": 17,
        "name": "Subtle Auto Drift",
        "category": "ambient",
        "intent": "Keep backgrounds alive without demanding attention.",
        "selector": "[data-motion='drift']",
        "recommended_for": ["glows", "background orbs", "hero decoration", "scene particles"],
        "css_class": "iam-motion-drift",
        "risk": "medium",
        "css": """
.iam-motion-drift {
  animation: iamSubtleDrift 7s ease-in-out infinite alternate;
  transform: translateZ(0);
  will-change: transform;
}
@keyframes iamSubtleDrift {
  from { transform: translate3d(0, 0, 0) scale(1); }
  to { transform: translate3d(14px, -10px, 0) scale(1.025); }
}
""".strip(),
    },
    {
        "id": "logo_breathe",
        "order": 18,
        "name": "Logo Breathe",
        "category": "brand",
        "intent": "Add subtle life to brand marks without gimmick spinning.",
        "selector": "[data-motion='logo-breathe']",
        "recommended_for": ["logos", "marks", "badges", "brand glyphs"],
        "css_class": "iam-motion-logo-breathe",
        "risk": "low",
        "css": """
.iam-motion-logo-breathe {
  animation: iamLogoBreathe 4.8s ease-in-out infinite;
  transform-origin: center;
}
@keyframes iamLogoBreathe {
  0%, 100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(47,123,255,0)); }
  50% { transform: scale(1.035); filter: drop-shadow(0 0 18px rgba(47,123,255,.28)); }
}
""".strip(),
    },
    {
        "id": "sticky_story",
        "order": 19,
        "name": "Sticky Scroll Storytelling",
        "category": "scroll_story",
        "intent": "Hold one visual while text progresses through a story.",
        "selector": "[data-motion='sticky-story']",
        "recommended_for": ["case studies", "process sections", "service pages", "immersive product pages"],
        "css_class": "iam-motion-sticky-story",
        "risk": "medium",
        "css": """
.iam-motion-sticky-story {
  position: sticky;
  top: var(--iam-motion-sticky-top);
  align-self: start;
}
""".strip(),
    },
    {
        "id": "scroll_progress",
        "order": 20,
        "name": "Scroll Progress",
        "category": "navigation",
        "intent": "Show page progress for long-form pages.",
        "selector": "[data-motion='scroll-progress']",
        "recommended_for": ["long pages", "articles", "learning pages", "reports"],
        "css_class": "iam-motion-scroll-progress",
        "risk": "medium",
        "requires_js": True,
        "css": """
.iam-motion-scroll-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 3px;
  width: 0;
  z-index: 9999;
  background: linear-gradient(90deg, var(--iam-motion-accent), var(--iam-motion-cyan));
  transform-origin: left center;
}
""".strip(),
    },
    {
        "id": "tilt_depth",
        "order": 21,
        "name": "Tilt Depth Hover",
        "category": "micro_interaction",
        "intent": "Create premium card depth on desktop pointers.",
        "selector": "[data-motion='tilt-depth']",
        "recommended_for": ["showcase cards", "3D preview cards", "project tiles"],
        "css_class": "iam-motion-tilt-depth",
        "risk": "medium",
        "css": """
@media (hover: hover) and (pointer: fine) {
  .iam-motion-tilt-depth {
    transition: transform var(--iam-motion-duration-medium) var(--iam-motion-ease-spring-soft);
    transform-style: preserve-3d;
    will-change: transform;
  }
  .iam-motion-tilt-depth:hover {
    transform: perspective(900px) rotateX(2.5deg) rotateY(-3deg) translateY(-3px);
  }
}
""".strip(),
    },
    {
        "id": "stagger_children",
        "order": 22,
        "name": "Staggered Children Reveal",
        "category": "sequence",
        "intent": "Direct attention through groups of related content.",
        "selector": "[data-motion='stagger']",
        "recommended_for": ["feature grids", "pricing cards", "navigation menus", "stat rows"],
        "css_class": "iam-motion-stagger",
        "risk": "medium",
        "requires_js": True,
        "css": """
.iam-motion-stagger > * {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity var(--iam-motion-duration-medium) var(--iam-motion-ease-standard),
              transform var(--iam-motion-duration-medium) var(--iam-motion-ease-standard);
  transition-delay: calc(var(--iam-stagger-index, 0) * 70ms);
}
.iam-motion-stagger.is-visible > * {
  opacity: 1;
  transform: translateY(0);
}
""".strip(),
    },
]


ACTION_PLAN = [
    {
        "step": 1,
        "title": "Pick 2–3 simple effects first",
        "why": "Keeps a page dynamic without becoming complex.",
        "default_patterns": ["hover_scale", "scroll_fade_up", "skeleton_loader"],
    },
    {
        "step": 2,
        "title": "Use shared easing tokens",
        "why": "Keeps motion consistent across the site.",
        "default_patterns": ["page_fade_through"],
    },
    {
        "step": 3,
        "title": "Add hover feedback",
        "why": "Signals interactivity and gives the UI life.",
        "default_patterns": ["hover_scale", "hover_color_shift", "tap_press"],
    },
    {
        "step": 4,
        "title": "Fade content in on scroll",
        "why": "Adds polish and visual flow.",
        "default_patterns": ["scroll_fade_up", "stagger_children"],
    },
    {
        "step": 5,
        "title": "Add loading states",
        "why": "Gives users confidence during wait time.",
        "default_patterns": ["skeleton_loader"],
    },
    {
        "step": 6,
        "title": "Use subtle brand motion",
        "why": "Makes the brand feel alive without looking gimmicky.",
        "default_patterns": ["logo_breathe", "subtle_drift"],
    },
    {
        "step": 7,
        "title": "Test with unfamiliar users",
        "why": "Confirms motion helps instead of distracting.",
        "default_patterns": [],
    },
    {
        "step": 8,
        "title": "Provide reduced-motion fallback",
        "why": "Keeps the experience inclusive and respectful.",
        "default_patterns": [],
    },
    {
        "step": 9,
        "title": "Use only 1–2 major motion types per page",
        "why": "Prevents visual overload.",
        "default_patterns": [],
    },
    {
        "step": 10,
        "title": "Iterate over time",
        "why": "Animation is design; it improves through review and refinement.",
        "default_patterns": [],
    },
]


def slugify(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.rstrip() + "\n", encoding="utf-8")
    print(f"WROTE: {path}")


def sql_escape(value: str) -> str:
    return value.replace("'", "''")


def now_unix() -> int:
    return int(time.time())


def build_tokens_css() -> str:
    pattern_css = "\n\n".join(p["css"] for p in MOTION_PATTERNS if p.get("css"))

    return f"""
/*
  IAM Motion System v1
  Generated by scripts/cms_07_motion_system_pipeline.py

  Rules:
  - Purpose first.
  - Prefer transform and opacity.
  - No heavy layout animation.
  - Respect prefers-reduced-motion.
*/

:root {{
  --iam-motion-accent: #2f7bff;
  --iam-motion-cyan: #67e8ff;
  --iam-motion-surface: rgba(255,255,255,.075);
  --iam-motion-line: rgba(255,255,255,.15);

  --iam-motion-radius-sm: 10px;
  --iam-motion-radius-md: 18px;
  --iam-motion-radius-lg: 28px;

  --iam-motion-duration-instant: 90ms;
  --iam-motion-duration-fast: 180ms;
  --iam-motion-duration-medium: 320ms;
  --iam-motion-duration-slow: 620ms;
  --iam-motion-duration-page: 480ms;

  --iam-motion-ease-standard: cubic-bezier(.2,.8,.2,1);
  --iam-motion-ease-enter: cubic-bezier(.16,1,.3,1);
  --iam-motion-ease-exit: cubic-bezier(.7,0,.84,0);
  --iam-motion-ease-spring-soft: cubic-bezier(.34,1.56,.64,1);

  --iam-motion-sticky-top: 96px;
}}

{pattern_css}

@media (prefers-reduced-motion: reduce) {{
  *,
  *::before,
  *::after {{
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.001ms !important;
  }}

  .iam-motion-fade-up,
  .iam-motion-stagger > *,
  .iam-motion-page-fade-through {{
    opacity: 1 !important;
    transform: none !important;
    filter: none !important;
  }}
}}
""".strip()


def build_runtime_js() -> str:
    return """
/*
  IAM Motion Runtime v1
  Generated by scripts/cms_07_motion_system_pipeline.py

  Runtime responsibilities:
  - reveal-on-scroll
  - stagger index assignment
  - scroll progress
  - reduced-motion respect
*/

(function () {
  const root = document.documentElement;
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReduced) {
    root.setAttribute("data-reduced-motion", "true");
    return;
  }

  function initRevealObserver() {
    const targets = document.querySelectorAll(
      ".iam-motion-fade-up, [data-motion='fade-up'], .iam-motion-stagger, [data-motion='stagger'], .iam-motion-zoom, [data-motion='zoom']"
    );

    if (!targets.length || !("IntersectionObserver" in window)) {
      targets.forEach((el) => el.classList.add("is-visible"));
      return;
    }

    targets.forEach((el) => {
      if (el.matches(".iam-motion-stagger, [data-motion='stagger']")) {
        Array.from(el.children || []).forEach((child, index) => {
          child.style.setProperty("--iam-stagger-index", String(Math.min(index, 12)));
        });
      }
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        root: null,
        threshold: 0.14,
        rootMargin: "0px 0px -8% 0px",
      }
    );

    targets.forEach((el) => observer.observe(el));
  }

  function initScrollProgress() {
    const bar = document.querySelector(".iam-motion-scroll-progress, [data-motion='scroll-progress']");
    if (!bar) return;

    let ticking = false;

    function update() {
      ticking = false;
      const doc = document.documentElement;
      const max = Math.max(1, doc.scrollHeight - window.innerHeight);
      const progress = Math.max(0, Math.min(1, window.scrollY / max));
      bar.style.width = (progress * 100).toFixed(2) + "%";
    }

    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }

    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });
    update();
  }

  function initTapFeedback() {
    document.querySelectorAll("[data-motion='tap-press']").forEach((el) => {
      el.classList.add("iam-motion-tap-press");
    });
  }

  function initMotionClasses() {
    const map = {
      "hover-scale": "iam-motion-hover-scale",
      "hover-color": "iam-motion-hover-color",
      "fade-up": "iam-motion-fade-up",
      "skeleton": "iam-motion-skeleton",
      "page-fade-through": "iam-motion-page-fade-through",
      "drift": "iam-motion-drift",
      "logo-breathe": "iam-motion-logo-breathe",
      "sticky-story": "iam-motion-sticky-story",
      "scroll-progress": "iam-motion-scroll-progress",
      "tilt-depth": "iam-motion-tilt-depth",
      "stagger": "iam-motion-stagger",
    };

    Object.entries(map).forEach(([key, className]) => {
      document.querySelectorAll(`[data-motion='${key}']`).forEach((el) => {
        el.classList.add(className);
      });
    });
  }

  function init() {
    initMotionClasses();
    initTapFeedback();
    initRevealObserver();
    initScrollProgress();
    root.setAttribute("data-iam-motion-ready", "true");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
""".strip()


def build_demo_html(tokens_css: str, runtime_js: str) -> str:
    return f"""
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>IAM Motion System Demo</title>
  <style>
    body {{
      margin: 0;
      font-family: Nunito, Inter, system-ui, sans-serif;
      background: #050713;
      color: #f8fbff;
    }}
    main {{
      padding: 72px clamp(20px, 6vw, 96px);
    }}
    section {{
      min-height: 60vh;
      display: grid;
      align-content: center;
      border-bottom: 1px solid rgba(255,255,255,.12);
    }}
    h1 {{
      font-size: clamp(48px, 8vw, 118px);
      letter-spacing: -.07em;
      line-height: .9;
      margin: 0 0 20px;
    }}
    h2 {{
      font-size: clamp(30px, 5vw, 72px);
      letter-spacing: -.05em;
      line-height: .95;
      margin: 0 0 18px;
    }}
    p {{
      color: #9daac2;
      font-size: 18px;
      max-width: 760px;
      line-height: 1.6;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 18px;
      margin-top: 28px;
    }}
    .card {{
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(255,255,255,.07);
      border-radius: 28px;
      padding: 24px;
      min-height: 160px;
    }}
    .btn {{
      display: inline-flex;
      width: max-content;
      border: 1px solid rgba(255,255,255,.14);
      background: rgba(47,123,255,.18);
      color: white;
      padding: 14px 18px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 800;
      margin-top: 20px;
    }}
    .orb {{
      width: 140px;
      height: 140px;
      border-radius: 999px;
      background: radial-gradient(circle at 30% 30%, #67e8ff, #2f7bff 48%, transparent 72%);
      box-shadow: 0 0 80px rgba(47,123,255,.35);
    }}

    {tokens_css}
  </style>
</head>
<body>
  <div data-motion="scroll-progress"></div>
  <main data-motion="page-fade-through">
    <section>
      <p class="iam-motion-fade-up">IAM MOTION SYSTEM</p>
      <h1 class="iam-motion-fade-up">Purpose-first motion.</h1>
      <p class="iam-motion-fade-up">Motion should guide, inform, or delight. It should not be visual noise.</p>
      <a class="btn" data-motion="hover-scale" href="#">Hover me</a>
    </section>

    <section>
      <h2 data-motion="fade-up">Micro-interactions as polite feedback.</h2>
      <div class="grid" data-motion="stagger">
        <div class="card" data-motion="tilt-depth">Hover depth</div>
        <div class="card" data-motion="hover-scale">Scale feedback</div>
        <div class="card" data-motion="tap-press">Tap feedback</div>
      </div>
    </section>

    <section>
      <h2 data-motion="fade-up">Loading should feel alive.</h2>
      <div class="grid">
        <div class="card">
          <div data-motion="skeleton" style="height:18px;width:80%;margin-bottom:14px"></div>
          <div data-motion="skeleton" style="height:18px;width:55%;margin-bottom:14px"></div>
          <div data-motion="skeleton" style="height:110px;width:100%"></div>
        </div>
        <div class="card">
          <div class="orb" data-motion="drift"></div>
        </div>
      </div>
    </section>

    <section>
      <h2 data-motion="fade-up">Brand motion stays subtle.</h2>
      <div class="card" data-motion="logo-breathe" style="width:max-content;font-size:42px;font-weight:900">IAM</div>
    </section>
  </main>

  <script>
    {runtime_js}
  </script>
</body>
</html>
""".strip()


def build_playbook() -> str:
    principle_lines = []
    for p in CORE_PRINCIPLES:
        principle_lines.append(
            f"### {p['order']}. {p['title']}\n\n"
            f"{p['summary']}\n\n"
            f"- CMS usage: {p['cms_usage']}\n"
            f"- Quality gate: {p['quality_gate']}\n"
        )

    pattern_lines = []
    for p in MOTION_PATTERNS:
        pattern_lines.append(
            f"### {p['order']}. {p['name']}\n\n"
            f"- Category: `{p['category']}`\n"
            f"- Intent: {p['intent']}\n"
            f"- Selector: `{p['selector']}`\n"
            f"- CSS class: `{p['css_class']}`\n"
            f"- Recommended for: {', '.join(p['recommended_for'])}\n"
            f"- Risk: `{p['risk']}`\n"
            f"- Requires JS: `{bool(p.get('requires_js'))}`\n"
        )

    action_lines = []
    for step in ACTION_PLAN:
        action_lines.append(
            f"| {step['step']} | {step['title']} | {step['why']} | "
            f"{', '.join(step['default_patterns']) or 'review / feedback'} |"
        )

    return f"""
# IAM Motion System v1

Generated: `{time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}`

## Philosophy

Motion is not decoration. Motion is a system for attention, feedback, brand tone, and perceived performance.

## Core Principles

{chr(10).join(principle_lines)}

## Practical Motion Patterns

{chr(10).join(pattern_lines)}

## Beginner-Friendly Action Plan

| Step | What to Do | Why It Matters | Default Patterns |
|---:|---|---|---|
{chr(10).join(action_lines)}

## CMS Pipeline Recommendation

Store this as:

- `cms_assets`: CSS runtime asset and JS runtime asset.
- `cms_component_templates`: reusable motion-enabled components.
- `cms_sections`: motion-enhanced section presets.
- `cms_themes`: motion tokens mapped to theme tokens.
- `cms_pages`: per-page motion budget and enabled patterns in metadata JSON.

## Hard Rules

1. Always include `prefers-reduced-motion`.
2. Animate `transform` and `opacity` first.
3. Avoid animating layout properties like `width`, `height`, `top`, and `left`.
4. Keep scroll scenes optional and lightweight.
5. Do not stack too many motion systems on one page.
6. Treat 3D, parallax, and cursor trails as premium/limited-use patterns, not defaults.
""".strip()


def build_seed_sql(tokens_css: str, runtime_js: str) -> str:
    n = now_unix()

    principles_json = json.dumps(CORE_PRINCIPLES, separators=(",", ":"))
    patterns_json = json.dumps(MOTION_PATTERNS, separators=(",", ":"))
    action_json = json.dumps(ACTION_PLAN, separators=(",", ":"))

    css_r2_key = f"cms/motion/{SYSTEM_SLUG}/motion_tokens.css"
    js_r2_key = f"cms/motion/{SYSTEM_SLUG}/motion_runtime.js"

    return f"""
-- IAM Motion System v1 CMS seed
-- Generated by scripts/cms_07_motion_system_pipeline.py
-- Review against live cms_* schema before running.
-- This is intentionally conservative and mostly stores JSON payloads.

-- Suggested R2 objects:
--   {css_r2_key}
--   {js_r2_key}

-- Option A: cms_assets registration, if columns match your current table.
-- Adjust column names if your final CMS table map says otherwise.

INSERT OR REPLACE INTO cms_assets (
  id,
  tenant_id,
  workspace_id,
  filename,
  original_filename,
  path,
  mime_type,
  category,
  tags,
  r2_key,
  public_url,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  'asset_{SYSTEM_SLUG}_css',
  '{TENANT_ID}',
  '{WORKSPACE_ID}',
  'motion_tokens.css',
  'motion_tokens.css',
  '{css_r2_key}',
  'text/css',
  'motion',
  'motion,css,tokens,animation,iam',
  '{css_r2_key}',
  'https://assets.inneranimalmedia.com/{css_r2_key}',
  '{sql_escape(json.dumps({"system_slug": SYSTEM_SLUG, "type": "motion_tokens", "principles": principles_json}))}',
  {n},
  {n}
);

INSERT OR REPLACE INTO cms_assets (
  id,
  tenant_id,
  workspace_id,
  filename,
  original_filename,
  path,
  mime_type,
  category,
  tags,
  r2_key,
  public_url,
  metadata_json,
  created_at,
  updated_at
) VALUES (
  'asset_{SYSTEM_SLUG}_runtime_js',
  '{TENANT_ID}',
  '{WORKSPACE_ID}',
  'motion_runtime.js',
  'motion_runtime.js',
  '{js_r2_key}',
  'application/javascript',
  'motion',
  'motion,js,runtime,intersection-observer,iam',
  '{js_r2_key}',
  'https://assets.inneranimalmedia.com/{js_r2_key}',
  '{sql_escape(json.dumps({"system_slug": SYSTEM_SLUG, "type": "motion_runtime", "patterns": patterns_json}))}',
  {n},
  {n}
);

-- Option B: cms_component_templates registration, if your schema supports template_data.
INSERT OR REPLACE INTO cms_component_templates (
  id,
  tenant_id,
  workspace_id,
  name,
  slug,
  description,
  category,
  template_data,
  created_at,
  updated_at
) VALUES (
  'tmpl_{SYSTEM_SLUG}',
  '{TENANT_ID}',
  '{WORKSPACE_ID}',
  'IAM Motion System v1',
  '{SYSTEM_SLUG}',
  'Purpose-first motion principles, reusable CSS classes, runtime JS, and reduced-motion-safe animation patterns.',
  'motion',
  '{sql_escape(json.dumps({
    "system_slug": SYSTEM_SLUG,
    "principles": CORE_PRINCIPLES,
    "patterns": [
      {
        "id": p["id"],
        "name": p["name"],
        "category": p["category"],
        "selector": p["selector"],
        "css_class": p["css_class"],
        "intent": p["intent"],
        "risk": p["risk"],
        "requires_js": bool(p.get("requires_js")),
      }
      for p in MOTION_PATTERNS
    ],
    "action_plan": ACTION_PLAN,
    "r2": {
      "css_key": css_r2_key,
      "runtime_js_key": js_r2_key
    }
  }))}',
  {n},
  {n}
);
""".strip()



def build_cursor_brief() -> str:
    return "\n".join([
        "# Cursor Brief: IAM Motion System v1",
        "",
        "Goal: Wire artifacts/cms_motion_system into the CMS pipeline as reusable motion tokens/runtime.",
        "",
        "R2 upload:",
        "cd /Users/samprimeaux/inneranimalmedia",
        "./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia/cms/motion/iam-motion-system-v1/motion_tokens.css --remote --file artifacts/cms_motion_system/03_motion_tokens.css --content-type 'text/css; charset=utf-8'",
        "./scripts/with-cloudflare-env.sh npx wrangler r2 object put inneranimalmedia/cms/motion/iam-motion-system-v1/motion_runtime.js --remote --file artifacts/cms_motion_system/04_motion_runtime.js --content-type 'application/javascript; charset=utf-8'",
        "",
        "Rules:",
        "- Preserve reduced-motion support.",
        "- Prefer transform and opacity.",
        "- Avoid heavy scroll/cursor effects on mobile.",
        "",
    ])


def main() -> int:
    out = Path("artifacts/cms_motion_system")
    out.mkdir(parents=True, exist_ok=True)

    css = build_css() if "build_css" in globals() else "/* motion css missing */\n"
    js = build_js() if "build_js" in globals() else "// motion js missing\n"

    if "build_playbook" in globals():
        (out / "00_motion_playbook.md").write_text(build_playbook(), encoding="utf-8")
    if "PRINCIPLES" in globals():
        (out / "01_motion_principles.json").write_text(json.dumps(PRINCIPLES, indent=2), encoding="utf-8")
    if "PATTERNS" in globals():
        (out / "02_motion_patterns.json").write_text(json.dumps(PATTERNS, indent=2), encoding="utf-8")

    (out / "03_motion_tokens.css").write_text(css, encoding="utf-8")
    (out / "04_motion_runtime.js").write_text(js, encoding="utf-8")

    if "build_demo" in globals():
        (out / "05_motion_demo.html").write_text(build_demo(css, js), encoding="utf-8")
    else:
        (out / "05_motion_demo.html").write_text("<!doctype html><title>IAM Motion Demo</title>", encoding="utf-8")

    if "build_sql" in globals():
        (out / "06_cms_motion_seed.sql").write_text(build_sql(), encoding="utf-8")
    else:
        (out / "06_cms_motion_seed.sql").write_text("-- seed placeholder\n", encoding="utf-8")

    (out / "07_cursor_implementation_brief.md").write_text(build_cursor_brief(), encoding="utf-8")

    print("DONE:", out.resolve())
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
