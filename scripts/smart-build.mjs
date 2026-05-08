// CF Builds watch paths exclude dashboard/**, so this only runs
// when src/**, worker.js, migrations/**, or package.json change.
// Always skip Vite — dashboard assets deploy separately via R2 scripts.
console.log('[build] worker-only build — skipping Vite');
