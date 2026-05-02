# File context empty content – timing debug

## 1. useEffect that calls onFileContextChange

**FloatingPreviewPanel.jsx lines 559-562:**

```559:562:agent-dashboard/src/FloatingPreviewPanel.jsx
  // Notify parent whenever file loaded in Code tab changes (for agent context)
  useEffect(() => {
    onFileContextChange?.({ filename: codeFilename, content: codeContent, bucket: filesBucket });
  }, [codeFilename, codeContent, filesBucket, onFileContextChange]);
```

So the effect runs whenever `codeFilename`, `codeContent`, or `filesBucket` changes. It passes the **current** prop/state values to the parent.

---

## 2. What triggers codeContent to update when a file is loaded

`codeContent` is a **prop** from the parent (AgentDashboard). It is updated only when the parent’s state changes. The parent’s state is updated by **onCodeContentChange**, which is **setCodeContent** in AgentDashboard.

In the panel, the places that load file content and call `onCodeContentChange` are:

**R2 (openFileInCode), lines 397-411:**

```397:411:agent-dashboard/src/FloatingPreviewPanel.jsx
  const openFileInCode = useCallback((bucket, key) => {
    ...
    fetch(...)
      .then((r) => { ... return r.text(); })
      .then((text) => {
        setCodeFilename(key || "");
        setSelectedFileForView({ key: key || "", url });
        if (onCodeContentChange) onCodeContentChange(text);
        setEditMode(false);
        if (onTabChange) onTabChange("code");
      })
```

So when the R2 fetch completes: `setCodeFilename(key)` runs (local state), then `onCodeContentChange(text)` runs (parent’s `setCodeContent(text)`). Same pattern in **openGdriveFileInCode** (422-423) and **openGithubFileInCode** (446-447): they set local `codeFilename` and call `onCodeContentChange(data.content)`.

---

## 3. Sequence: when filename vs content updates, when the effect runs

- **When filename is set:** Inside the same `.then()` that receives the response (e.g. `text`). So `setCodeFilename(key)` runs in the same tick as `onCodeContentChange(text)`.
- **When content is “loaded” into Monaco / codeContent:** Content is loaded by calling `onCodeContentChange(text)`. That updates **parent** state (`codeContent`). The parent then re-renders and passes the new `codeContent` back down as a prop. So the panel’s `codeContent` prop updates on the **next** render after the parent’s state update.
- **When onFileContextChange fires:** It runs from the **useEffect** above. That effect runs after the panel has rendered with the new dependency values. So:
  1. User clicks file → fetch runs.
  2. Fetch resolves → `.then((text) => { ... })` runs.
  3. **Same synchronous block:** `setCodeFilename(key)` and `onCodeContentChange(text)`.
  4. React processes updates. The **child** (FloatingPreviewPanel) has a state update (`setCodeFilename`). The **parent** (AgentDashboard) has a state update (`setCodeContent(text)`).
  5. React re-renders. Often the **child** re-renders first (its state changed). At that moment the parent has not re-rendered yet, so the child still receives the **previous** `codeContent` prop, which is **""** (initial/default).
  6. So the **first** time the effect runs after opening the file, it sees `codeFilename === "community.html"` and `codeContent === ""` → `onFileContextChange({ filename: "community.html", content: "", bucket: "..." })`.
  7. Later the parent re-renders with the new `codeContent`, passes it down, the panel re-renders again, the effect runs again with full content. So you can see a second “File context changed” with the real content – but the **first** emission is the one with empty content.

So: **the callback fires once with empty content because the effect runs on the render triggered by `codeFilename` (and possibly `filesBucket`) before the parent has re-rendered and passed the new `codeContent`.**

---

## 4. Why content is empty

- **Reason:** The effect runs as soon as `codeFilename` (and/or `filesBucket`) changes. That re-render can happen **before** the parent has applied `onCodeContentChange(text)` and re-rendered, so the panel still has the old `codeContent` prop (`""`).
- So it’s not that the callback runs “before content loads” from the network; the fetch has already completed and `onCodeContentChange(text)` has been called. The issue is that **the effect runs on a render where the parent hasn’t updated the `codeContent` prop yet**, so you get one emission with `content: ""` and then a later one with full content.

---

## Fix

Emit file context from the **loaders** with the content you already have (e.g. `text` or `data.content`), so the agent gets the correct content on the same tick as the file load, and keep the effect only for when the user edits in Monaco (or for consistency when codeContent/codeFilename change later). That way you avoid relying on the effect running after the parent has updated the prop.
