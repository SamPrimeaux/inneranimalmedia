import React, { useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

/** Scene elements — deep paths under @excalidraw/excalidraw are not resolved by this project's tsc. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawElement = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ExcalidrawImperativeAPI = any;

const DEBOUNCE_MS = 800;

function getIamWorkspaceId(): string {
    if (typeof window === 'undefined') return 'global';
    const w = (window as unknown as { __IAM_WORKSPACE_ID__?: string }).__IAM_WORKSPACE_ID__;
    return typeof w === 'string' && w.trim() ? w.trim() : 'global';
}

export const ExcalidrawView: React.FC = () => {
    const [initialElements, setInitialElements] = useState<readonly ExcalidrawElement[]>([]);
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
    const isLocalChangeRef = useRef(false);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load persisted canvas when mount or IAM workspace id changes (via event from App.tsx).
    useEffect(() => {
        const load = () => {
            const ws = getIamWorkspaceId();
            fetch(`/api/collab/canvas/state?workspace_id=${encodeURIComponent(ws)}`, { credentials: 'same-origin' })
                .then((r) => (r.ok ? r.json() : null))
                .then((data) => {
                    if (data?.canvasElements && Array.isArray(data.canvasElements) && data.canvasElements.length > 0) {
                        setInitialElements(data.canvasElements as readonly ExcalidrawElement[]);
                    }
                })
                .catch(() => {})
                .finally(() => setInitialDataLoaded(true));
        };
        load();
        window.addEventListener('iam_workspace_id', load);
        return () => window.removeEventListener('iam_workspace_id', load);
    }, []);

    // Listen for agent-driven tool calls (excalidraw_open, excalidraw_add_elements, excalidraw_clear, excalidraw_export)
    useEffect(() => {
        const handler = (e: Event) => {
            const { action, params } = (e as CustomEvent).detail || {};
            const api = excalidrawApiRef.current;
            if (!api) return;
            if (action === 'open' || action === 'clear') {
                api.updateScene({ elements: [] });
            } else if (action === 'add_elements' && Array.isArray(params?.elements)) {
                const existing = api.getSceneElements();
                api.updateScene({ elements: [...existing, ...params.elements] });
            } else if (action === 'export') {
                api.exportToBlob({ mimeType: 'image/png' }).then((blob: Blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = 'excalidraw-export.png'; a.click();
                    URL.revokeObjectURL(url);
                });
            }
        };
        window.addEventListener('iam:excalidraw_action', handler);
        return () => window.removeEventListener('iam:excalidraw_action', handler);
    }, []);

    // Listen for canvas_update broadcast from other clients via App.tsx WebSocket
    useEffect(() => {
        const handler = (e: Event) => {
            if (isLocalChangeRef.current) return;
            const elements = (e as CustomEvent).detail as ExcalidrawElement[];
            if (Array.isArray(elements) && excalidrawApiRef.current) {
                excalidrawApiRef.current.updateScene({ elements });
            }
        };
        window.addEventListener('iam:canvas_update', handler);
        return () => window.removeEventListener('iam:canvas_update', handler);
    }, []);

    const handleChange = (elements: readonly ExcalidrawElement[]) => {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(async () => {
            isLocalChangeRef.current = true;
            try {
                const ws = getIamWorkspaceId();
                await fetch(`/api/collab/canvas/elements?workspace_id=${encodeURIComponent(ws)}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ elements }),
                });
            } catch (_) {}
            isLocalChangeRef.current = false;
        }, DEBOUNCE_MS);
    };

    // Don't render Excalidraw until initial state fetch resolves (avoids overwriting with empty)
    if (!initialDataLoaded) return null;

    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/*
              Excalidraw renders its own full-screen toolbar and canvas.
              We must give it a properly-isolated container with explicit dimensions.
              overflow:hidden prevents the shape list from spilling outside the pane.
            */}
            <div
                style={{
                    flex: 1,
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <Excalidraw
                    theme="dark"
                    excalidrawAPI={(api) => { excalidrawApiRef.current = api; }}
                    initialData={{ elements: initialElements }}
                    onChange={(elements) => handleChange(elements)}
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
