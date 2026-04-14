import React, { useEffect, useRef, useState } from 'react';
import { Excalidraw } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/types/element/types';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types/types';
import '@excalidraw/excalidraw/index.css';

const WORKSPACE_ID = 'global';
const DEBOUNCE_MS = 800;

export const ExcalidrawView: React.FC = () => {
    const [initialElements, setInitialElements] = useState<readonly ExcalidrawElement[]>([]);
    const [initialDataLoaded, setInitialDataLoaded] = useState(false);
    const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
    const isLocalChangeRef = useRef(false);
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // On mount: load persisted canvas state from IAM_COLLAB DO
    useEffect(() => {
        fetch(`/api/collab/canvas/state?workspace_id=${WORKSPACE_ID}`, { credentials: 'same-origin' })
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (data?.canvasElements && Array.isArray(data.canvasElements) && data.canvasElements.length > 0) {
                    setInitialElements(data.canvasElements as readonly ExcalidrawElement[]);
                }
            })
            .catch(() => {})
            .finally(() => setInitialDataLoaded(true));
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
                await fetch(`/api/collab/canvas/elements?workspace_id=${WORKSPACE_ID}`, {
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
