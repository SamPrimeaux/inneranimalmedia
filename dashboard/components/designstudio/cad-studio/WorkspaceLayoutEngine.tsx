import React, { useMemo } from 'react';
import type { EditorId, WorkspaceId } from './cadStudioTypes';
import { getLayoutForWorkspace } from './layoutPresets';

export type WorkspaceLayoutEngineProps = {
  workspace: WorkspaceId;
  layoutOverride?: string | null;
  panelVisibility: {
    outliner: boolean;
    properties: boolean;
    assets: boolean;
    timeline: boolean;
    toolShelf: boolean;
  };
  editors: Partial<Record<EditorId, React.ReactNode>>;
};

export function WorkspaceLayoutEngine({
  workspace,
  layoutOverride,
  panelVisibility,
  editors,
}: WorkspaceLayoutEngineProps) {
  const layout = useMemo(() => getLayoutForWorkspace(workspace), [workspace]);

  const areaGroups = useMemo(() => {
    const hidden = new Set<EditorId>();
    if (!panelVisibility.toolShelf) hidden.add('toolShelf');
    if (!panelVisibility.outliner) hidden.add('outliner');
    if (!panelVisibility.properties) hidden.add('properties');
    if (!panelVisibility.assets) hidden.add('assets');
    if (!panelVisibility.outliner && !panelVisibility.properties && !panelVisibility.assets) {
      hidden.add('rightTabs');
    }
    if (!panelVisibility.timeline) hidden.add('timeline');
    if (!panelVisibility.timeline) hidden.add('dopesheet');

    const groups = new Map<string, EditorId[]>();
    for (const cell of layout.cells) {
      if (hidden.has(cell.editor)) continue;
      const list = groups.get(cell.area) ?? [];
      list.push(cell.editor);
      groups.set(cell.area, list);
    }
    return groups;
  }, [layout, panelVisibility]);

  const style: React.CSSProperties = {
    display: 'grid',
    gridTemplateAreas: layoutOverride ?? layout.gridTemplateAreas,
    gridTemplateColumns: layout.gridTemplateColumns,
    gridTemplateRows: layout.gridTemplateRows,
    minHeight: 0,
    flex: 1,
  };

  return (
    <main className="cad-studio__layout-engine" style={style}>
      {Array.from(areaGroups.entries()).map(([area, editorIds]) => {
        const nodes = editorIds.map((id) => editors[id]).filter(Boolean);
        if (nodes.length === 0) return null;
        return (
          <div
            key={area}
            className={`cad-studio__layout-cell${nodes.length > 1 ? ' cad-studio__layout-cell--stack' : ''}`}
            style={{ gridArea: area }}
          >
            {nodes.map((node, i) => (
              <div key={editorIds[i]} className="cad-studio__layout-stack-item">
                {node}
              </div>
            ))}
          </div>
        );
      })}
    </main>
  );
}
