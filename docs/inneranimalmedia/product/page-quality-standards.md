# Page quality standards

## Performance

- Lazy-load heavy panels where possible; avoid blocking the main thread on first paint.

## Accessibility

- Interactive controls need labels; respect focus order in modals and sidebars.

## Consistency

- Reuse existing layout patterns (`App.tsx` regions, shared components) before adding one-off layouts.

## QA

- Smoke critical paths after deploy: login, dashboard load, agent chat if applicable.
