# Browser automation: Puppeteer (Worker) + Playwright MCP (local)

We use **both** so we can reliably set up and experience edge browser automation and local AI-driven browser automation.

---

## 1. Puppeteer in the Worker (Cloudflare Browser Rendering)

**Where it runs:** Inside the inneranimalmedia Worker at the edge.  
**Binding:** `MYBROWSER` (Browser rendering in Cloudflare dashboard + `wrangler.production.toml`).

### Config

- **Dashboard:** Workers & Pages → inneranimalmedia → Bindings → Add “Browser rendering” → Variable name: `MYBROWSER`.
- **wrangler.production.toml:** `[browser]` with `binding = "MYBROWSER"` (already added).

### API routes

| Route | Purpose |
|-------|--------|
| `GET /api/browser/health` | Checks that Puppeteer can launch and open a page. Returns `ok`, `metrics` snapshot. |
| `GET /api/browser/metrics?url=<url>` | Opens the given URL in headless Chrome and returns page metrics (e.g. for testing or monitoring). |

If `MYBROWSER` is not configured, these return `503` with a clear error.

### How to test

After deploy:

```bash
# Health (uses default example.com)
curl -s https://inneranimalmedia.com/api/browser/health | jq

# Metrics for a specific URL
curl -s "https://inneranimalmedia.com/api/browser/metrics?url=https://example.com" | jq
```

---

## 2. Playwright MCP (local / Cursor)

**Where it runs:** On your machine. Cursor (or another MCP client) talks to the Playwright MCP server, which drives a **local** browser. Use this for AI-assisted testing, automation, and debugging.

### Config (project-level)

This repo includes `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "playwright-mcp": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp"]
    }
  }
}
```

- **First use:** Cursor may prompt to run the server; approve so it can run `npx @playwright/mcp`.
- **Requirements:** Node.js 18+.
- **Optional:** You can also add the same server in Cursor Settings → MCP → Add new MCP Server (command: `npx @playwright/mcp`).

### What you get

- AI in Cursor can use Playwright tools (navigate, click, snapshot, etc.) against a real browser on your machine.
- Useful for: testing dashboard flows, checking R2-served pages, debugging redirects and auth, and general “drive the browser” tasks.

---

## Summary

| | Puppeteer (Worker) | Playwright MCP |
|--|--------------------|----------------|
| **Runs** | Edge (Cloudflare) | Your machine |
| **Use for** | Production endpoints (screenshots, PDFs, metrics, scraping) | Local testing and AI-driven automation in Cursor |
| **Config** | `MYBROWSER` binding + `wrangler.production.toml` | `.cursor/mcp.json` (and/or Cursor MCP settings) |

Both can be used at once: Puppeteer for live endpoints, Playwright MCP for finishing, testing, and fine-tuning with AI.
