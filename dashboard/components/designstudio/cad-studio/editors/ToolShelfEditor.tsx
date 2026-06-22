import React from 'react';
import type { WorkspaceId, ViewTool } from '../cadStudioTypes';
import { dispatchCadChat } from '../dispatchCadChat';

export type ToolDef = {
  id: string;
  label: string;
  icon: string;
  title: string;
  operatorId?: string;
  localAction?: () => void;
};

const BASE_TOOLS: ToolDef[] = [
  { id: 'select', label: 'S', icon: '▢', title: 'Select' },
  { id: 'move', label: 'G', icon: '✛', title: 'Move' },
  { id: 'rotate', label: 'R', icon: '↻', title: 'Rotate' },
  { id: 'scale', label: 'S', icon: '⬚', title: 'Scale' },
];

const WORKSPACE_TOOLS: Partial<Record<WorkspaceId, ToolDef[]>> = {
  Layout: BASE_TOOLS,
  Modeling: [
    ...BASE_TOOLS,
    { id: 'extrude', label: 'E', icon: 'E', title: 'Extrude', operatorId: 'generateBlender' },
    { id: 'inset', label: 'I', icon: 'I', title: 'Inset', operatorId: 'generateBlender' },
    { id: 'bevel', label: 'B', icon: 'B', title: 'Bevel', operatorId: 'generateBlender' },
    { id: 'loopcut', label: 'L', icon: 'L', title: 'Loop Cut', operatorId: 'generateBlender' },
  ],
  Sculpting: [
    { id: 'draw', label: 'D', icon: '●', title: 'Draw', operatorId: 'generateBlender' },
    { id: 'smooth', label: 'S', icon: '≈', title: 'Smooth', operatorId: 'generateBlender' },
    { id: 'grab', label: 'G', icon: '✋', title: 'Grab', operatorId: 'generateBlender' },
  ],
  'UV Editing': [
    { id: 'unwrap', label: 'U', icon: 'U', title: 'Smart UV', operatorId: 'generateBlender' },
    { id: 'pack', label: 'P', icon: 'P', title: 'Pack Islands', operatorId: 'generateBlender' },
  ],
  'Texture Paint': [
    { id: 'paint', label: 'P', icon: '🖌', title: 'Paint', operatorId: 'generateObject' },
  ],
  Shading: BASE_TOOLS,
  Animation: [
    ...BASE_TOOLS,
    { id: 'keyframe', label: 'K', icon: '◆', title: 'Insert Keyframe', operatorId: 'generateBlender' },
  ],
  Rendering: BASE_TOOLS,
  Compositing: [
    { id: 'composite', label: 'C', icon: 'C', title: 'Composite', operatorId: 'generateBlender' },
  ],
  'Geometry Nodes': [
    { id: 'regen', label: 'R', icon: 'R', title: 'Regenerate', operatorId: 'generateOpenSCAD' },
  ],
  Scripting: [
    { id: 'run', label: '▶', icon: '▶', title: 'Run Script', operatorId: 'executeScript' },
  ],
  'Motion Tracking': [
    { id: 'track', label: 'T', icon: '+', title: 'Add Tracker', operatorId: 'generateBlender' },
    { id: 'solve', label: 'S', icon: 'S', title: 'Solve Camera', operatorId: 'generateBlender' },
  ],
  'Video Editing': [
    { id: 'cut', label: 'C', icon: '✂', title: 'Cut Strip', operatorId: 'generateBlender' },
  ],
  '2D Animation': [
    { id: 'draw', label: 'D', icon: '✎', title: 'Draw', operatorId: 'generateBlender' },
  ],
  Agent: [
    { id: 'generate', label: 'AI', icon: 'AI', title: 'Generate', operatorId: 'generateObject' },
  ],
};

export type ToolShelfEditorProps = {
  workspace: WorkspaceId;
  activeTool: ViewTool | string;
  onToolChange: (tool: string) => void;
  onOpenAssets?: () => void;
  onOpenOperators?: () => void;
  onExport?: () => void;
  onRepair?: () => void;
  selectedObjectId?: string | null;
  sceneId?: string | null;
};

export function ToolShelfEditor({
  workspace,
  activeTool,
  onToolChange,
  onOpenAssets,
  onOpenOperators,
  onExport,
  onRepair,
  selectedObjectId,
  sceneId,
}: ToolShelfEditorProps) {
  const tools = WORKSPACE_TOOLS[workspace] ?? BASE_TOOLS;
  const activeDef = tools.find((t) => t.id === activeTool) ?? tools[0];

  const handleTool = (tool: ToolDef) => {
    onToolChange(tool.id);
    if (tool.localAction) {
      tool.localAction();
      return;
    }
    if (tool.operatorId && ['extrude', 'inset', 'bevel', 'loopcut', 'draw', 'smooth', 'grab', 'unwrap', 'solve', 'composite', 'track'].includes(tool.id)) {
      dispatchCadChat({
        operatorId: tool.operatorId,
        prompt: `Apply ${tool.title} to the selected object in ${workspace} workspace.`,
        workspace,
        selectedObjectId,
        sceneId,
      });
    }
  };

  return (
    <aside className="cad-studio__tool-rail cad-editor cad-editor--tools" aria-label="Tool shelf">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`cad-studio__tool-btn${activeTool === t.id ? ' active' : ''}`}
          title={t.title}
          onClick={() => handleTool(t)}
        >
          {t.icon}
          {t.label ? <span className="cad-studio__tool-label">{t.label}</span> : null}
        </button>
      ))}
      <div className="cad-studio__tool-spacer" />
      <button type="button" className="cad-studio__tool-btn" title="Assets" onClick={onOpenAssets}>
        📦
      </button>
      <button type="button" className="cad-studio__tool-btn" title="Generate" onClick={onOpenOperators}>
        AI
      </button>
      <button type="button" className="cad-studio__tool-btn" title="Repair" onClick={onRepair}>
        FX
      </button>
      <button type="button" className="cad-studio__tool-btn" title="Export" onClick={onExport}>
        EX
      </button>
      {activeDef ? (
        <div className="cad-studio__tool-panel">
          <div className="cad-studio__tool-panel-title">{activeDef.title}</div>
          <p className="cad-studio__tool-panel-hint">
            {activeDef.operatorId
              ? 'Heavy ops dispatch via ChatAssistant → runner.'
              : 'Viewport transform tool.'}
          </p>
        </div>
      ) : null}
    </aside>
  );
}
