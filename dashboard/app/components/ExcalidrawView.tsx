import React, { useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const WORKSPACE_ID = 'global';
const DEBOUNCE_MS  = 800;

const CANVAS_STATE_URL   = `/api/collab/canvas/state?workspace_id=${WORKSPACE_ID}`;
const CANVAS_PERSIST_URL = `/api/collab/canvas/elements?workspace_id=${WORKSPACE_ID}`;
const CANVAS_UPDATE_EVENT = 'iam:canvas_update';

// ─── Component ───────────────────────────────────────────────────────────────

export const ExcalidrawView: React.FC = () => {
    const [initialElements, setInitialElements] = useState<readonly ExcalidrawElement[]>([]);
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);

    const excalidrawApiRef  = useRef<ExcalidrawImperativeAPI | null>(null);
    const isLocalChangeRef  = useRef(false);
    const debounceTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load persisted canvas state from IAM_COLLAB DO on mount
    useEffect(() => {
        fetch(CANVAS_STATE_URL, { credentials: 'same-origin' })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (Array.isArray(data?.canvasElements) && data.canvasElements.length > 0) {
                    setInitialElements(data.canvasElements as readonly ExcalidrawElement[]);
                }
            })
            .catch(() => {})
            .finally(() => setInitialDataLoaded(true));
    }, []);

    // Apply canvas_update broadcasts from other clients (routed via App.tsx WebSocket)
    useEffect(() => {
        const handler = (e: Event) => {
            if (isLocalChangeRef.current) return;
            const elements = (e as CustomEvent<ExcalidrawElement[]>).detail;
            if (Array.isArray(elements) && excalidrawApiRef.current) {
                excalidrawApiRef.current.updateScene({ elements });
            }
        };
        window.addEventListener(CANVAS_UPDATE_EVENT, handler);
        return () => window.removeEventListener(CANVAS_UPDATE_EVENT, handler);
    }, []);

    // Cleanup debounce timer on unmount
    useEffect(() => {
        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        };
    }, []);

    const handleChange = (elements: readonly ExcalidrawElement[]) => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

        debounceTimerRef.current = setTimeout(async () => {
            isLocalChangeRef.current = true;
            try {
                await fetch(CANVAS_PERSIST_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ elements }),
                });
            } catch (_) {
                // fire-and-forget: persist failures are non-fatal
            } finally {
                isLocalChangeRef.current = false;
            }
        }, DEBOUNCE_MS);
    };

    // Hold render until initial fetch resolves to avoid stomping persisted state
    if (!initialDataLoaded) return null;

    return (
        <div style={{ width: '100%', height: '100%', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            {/*
              Excalidraw owns its own full-screen toolbar and canvas.
              overflow:hidden prevents shape list bleed outside the pane.
            */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
                <Excalidraw
                    theme="dark"
                    excalidrawAPI={(api) => { excalidrawApiRef.current = api; }}
                    initialData={{ elements: initialElements }}
                    onChange={handleChange}
                    UIOptions={{
                        canvasActions: {
                            changeViewBackgroundColor: true,
                            export: { saveFileToDisk: true },
                            loadScene: true,
                        },
                    }}
                />
            </div>
        </div>
    );
};
