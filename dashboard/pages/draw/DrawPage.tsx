import React, { Suspense, lazy } from 'react';

const ExcalidrawView = lazy(() =>
  import('../../components/ExcalidrawView').then((m) => ({ default: m.ExcalidrawView })),
);

export default function DrawPage() {
  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden bg-[var(--dashboard-canvas)]">
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
            Loading canvas…
          </div>
        }
      >
        <ExcalidrawView />
      </Suspense>
    </div>
  );
}
