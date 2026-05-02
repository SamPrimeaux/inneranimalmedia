# How the Overview Page JSX Was Refactored to Work Inside the HTML App

**Simple English:** The Overview "page" is not a separate app. It is your existing dashboard HTML (topbar, sidenav, theme) with an empty box in the middle. We build a single JavaScript bundle from the React/JSX code and put that bundle on your CDN (R2). The HTML shell loads that script; the script finds the box and draws the Overview UI inside it. The worker never edits HTML—it only serves the HTML and JS files from R2. Updates are done by changing the HTML or JS in the repo and re-uploading to R2.

**Full technical detail** follows.

---

## 1. What Lives Where

| What | Where | Who updates it |
|------|--------|----------------|
| **Shell (chrome)** | One HTML file: `dashboard/overview.html` in the repo. Deployed to R2 key `static/dashboard/overview.html`. | You (or agent) edit the file, then run `./agent-dashboard/deploy-to-r2.sh` to upload. |
| **Overview UI (JSX)** | React app in `overview-dashboard/` (e.g. `src/OverviewDashboard.jsx`, `src/main.jsx`). Built to a **single JS bundle**. | You (or agent) edit JSX, run `npm run build` in `overview-dashboard/`, then run `deploy-to-r2.sh` to upload the bundle. |
| **Bundle on CDN** | R2 bucket `agent-sam`, key `static/dashboard/overview/overview-dashboard.js`. | Written by `deploy-to-r2.sh` from `overview-dashboard/dist/overview-dashboard.js`. |
| **Worker** | Serves HTML and static assets from R2. **Does not** modify HTML or inject scripts. | Only changed when routing or app logic changes; not involved in "rebuilding" Overview. |

So: **HTML shell** and **JS bundle** are two separate artifacts. The shell is a normal HTML page; the bundle is a single script that mounts the React app into one element in that page.

---

## 2. The HTML Shell (dashboard/overview.html)

- **Same shell** as the rest of the dashboard: topbar, sidenav, theme CSS, fonts, script for nav/clock/search etc.
- **One extra thing:** a **mount point** for the Overview React app:
  - A `<div id="overview-root"></div>` in the main content area.
  - A **single script tag** that loads the bundle:
    ```html
    <script type="module" src="/static/dashboard/overview/overview-dashboard.js"></script>
    ```
- The main content area uses a class (e.g. `main-content overview-page-main`) so the layout and theme apply correctly; `#overview-root` is the only child that the React app cares about.

So the refactor did **not** replace the whole page with a React app. It left the existing HTML app as-is and added one div and one script tag. The React app is "embedded" inside the shell.

---

## 3. The JSX App (overview-dashboard/)

- **Entry:** `src/main.jsx`:
  - Finds the DOM node: `document.getElementById("overview-root")`.
  - If it exists, creates a React root and renders `<OverviewDashboard />` into it.
- **No router, no extra shell:** The app assumes it is already inside the dashboard. It does not render a full page or navigation; it only renders the Overview content (header strip, KPI cards, activity strip, collapsible sections, activity feed).
- **Build (Vite):**
  - `vite.config.js` sets `base: "/static/dashboard/overview/"` so asset paths in the bundle match the URL path under which the script is served.
  - Build output: a single file `dist/overview-dashboard.js` (and optionally chunks). No separate HTML is produced for production; the HTML is the shell in R2.
- **Deploy:** `./agent-dashboard/deploy-to-r2.sh` runs `npm run build` in `overview-dashboard/` and then uploads `dist/overview-dashboard.js` to R2 at `static/dashboard/overview/overview-dashboard.js`.

So the refactor **builds** the JSX into one bundle and **ships** that bundle to the same place the shell expects: `/static/dashboard/overview/overview-dashboard.js`.

---

## 4. How a Request Is Served (Worker)

- User goes to `https://www.inneranimalmedia.com/dashboard/overview`.
- Worker sees path `/dashboard/overview`, takes segment `overview`, and looks up HTML in R2:
  - Key: `static/dashboard/overview.html`.
  - Returns that HTML as `text/html`. **No rewriting, no substitution.**
- Browser parses the HTML and sees `<script type="module" src="/static/dashboard/overview/overview-dashboard.js">`. It requests that URL.
- Worker sees path `/static/dashboard/overview/overview-dashboard.js`, looks up the object in R2 (key `static/dashboard/overview/overview-dashboard.js` or similar), and returns the JS file. **No injection, no esm.sh, no in-worker HTML edits.**
- Browser runs the script. The script runs `document.getElementById("overview-root")` and mounts the React app there. The Overview UI appears inside the existing shell.

So the refactor is **"serve two files from R2"**: one HTML (the shell) and one JS (the bundle). The worker only does key-based lookup and response; it does not build or modify the Overview page.

---

## 5. Theme and Styling

- The shell HTML defines theme CSS variables (e.g. `--bg-canvas`, `--text-primary`, `--text-nav`) on `:root` / `[data-theme="..."]`. The Overview React app lives inside that document, so it **inherits** those variables unless it overrides them.
- The Overview UI was written to:
  - Use **transparent/inherit** for the root container background so the shell’s background (and thus the theme) shows through.
  - Use **scoped overrides** only where needed (e.g. dark card background `--bg-card` inside `.card-context`) so cards stay readable and the rest of the page stays theme-aware.
- So the refactor keeps **one source of truth for theme** (the shell) and lets the embedded app use it instead of forcing a second theme system.

---

## 6. Data (API)

- The Overview UI fetches data from your existing backend:
  - `GET /api/overview/activity-strip` (with `credentials: 'include'`) for activity strip, worked-this-week, projects, etc.
- The worker already had that route and D1 logic; no change was required for the refactor except ensuring the JS bundle calls the same API from the same origin. Because the page is served as `https://www.inneranimalmedia.com/dashboard/overview`, the script runs on that origin and same-origin requests hit your worker.

---

## 7. What We Did *Not* Do (and Why the Revert Happened)

- **We did not** have the worker fetch `overview.html` and rewrite it (e.g. change `overview-root` to `finance-root` or swap script tags) to build other dashboard pages. That caused the breakage documented in `FAILURE_2026-03-03_DASHBOARD_REVERT.md`.
- **We did not** inject scripts via esm.sh or any other runtime substitution in the worker.
- **We did not** serve raw JSX or different HTML per route by modifying the same HTML in the worker.

The correct pattern is: **one route → one HTML file in R2**. For Overview, that file is `overview.html`, which contains the full shell and a single script tag that loads the prebuilt bundle. No worker-side HTML editing.

---

## 8. Summary Table

| Step | What happens |
|------|----------------|
| 1 | You (or agent) edit `dashboard/overview.html` and/or `overview-dashboard/src/*.jsx`. |
| 2 | Run `npm run build` in `overview-dashboard/` to produce `dist/overview-dashboard.js`. |
| 3 | Run `./agent-dashboard/deploy-to-r2.sh` to upload `overview.html` and `overview-dashboard.js` to R2. |
| 4 | Worker is unchanged for this flow; it already serves `static/dashboard/overview.html` and `static/dashboard/overview/overview-dashboard.js` from R2. |
| 5 | User visits `/dashboard/overview` → gets HTML → HTML loads script → script mounts React into `#overview-root` → Overview UI appears inside the shell. |

So in simple terms: **the dashboard Overview was refactored by turning the JSX into a single script, putting that script on R2, and having the existing HTML shell load it and give it one div to render into. The worker only serves files from R2; it does not rewrite or build the Overview page.**
