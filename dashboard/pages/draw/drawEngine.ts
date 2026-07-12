/** Draw dual-engine: Excalidraw (diagrams) + Wireframe studio (Figma-like UI mockups). */

export type DrawEngine = 'excalidraw' | 'wireframe';

export function parseDrawEngine(raw: string | null | undefined): DrawEngine {
  const v = String(raw || '')
    .trim()
    .toLowerCase();
  if (v === 'wireframe' || v === 'sketch' || v === 'studio' || v === 'figma') return 'wireframe';
  return 'excalidraw';
}

export function drawPathForEngine(engine: DrawEngine): string {
  return engine === 'wireframe' ? '/dashboard/draw?engine=wireframe' : '/dashboard/draw?engine=excalidraw';
}
