import type { ReactNode } from "react";

const GRID_STYLE = `
.ov-pulse-grid {
  display: grid;
  gap: 10px;
  margin-bottom: 10px;
  grid-template-columns: 1fr;
}
@media (min-width: 640px) {
  .ov-pulse-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-auto-rows: minmax(300px, auto);
  }
}
@media (min-width: 1280px) {
  .ov-pulse-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
    grid-auto-rows: minmax(280px, auto);
  }
}
@media (max-width: 639px) {
  .ov-pulse-cell {
    aspect-ratio: 1;
    max-height: min(calc(100vw - 52px), 400px);
  }
}
.ov-pulse-cell {
  min-width: 0;
  min-height: 0;
  display: flex;
}
.ov-pulse-cell > * {
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ov-pulse-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
`;

export function SystemPulseGrid({ children }: { children: ReactNode }) {
  const cells = Array.isArray(children) ? children : [children];
  return (
    <>
      <style>{GRID_STYLE}</style>
      <div className="ov-pulse-grid">
        {cells.map((child, i) => (
          <div key={i} className="ov-pulse-cell">
            {child}
          </div>
        ))}
      </div>
    </>
  );
}
