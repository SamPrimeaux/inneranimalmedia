# Agent skills (knowledge / AutoRAG)

Skills in this folder are loaded into the repo and can be pushed to R2 for AutoRAG/Vectorize so Agent Sam can use them during chat and knowledge_search.

## Current skills

- **frontend-design** — Distinctive, production-grade frontend interfaces; design thinking, typography, color, motion, spatial composition. Use when building or styling web UI.
- **skill-creator** — Create, edit, and optimize skills; run evals, benchmark performance, improve skill descriptions for triggering accuracy. Use when creating a skill from scratch, modifying a skill, or running evals/benchmarks.
- **web-artifacts-builder** — Elaborate multi-component claude.ai HTML artifacts with React, Tailwind, shadcn/ui. Use for complex artifacts (state, routing, shadcn); not for simple single-file HTML/JSX.
- **webapp-testing** — Test local web apps with Playwright; verify frontend, debug UI, capture screenshots, view logs. Use with_server.py for lifecycle; run scripts with --help first.
- **theme-factory** — Style slides, docs, reports, or HTML with preset themes (10 options) or generate a custom theme on-the-fly. Show theme-showcase.pdf, get choice, apply colors/fonts from themes/.

## Uploading to AutoRAG

From repo root, run:

```bash
./scripts/populate-autorag.sh
```

This uploads all knowledge files (including `frontend-design.md`, `skill-creator.md`, `web-artifacts-builder.md`, `webapp-testing.md`, and `theme-factory.md`) to the **autorag** R2 bucket. Then run **Sync** in the AI Search dashboard (iam-autorag) so the index picks up the new content.

If your RAG uses Vectorize with **iam-platform**, upload the skill to that bucket as well:

```bash
./scripts/with-cloudflare-env.sh npx wrangler r2 object put iam-platform/knowledge/skills/frontend-design.md \
  --file=docs/knowledge/skills/frontend-design.md \
  --content-type=text/markdown --remote -c wrangler.production.toml

# Or for skill-creator:
./scripts/with-cloudflare-env.sh npx wrangler r2 object put iam-platform/knowledge/skills/skill-creator.md \
  --file=docs/knowledge/skills/skill-creator.md \
  --content-type=text/markdown --remote -c wrangler.production.toml

# Or for web-artifacts-builder:
./scripts/with-cloudflare-env.sh npx wrangler r2 object put iam-platform/knowledge/skills/web-artifacts-builder.md \
  --file=docs/knowledge/skills/web-artifacts-builder.md \
  --content-type=text/markdown --remote -c wrangler.production.toml

# Or for webapp-testing:
./scripts/with-cloudflare-env.sh npx wrangler r2 object put iam-platform/knowledge/skills/webapp-testing.md \
  --file=docs/knowledge/skills/webapp-testing.md \
  --content-type=text/markdown --remote -c wrangler.production.toml

# Or for theme-factory:
./scripts/with-cloudflare-env.sh npx wrangler r2 object put iam-platform/knowledge/skills/theme-factory.md \
  --file=docs/knowledge/skills/theme-factory.md \
  --content-type=text/markdown --remote -c wrangler.production.toml
```

Then trigger Re-index memory from the Agent dashboard (or wait for the next index run).

## Systematic sync (no babysitting)

To trigger uploads automatically so you don't have to remember:

- **After every pull:** Use a git post-merge hook that runs `./scripts/populate-autorag.sh` when `docs/knowledge/` or `scripts/populate-autorag.sh` changed. See **docs/AUTORAG_SYNC.md** for the exact hook and cron options.
- **On a schedule:** Add a daily cron job that runs `./scripts/populate-autorag.sh` from the repo root (see docs/AUTORAG_SYNC.md). Then open Cloudflare Dashboard → AI Search → iam-autorag → **Sync** when you want vectors updated.
