(function () {
  "use strict";

  // Split every heading marked for stagger, then arm the observer.
  splitText(document.querySelectorAll("[data-split]"));
  observeSplit(document.querySelectorAll("[data-split]"));

  // The core engine: one call, every [data-chapter] gets --progress.
  const engine = ScrollEngine.init({
    selector: "[data-chapter]",
    onFrame: (tracks) => {
      const readout = document.getElementById("progress-readout");
      if (!readout) return;
      const active = tracks.find((t) => t.el.dataset.active === "true");
      readout.textContent = active
        ? `${active.el.dataset.label || "chapter"} · ${active.el.style.getPropertyValue(
            "--progress"
          )}`
        : "—";
    },
  });

  // Chapter progress dots in the top bar.
  const dots = document.querySelectorAll("[data-chapter]");
  const nav = document.getElementById("chapter-index");
  if (nav) {
    nav.textContent = `01 / ${String(dots.length).padStart(2, "0")}`;
  }
})();
