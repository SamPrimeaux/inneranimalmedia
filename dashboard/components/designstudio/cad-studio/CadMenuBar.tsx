import React, { useEffect, useRef, useState } from 'react';
import type { SavedSceneRow } from '../shared/ScenePanel';
import { BookOpen, Circle } from 'lucide-react';
import { IAM_AGENT_CHAT_COMPOSE } from '../../../agentChatConstants';
import type { WorkspaceId } from './cadStudioTypes';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

export type CadMenuBarProps = {
  activeWorkspace: WorkspaceId;
  onWorkspaceChange: (ws: WorkspaceId) => void;
  onSaveScene: () => void;
  sceneBusy: boolean;
  savedScenes: SavedSceneRow[];
  onNewScene: () => void;
  onOpenScene: (id: string) => void;
  onImportFile: () => void;
  onExportGlb: () => void;
  onExportSceneJson: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onDeleteSelected: () => void;
  onSelectAll: () => void;
  onDeselect: () => void;
  onRenameSelected?: () => void;
  onToggleOutliner: () => void;
  onToggleProperties: () => void;
  onToggleAnimationLibrary: () => void;
  animationLibraryOpen?: boolean;
  onToggleLibrary: () => void;
  libraryOpen?: boolean;
  onToggleAssets: () => void;
  onToggleTimeline: () => void;
  onToggleConsole: () => void;
  onResetLayout: () => void;
  onOperatorSearch: () => void;
  onGenerateCad: () => void;
  onRenderViewport: () => void;
  onRenderViaChat: (intent: string) => void;
  computeHealth: string;
  onShowDiagnostics: () => void;
};

function MenuDropdown({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="cad-menu__dropdown" ref={ref}>
      <button type="button" className="cad-studio__btn" onClick={() => setOpen((o) => !o)}>
        {label}
      </button>
      {open ? (
        <div className="cad-menu__panel" onClick={() => setOpen(false)}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  label,
  shortcut,
  onClick,
  disabled,
}: {
  label: string;
  shortcut?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button type="button" className="cad-menu__item" disabled={disabled} onClick={onClick}>
      <span>{label}</span>
      {shortcut ? <span className="cad-menu__shortcut">{shortcut}</span> : null}
    </button>
  );
}

export function CadMenuBar({
  activeWorkspace,
  onWorkspaceChange,
  onSaveScene,
  sceneBusy,
  savedScenes,
  onNewScene,
  onOpenScene,
  onImportFile,
  onExportGlb,
  onExportSceneJson,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onDeleteSelected,
  onSelectAll,
  onDeselect,
  onRenameSelected,
  onToggleOutliner,
  onToggleProperties,
  onToggleAnimationLibrary,
  animationLibraryOpen = false,
  onToggleLibrary,
  libraryOpen = false,
  onToggleAssets,
  onToggleTimeline,
  onToggleConsole,
  onResetLayout,
  onOperatorSearch,
  onGenerateCad,
  onRenderViewport,
  onRenderViaChat,
  computeHealth,
  onShowDiagnostics,
}: CadMenuBarProps) {
  const recent = [...savedScenes].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0)).slice(0, 8);

  return (
    <nav className="cad-studio__top-menu" aria-label="Application menu">
      <div className="cad-studio__menu-left">
        <MenuDropdown label="File">
          <MenuItem label="New Scene" shortcut="⌘N" onClick={onNewScene} />
          <MenuItem label="Open Scene…" onClick={() => recent[0] && onOpenScene(recent[0].id)} />
          {recent.length > 0 ? <div className="cad-menu__sep">Open Recent</div> : null}
          {recent.map((s) => (
            <MenuItem key={s.id} label={s.name} onClick={() => onOpenScene(s.id)} />
          ))}
          <div className="cad-menu__sep" />
          <MenuItem label="Import GLB…" onClick={onImportFile} />
          <MenuItem label="Export GLB" onClick={onExportGlb} />
          <MenuItem label="Export Scene JSON" onClick={onExportSceneJson} />
          <div className="cad-menu__sep" />
          <MenuItem label="Generate CAD Object" onClick={onGenerateCad} />
          <div className="cad-menu__sep" />
          <MenuItem label="Save Scene" shortcut="⌘S" onClick={onSaveScene} disabled={sceneBusy} />
          <MenuItem label="Close Scene" onClick={onNewScene} />
        </MenuDropdown>

        <MenuDropdown label="Edit">
          <MenuItem label="Undo" shortcut="⌘Z" onClick={onUndo} disabled={!canUndo} />
          <MenuItem label="Redo" shortcut="⇧⌘Z" onClick={onRedo} disabled={!canRedo} />
          <div className="cad-menu__sep" />
          <MenuItem label="Delete" shortcut="Del" onClick={onDeleteSelected} />
          <MenuItem label="Rename" onClick={onRenameSelected} />
          <div className="cad-menu__sep" />
          <MenuItem label="Select All" shortcut="A" onClick={onSelectAll} />
          <MenuItem label="Deselect All" onClick={onDeselect} />
        </MenuDropdown>

        <MenuDropdown label="Render">
          <MenuItem label="Render Viewport" onClick={onRenderViewport} />
          <MenuItem label="Render Camera" onClick={() => onRenderViaChat('Render still from active camera')} />
          <MenuItem label="Render Turntable" onClick={() => onRenderViaChat('Render 360 turntable animation')} />
          <MenuItem label="Render Product" onClick={() => onRenderViaChat('Render product hero shot')} />
          <MenuItem label="Render Animation" onClick={() => onRenderViaChat('Render scene animation')} />
        </MenuDropdown>

        <MenuDropdown label="Window">
          <MenuItem label="Toggle Animation Library" onClick={onToggleAnimationLibrary} />
          <MenuItem label="Toggle Outliner" onClick={onToggleOutliner} />
          <MenuItem label="Toggle Properties" onClick={onToggleProperties} />
          <MenuItem label="Toggle Library" onClick={onToggleLibrary} />
          <MenuItem label="Toggle Assets Panel" onClick={onToggleAssets} />
          <MenuItem label="Toggle Timeline" onClick={onToggleTimeline} />
          <MenuItem label="Toggle Console" onClick={onToggleConsole} />
          <div className="cad-menu__sep" />
          <MenuItem label="Command Palette" shortcut="⌘K" onClick={onOperatorSearch} />
          <MenuItem label="Reset Layout" onClick={onResetLayout} />
        </MenuDropdown>

        <MenuDropdown label="Help">
          <MenuItem label="Runner Diagnostics" onClick={onShowDiagnostics} />
          <MenuItem label="Engine Status (Blender/OpenSCAD/FreeCAD)" onClick={onShowDiagnostics} />
          <MenuItem
            label="Shortcuts"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent(IAM_AGENT_CHAT_COMPOSE, {
                  detail: {
                    message: 'Show IAM CAD Studio keyboard shortcuts (Cmd+K operator search, Del delete, etc.)',
                    send: false,
                    ensureAgentPanel: true,
                  },
                }),
              )
            }
          />
          <MenuItem label="About IAM CAD Studio" onClick={() => onShowDiagnostics()} />
        </MenuDropdown>
      </div>

      <WorkspaceSwitcher activeWorkspace={activeWorkspace} onWorkspaceChange={onWorkspaceChange} />

      <div className="cad-studio__menu-right">
        <button
          type="button"
          className={`cad-studio__btn cad-studio__library-btn${libraryOpen ? ' active' : ''}`}
          onClick={onToggleLibrary}
          title="Asset library"
          aria-pressed={libraryOpen}
        >
          <BookOpen size={14} strokeWidth={1.75} />
          <span>Library</span>
        </button>
        <button type="button" className="cad-studio__btn cad-studio__save-btn" onClick={onSaveScene} disabled={sceneBusy}>
          {sceneBusy ? 'Saving…' : 'Save Scene'}
        </button>
        <span
          className={`cad-menu__health cad-menu__health--${computeHealth}`}
          title={`Runner: ${computeHealth}`}
        >
          <Circle size={8} fill="currentColor" />
        </span>
      </div>
    </nav>
  );
}
