# Terminal memory and Playwright e2e

## Terminal session memory

The Agent dashboard **Terminal** tab (Preview panel) connects to a **PTY over WebSocket** (`/api/agent/terminal/ws`). The backend proxies to your real shell (e.g. TERMINAL_WS_URL or local PTY). That means:

- **Same session** — As long as you keep the Terminal tab open and connected, you get one continuous shell. "Restored session" means the UI reconnected to that same session.
- **CWD and env** — Your current working directory and `node_modules` are whatever they are in that shell. If you opened the terminal from home (`~`), run `cd /path/to/march1st-inneranimalmedia` before `npm install` / `npx playwright test` so dependencies and Playwright live in the repo.
- **No reinstall every time** — You do **not** need to reinstall Playwright each time. Install once in the repo (`cd repo && npm install && npx playwright install`). Future runs in that same terminal (or a reconnected session to the same host) will see the same `node_modules` and browsers as long as you’re in the repo directory.

So: terminal "memory" is your real shell session; keep the tab open and `cd` to the project when you want to run npm/playwright there.

## Playwright tests in R2

- **Run tests:** From repo root: `npm test` or `npx playwright test`.
- **Upload report to R2:** After a run, the HTML report is in `playwright-report/`. To store it in **agent-sam** under `tests/reports/YYYY-MM-DD/HHMM/`:

  ```bash
  ./scripts/with-cloudflare-env.sh ./scripts/upload-playwright-report-to-r2.sh
  ```

  Or run tests and upload in one step:

  ```bash
  npm run test:report-upload
  ```

- **Interactive UI testing:** Run `npm run test:ui` for Playwright’s UI mode. To have Agent Sam drive tests and show the run in the dashboard Preview browser, we’d add a path that runs Playwright (or triggers a run), then serves or links to the report; that’s a follow-up enhancement.

## Run in terminal button

Agent responses that include **bash**, **sh**, **shell**, **zsh**, or **cmd** code blocks now show a **Run in terminal** button. Click it to run that command in the same terminal flow used by `/run <cmd>` (via `/api/agent/terminal/run` + WebSocket). Use it to run suggested commands without copy-paste.
