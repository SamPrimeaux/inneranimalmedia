# 🌌 MeauxCAD Studio: AI-First IDE Testbed

<div align="center">
  <img width="1200" height="475" alt="MeauxCAD Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
  <p><i>The Cloud-Native, Agent-First IDE for 3D and Full-Stack Development.</i></p>
</div>

---

## Overview

MeauxCAD Studio is a high-performance, desktop-class IDE built entirely on the Cloudflare ecosystem (Workers, D1, R2). This repository serves as a **Multi-Model AI Testbed** to refine the "Synchronous Pair Programming" pattern between Human Developers and AI Agents (Gemini, Vertex, Cursor, OpenAI, Anthropic).

---

## 🏗 Shell Wireframe (Baseline for Refinement)

As we transition into the production build, this ASCII mockup represents the current component hierarchy. Use this as your "visual spatial" guide for UI/UX refinement.

```text
+----------------------------------------------------------------------------------+
|  [Logo]  [Project Search / Command Bar]                      [Agent] [Set] [Term] |
+----+-----------------------------------------------------------------------------+
|    |                                                                             |
| A  |  +-----------------------------------------------------------------------+   |
| C  |  | [ Welcome ] [ Code: worker.ts ● ] [ Voxel ] [ Browser ] [ Draw ]      |   |
| T  |  +-----------------------------------------------------------------------+   |
| I  |  |                                                                       |   |
| V  |  |                                                                       |   |
| I  |  |                          MAIN WORKSPACE AREA                          |   |
| T  |  |                                                                       |   |
| Y  |  |               (Monaco / Three.js / Excalidraw / Iframe)               |   |
|    |  |                                                                       |   |
| B  |  |                                                                       |   |
| A  |  |                                                                       |   |
| R  |  |                                                                       |   |
+----+--+-----------------------------------------------------------------------+---|
|    |  | [ Terminal ] [ Output ] [ Debug ]                                     |   |
|    |  +-----------------------------------------------------------------------+   |
|    |  | $ npm run build                                                       |   |
|    |  | [####################] 100% Done                                     |   |
|    |  |                                                                       |   |
+----+--+-----------------------------------------------------------------------+---+
| [Status: Line 1, Col 1] [TS 5.0] [Cloud: Syncing] [Version 1.2.0]                 |
+-----------------------------------------------------------------------------------+
```

---

## 🛠 Component & Architectural Matrix

### 1. The MeauxCAD Shell (`App.tsx`)
The master orchestrator of states:
- **`activeActivity`**: Toggles the dynamic-width sidebar (Files, MCPs, SQL, etc.).
- **`activeTab`**: Manages the multi-view layer system (Code vs. 3D Engine vs. Browser).
- **`isDirty`**: Visual "dirty" indicators (`●`) for unsaved edits.
- **`Ghost Sync`**: Automatic background syncing of local state to R2/D1/Google Drive.

### 2. The Agent Core (`ChatAssistant.tsx`)
Designed as a **First-Class Citizen**:
- **Context Awareness**: Receives `activeFileName` and `activeFileContent` in its system prompt.
- **Terminal Bridging**: Executing commands via `XTermShell`.
- **RAG Integration**: Utilizing Cloudflare D1 for persistent architectural memory.

### 3. Integrated Tool-Chain
- **Monaco Editor**: High-fidelity code editing with diff-view support.
- **Voxel Engine**: Built-in 3D engine (Three.js) for spatial design.
- **Excalidraw**: Whiteboard layer for architectural sketching.
- **Browser Runtime**: In-IDE browser for testing web deployments.
- **MCP (Model Context Protocol)**: Support for Chrome DevTools, Playwright, and custom agents tools.

---

## 🚦 Deployment & Staging Workflow

This buildout uses a dual-repo architectural sync for rapid iteration.

### 1. Shell Propagation (`meauxcad`)
The frontend shell is hosted as a static asset within the R2 dashboard environment.
- **Base Path**: `/static/dashboard/agent/`
- **Promotion**: HTML and JS chunks are manually uploaded to the `agent-sam-sandbox-cicd` bucket.
- **Protection**: R2 keys are restricted to authenticated IAM sessions.

### 2. Backend Synchronization (`agentsam-dashboard`)
Core routing and AI logic updates follow a specific branch-based workflow:
- **Repository**: `SamPrimeaux/inneranimalmedia-agentsam-dashboard`
- **Branch**: `agentsam-clean`
- **Path**: `source/worker.js`
- **Workflow**: Local `worker.js` edits are pushed to the `agentsam-clean` branch for staging before promotion to production.

### Local Build Command
```bash
npm run build
# Assets uploaded manually to R2 static/dashboard/agent/assets/
```

### Prompting Strategy (Environment Bindings)
When instructing future agents, use the following placeholder syntax:
- `[TERMINAL_WS_URL]`: Secure WebSocket endpoint for PTY integration.
- `[STARTUP_GREETING]`: Key for DB-driven terminal welcome message.
- `[DASHBOARD_R2]`: Primary bucket for CAD assets and IDE exports.
- `[INTERNAL_API_SECRET]`: Auth token for worker-to-worker communication.

---

## 💎 Project Structure

- `/components`: UI units (MonacoEditorView, XTermShell, ChatAssistant).
- `/src`: Core logic, including Durable Object sessions (`MeauxCADSession.ts`).
- `worker.ts`: API routing, AI model management, and DB persistence.
- `wrangler.jsonc`: Cloudflare configuration baseline.

---

<div align="center">
  <sub>Built for Multi-Model AI End-to-End Testing & IDE Evolution.</sub>
</div>
