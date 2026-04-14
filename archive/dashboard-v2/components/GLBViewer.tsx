import React from 'react';
import '@google/model-viewer';

export const GLBViewer: React.FC<{ url: string, filename?: string }> = ({ url, filename = '3D Asset' }) => {
    return (
        <div className="w-full h-full flex flex-col bg-[var(--bg-app)] relative overflow-hidden">
             <div className="absolute top-4 right-4 z-10 bg-[var(--bg-panel)]/80 text-[10px] uppercase tracking-widest text-[var(--text-muted)] backdrop-blur-md px-3 py-1.5 rounded-full border border-[var(--border-subtle)] shadow-xl flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-[var(--solar-cyan)] animate-pulse" />
                 Previewing: {filename}
             </div>
             {/* @ts-ignore - model-viewer is a web component implicitly bound to the window registry */}
             <model-viewer
                src={url}
                camera-controls 
                auto-rotate
                shadow-intensity="1"
                environment-image="neutral"
                style={{ width: '100%', height: '100%', backgroundColor: 'var(--bg-app)', outline: 'none' }}
             >
             {/* @ts-ignore */}
             </model-viewer>
        </div>
    );
};
