# Agent Sam – Surgical Follow-up (Chat ↔ Monaco, R2, Diff, Bridge)

Evidence-only answers to the five follow-up questions.

---

## 1. Monaco file loading (Chat → Monaco direction)

### Grep result (AgentDashboard.jsx)

```
269:  const [codeContent, setCodeContent] = useState("");
2966:            onCodeContentChange={setCodeContent}
```

There is **no** `codeFilename`, `openFile`, or `loadFile` in AgentDashboard. The dashboard does **not** set which file Monaco displays by name. It only:

- Holds `codeContent` and passes `setCodeContent` to the panel as `onCodeContentChange`.
- Holds `monacoDiffFromChat` and passes it (and `onMonacoDiffResolved`) to the panel.

So: **Chat tells Monaco what to display only via the diff payload**, not by “loading a file by path.”

### When Agent Sam proposes a file change, what triggers Monaco to show it?

Two mechanisms exist; only one is active.

**A) Active path: “Open in Monaco” button (chat → diff)**

1. Worker streams SSE `data.type === "code"` with `data.code`, `data.filename`, `data.language` (worker emits this; dashboard does not set `proposedFileChange` from it).
2. AgentDashboard merges that into the assistant message (AgentDashboard.jsx 1013–1026):

```js
} else if (data.type === "code" && data.code != null) {
  const codeStr = typeof data.code === "string" ? data.code : JSON.stringify(data.code, null, 2);
  setMessages((prev) =>
    prev.map((m) =>
      m.id === assistantId
        ? { ...m, generatedCode: codeStr, filename: data.filename ?? "snippet", language: data.language ?? "text" }
        : m
    )
  );
}
```

3. The message is rendered with a code block and a button “Open in Monaco ->” (2057–2071) that calls `openInMonaco(msg)`.
4. **openInMonaco** (1213–1239):
   - Reads `message.filename`, `message.generatedCode`, `message.bucket` (or `defaultBucketForMonacoRef.current`).
   - Fetches **original** from R2: `GET /api/r2/buckets/{bucket}/object/{filename}`.
   - Calls `setMonacoDiffFromChat({ original: originalContent, modified: generatedCode, filename, language, bucket })`.
   - Opens the panel and switches to Code tab: `setPreviewOpen(true); setActiveTab("code");`.

So the **trigger** is: **user clicks “Open in Monaco ->”** on a message that has `generatedCode` / `filename`. Monaco then shows the **DiffEditor** with that `original` / `modified` and the filename from `monacoDiffFromChat`. The panel does not load a file by path from the address bar; it receives the diff object from the parent.

**B) Inactive path: proposedFileChange (same file already open)**

- FloatingPreviewPanel has an effect (564–573) that, when `proposedFileChange` is set and matches the currently open `codeFilename`, sets `setProposedContent(proposedFileChange.content)`, `setDiffMode(true)`, and switches to the Code tab.
- AgentDashboard **never** calls `setProposedFileChange(...)`. So this path is **never used**; the worker would need to send a dedicated event and the dashboard would need to set `proposedFileChange` from it.

**Summary:** Monaco is told what to display by **monacoDiffFromChat** (and optionally by **proposedFileChange**, which is currently unused). The only active trigger is the user clicking “Open in Monaco ->” after the agent has streamed a `type: "code"` chunk.

---

## 2. R2 write request structure (saveFileToR2)

### Exact fetch (FloatingPreviewPanel.jsx)

```js
const saveFileToR2 = useCallback(async () => {
  if (!codeFilename || !filesBucket) return;
  setSaving(true);
  try {
    const currentContent = monacoEditorRef.current?.getValue() ?? codeContent;
    const res = await fetch(
      `/api/r2/buckets/${encodeURIComponent(filesBucket)}/object/${encodeURIComponent(codeFilename)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "text/plain" },
        body: currentContent ?? codeContent,
      }
    );
    // ...
  } finally {
    setSaving(false);
  }
}, [codeFilename, filesBucket, codeContent, onCodeContentChange]);
```

- **URL:** `PUT /api/r2/buckets/{bucket}/object/{key}` (path-encoded bucket and key).
- **Headers:** `Content-Type: text/plain`.
- **Body:** Raw string. **Not** JSON. No `{ content: string, metadata?: object }`; the **entire body is the file content string**.

Same pattern for:
- **acceptProposedChange** (494–495): `body: proposedContent` (string).
- **handleKeepChangesFromChat** (522–528): `body: monacoDiffFromChat.modified` (string).

Worker expects the R2 object PUT body to be the raw bytes (here, UTF-8 text); it does not parse JSON for these routes.

---

## 3. Keep Changes button (location and visibility)

### Where it lives

- **File:** `agent-dashboard/src/FloatingPreviewPanel.jsx`
- **Handler:** `handleKeepChangesFromChat` (516–540): PUTs `monacoDiffFromChat.modified` to R2, then `setCodeFilename(monacoDiffFromChat.filename)`, `onCodeContentChange(monacoDiffFromChat.modified)`, `onMonacoDiffResolved()`.

### JSX (lines 1204–1216)

```jsx
{monacoDiffFromChat ? (
  <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderBottom: "1px solid var(--color-border)", background: "var(--bg-elevated)", flexShrink: 0, alignItems: "center" }}>
    <div style={{ flex: 1, fontSize: 13, color: "var(--text-muted)" }}>
      <span style={{ color: "var(--mode-ask)", fontWeight: 600 }}>+</span> Added
      <span style={{ marginLeft: 16, color: "var(--color-danger)", fontWeight: 600 }}>-</span> Removed
    </div>
    <button type="button" onClick={handleKeepChangesFromChat} disabled={saving} style={{ ... }}>
      {saving ? "Saving..." : saveSuccess ? "Saved" : "Keep Changes"}
    </button>
    <button type="button" onClick={handleUndoFromChat} style={{ ... }}>
      Undo
    </button>
  </div>
) : diffMode ? (
  // "PROPOSED CHANGE" bar with Accept OK / Reject X (different flow)
) : codeFilename ? (
  // Normal file bar (Edit / Save / Undo)
) : (
  // ...
)}
```

### What state triggers it to appear

- **Keep Changes** (and the “+ Added / - Removed” bar) appear when **`monacoDiffFromChat` is truthy**.
- That is set only by **openInMonaco** in AgentDashboard (after user clicks “Open in Monaco ->” on a message with `generatedCode`/`filename`).
- **diffMode** is a separate path (proposed change for the **already open** file); that branch shows “Accept OK” / “Reject X”, not “Keep Changes”. So:
  - **Keep Changes** ↔ `monacoDiffFromChat` (diff came from chat via “Open in Monaco”).
  - **Accept OK / Reject** ↔ `diffMode` (proposed change for current file; currently not fed from chat because `proposedFileChange` is never set).

---

## 4. Diff trigger (where setMonacoDiffFromChat is called)

### Grep (AgentDashboard.jsx)

```
235:  const [monacoDiffFromChat, setMonacoDiffFromChat] = useState(null);
1229:      setMonacoDiffFromChat({
1230:        original: originalContent,
1231:        modified: generatedCode,
2971:            monacoDiffFromChat={monacoDiffFromChat}
2972:            onMonacoDiffResolved={() => setMonacoDiffFromChat(null)}
```

**setMonacoDiffFromChat** is called in exactly one place: inside **openInMonaco** (1229–1235):

```js
setMonacoDiffFromChat({
  original: originalContent,
  modified: generatedCode,
  filename,
  language,
  bucket: bucket || undefined,
});
```

**openInMonaco** is invoked only when the user clicks the **“Open in Monaco ->”** button on an assistant message that has `generatedCode` (and optionally `filename`, `bucket`) (2059: `onClick={() => openInMonaco(msg)}`).

So: the agent does **not** auto-open the diff. The sequence is:

1. Agent streams `type: "code"` with `code`, `filename`, `language`.
2. Message is updated with `generatedCode`, `filename`, `language`.
3. User sees the code block and the “Open in Monaco ->” button.
4. User clicks the button → **openInMonaco(msg)** runs → fetches original from R2 (if bucket/filename) → **setMonacoDiffFromChat(...)** → panel opens to Code tab and shows DiffEditor + “Keep Changes” / “Undo”.

---

## 5. Intended flow (design summary)

**User:** “Fix the bug in utils.js.”

**Intended UX from the code:**

1. **Agent analyzes** and eventually streams a response that includes a **code** chunk: `type: "code"`, `code: "<new content>"`, `filename: "utils.js"` (and optionally `language`, `bucket`).
2. **Chat UI** updates the assistant message with `generatedCode`, `filename`, `language` and renders the code block plus the **“Open in Monaco ->”** button.
3. **User clicks “Open in Monaco ->”** → **openInMonaco(msg)**:
   - Fetches current file from R2 (if bucket/filename known).
   - Sets **monacoDiffFromChat** with original and modified.
   - Opens the right panel and switches to the **Code** tab.
4. **Monaco** shows the **DiffEditor** (original vs modified) and the bar with **“Keep Changes”** and **“Undo”**.
5. **User clicks “Keep Changes”** → **handleKeepChangesFromChat**:
   - PUTs `monacoDiffFromChat.modified` to R2 at `monacoDiffFromChat.filename` (and bucket).
   - Calls **onMonacoDiffResolved()** (dashboard sets `monacoDiffFromChat` to null).
   - Panel updates `codeFilename` and `codeContent` so the editor now shows the saved file as the current file.

So the intended flow is: **stream code → show in chat → user opens in Monaco → diff view → user keeps or undoes**. There is no automatic “focus Monaco and show diff” when the agent sends code; the user must click “Open in Monaco ->”. The **proposedFileChange** path (diff for the file already open in the panel) is implemented in the panel but never fed by the dashboard, so that alternative flow is currently unused.

---

## Gaps (from this follow-up)

| Gap | Evidence |
|-----|----------|
| Chat does not set “current file” by path | No `codeFilename` / `openFile` / `loadFile` in AgentDashboard; file identity for the diff comes from the message and `monacoDiffFromChat`. |
| proposedFileChange never set | Only `useState(null)` and pass-through; no `setProposedFileChange(...)` anywhere; panel effect that uses it never runs. |
| R2 PUT body | Plain string body, not JSON; worker expects raw body. |
| Keep Changes only for monacoDiffFromChat | “Keep Changes” is for diff-from-chat; “Accept OK” is for proposedFileChange/diffMode (unused from chat). |
