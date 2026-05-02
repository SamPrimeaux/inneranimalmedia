# Agent Sam – Layout CSS Audit (flex height cascade)

Evidence-only. Where each of the 4 layout elements is defined and whether it can cause "each reply breaks the page."

---

## 1. Main layout container

**Where:** `static/dashboard/agent.html` (shell) + React root in `agent-dashboard/src/AgentDashboard.jsx`.

### Shell (static/dashboard/agent.html)

**html**
```css
html { height: 100%; overflow-x: hidden; }
```
(Line 166.) No `overflow: visible` on html.

**body** (default)
```css
body {
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow-x: hidden;
    max-width: 100vw;
}
```
(Lines 169-178.) So body has **min-height** (can grow) and no **height** or **overflow: hidden** by default.

**body.agent-dashboard-page** (agent page only)
```css
body.agent-dashboard-page {
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
    padding-bottom: 0 !important;
}
```
(Lines 665-670.) **Good:** fixed height + overflow hidden so the page doesn’t grow.

**.main-content** (default)
```css
.main-content {
    flex: 1;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 24px;
    min-height: 0;
    min-width: 0;
    max-width: 100%;
    background: var(--bg-canvas);
}
```
(Lines 622-631.) **Risk on other pages:** `overflow-y: auto` lets main scroll; on agent page this is overridden below.

**.main-content.agent-page-main**
```css
.main-content.agent-page-main {
    margin: 0;
    padding: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: calc(100vh - 60px);
    max-height: calc(100vh - 60px);
    min-height: 0;
}
```
(Lines 633-642.) **Good:** fixed height, overflow hidden, flex column, min-height 0.

**#agent-dashboard-root** (shell CSS + inline)
```css
.main-content.agent-page-main #agent-dashboard-root {
    flex: 1 1 0;
    min-height: 0;
    height: 100%;
}
```
(Lines 643-647.)

Inline on the element (line 1127):
```html
<div id="agent-dashboard-root" style="width:100%;height:100%;overflow:hidden;"></div>
```
**Good:** height 100%, overflow hidden; CSS adds flex 1 1 0 and min-height 0.

### React root (AgentDashboard.jsx, lines 1374-1388)

```js
style={{
  width: "100%",
  height: "100%",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  ...
}}
```
**Good:** full height, flex column, overflow hidden.

**Verdict (main container):** Shell + React root are correctly constrained **when** `body.agent-dashboard-page` is applied. If that class is missing (e.g. script order or wrong page), body would keep **min-height: 100vh** and could grow → **confirm** the script that adds `agent-dashboard-page` runs before first paint.

---

## 2. Sidebar / nav (sidenav)

**Where:** `static/dashboard/agent.html`. No class literally named "sidebar"; the left nav is **.sidenav**.

```css
.sidenav {
    width: 260px;
    background: var(--bg-nav);
    color: var(--text-nav);
    display: flex;
    flex-direction: column;
    ...
}
```
(Lines 487-495.) No explicit **flex-shrink** or **overflow** on the container.

```css
.sidenav-nav {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
}
```
(Lines 541-545.) **Good:** nav content scrolls with **overflow-y: auto**; **flex: 1** takes remaining space inside the column.

**Verdict:** Sidenav doesn’t affect the agent chat area; it’s a sibling of **main**. No **flex-shrink: 0** on **.sidenav** in the snippet, but it has a fixed width, so it doesn’t need to shrink. Sidebar scroll is correctly on **.sidenav-nav**.

---

## 3. Chat messages container

**Where:** Not in the HTML shell. The shell hides the old footer chat on the agent page; the **live** chat is inside the React app. So the “messages container” is in **AgentDashboard.jsx**.

**Structure:**  
`.iam-chat-pane` (flex column) contains:
- Icon bar (flexShrink: 0)
- Chat title row (no explicit flexShrink in snippet)
- **Messages wrapper** (the scroll area)
- Input bar (flexShrink: 0)

**Messages wrapper** (AgentDashboard.jsx, lines 1861-1875):

```js
<div
  style={{
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    padding: "0 16px 16px 16px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: 0,
    minWidth: 0,
    scrollBehavior: "smooth",
  }}
>
```
**Good:** **flex: 1**, **minHeight: 0**, **overflowY: "auto"** so only this block scrolls.

**Shell override that affects the chat pane** (static/dashboard/agent.html, @media max-width: 768px, lines 727-734):

```css
.main-content.agent-page-main #agent-dashboard-root,
#agent-dashboard-root > div,
#agent-dashboard-root .iam-chat-pane,
#agent-dashboard-root .iam-panel-docked {
    flex: 1 1 0;
    min-height: 0;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
}
```
So on mobile, **.iam-chat-pane** gets **overflow: auto**. That makes the **pane** itself a scroll container. The **inner** messages div still has **flex: 1** and **overflowY: auto**. So you effectively have:
- Pane: constrained height (flex 1 1 0, min-height 0), overflow auto.
- Messages div: flex 1, minHeight 0, overflowY auto.

If the pane’s height is correctly constrained, the messages div should still be the one that scrolls. If in some cases the pane’s height isn’t constrained (e.g. missing min-height somewhere above), the pane could grow and the “page” could look broken. **Recommendation:** on mobile, consider **overflow: hidden** on **.iam-chat-pane** so only the inner messages div scrolls, and keep **overflow: auto** only on **#agent-dashboard-root** or the root’s first child if you need a single scroll region.

**Verdict:** Messages container in React is correctly set up (flex 1, minHeight 0, overflowY auto). Mobile shell override gives the whole pane **overflow: auto**, which is a possible source of “whole pane scrolls” or odd behavior; worth testing with **overflow: hidden** on **.iam-chat-pane** on mobile.

---

## 4. Footer / input positioning

**Where:** AgentDashboard.jsx; no class like "chat-footer" or "input-wrapper" in the shell for the React chat.

**Input bar** (AgentDashboard.jsx, lines 2224-2227):

```js
<div style={{ "--mode-color": `var(--mode-${mode})`, flexShrink: 0 }}>
  <div style={{ flexShrink: 0, padding: "12px 16px", background: "var(--bg-nav)", borderTop: "1px solid var(--color-border)" }}>
```
**Good:** **flexShrink: 0** so the footer doesn’t shrink and stays at the bottom of the flex column. Not **position: sticky** or **position: fixed**; it’s just the last flex child, which is correct for a fixed-height column.

**Verdict:** Footer is correctly **flex-shrink: 0**; no **position: relative** that would make it “scroll away.”

---

## Summary table

| Element | Location | height / flex | overflow | Verdict |
|--------|----------|----------------|----------|--------|
| **body** (agent page) | agent.html 665-670 | height: 100vh/100dvh | hidden | OK |
| **main.agent-page-main** | agent.html 633-642 | height: calc(100vh - 60px), min-height: 0 | hidden | OK |
| **#agent-dashboard-root** | agent.html 643-647 + inline 1127 | flex: 1 1 0, height: 100% | hidden | OK |
| **React root div** | AgentDashboard.jsx 1374-1388 | height: 100%, flex column | hidden | OK |
| **Row (chat + panel)** | AgentDashboard.jsx 1399-1405 | flex: 1 1 0%, minHeight: 0 | hidden | OK |
| **.iam-chat-pane** | AgentDashboard.jsx 1408-1422 + agent.html 729-733 (mobile) | flex, minHeight: 0 | hidden (desktop); **auto** (mobile) | OK desktop; mobile see note |
| **Messages wrapper** | AgentDashboard.jsx 1861-1875 | flex: 1, minHeight: 0 | overflowY: auto | OK |
| **Chat footer** | AgentDashboard.jsx 2225-2227 | flexShrink: 0 | - | OK |

---

## What to fix if “each reply breaks the page” persists

1. **Confirm body class:** Ensure `agent-dashboard-page` is on `body` when the agent page loads (script at line 1126). If it’s missing, body stays **min-height: 100vh** and can grow.
2. **Mobile overflow:** In `@media (max-width: 768px)`, try **overflow: hidden** for **#agent-dashboard-root .iam-chat-pane** instead of **overflow: auto**, so only the inner messages div scrolls.
3. **Ensure shell is deployed:** The fixed layout lives in **static/dashboard/agent.html** (body height, main height, #agent-dashboard-root). If production serves an older file without those rules, the cascade will be wrong. Confirm the deployed HTML matches this file.

No **height: auto** or **overflow: visible** was found on the critical chain for the agent page; the main risk is missing body class or mobile overflow on the pane.
