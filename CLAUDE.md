# CLAUDE.md — Inner Animal Media Dashboard

## Repo
/Users/samprimeaux/inneranimalmedia

## Deploy Pipeline
1. npm run build:vite-only (must pass before any push)
2. Push to `dev` branch only (Pages deploys from dev via GitHub Actions)
3. NEVER push directly to main
4. NEVER use `npm run deploy` alone

## Hard Rules
- Do not modify BrowserView.tsx without explicit approval
- No broken builds pushed to fix in CI
- Verify with git log after every push — "done" = confirmed on remote
- Pages URL: https://samprimeaux.github.io/inneranimalmedia/

## Branch Strategy
- Feature branches → rebase onto dev → PR to dev
- dev → main only after Pages confirms green

## Key Files
- dashboard/app/components/ — React components
- deploy-unified-dash.yml — GitHub Actions workflow
