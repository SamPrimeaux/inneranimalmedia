/**
 * Gorilla Mode UI files for SDK scaffold (server-side stream to developer machine).
 */
import { SDK_GORILLA_TEMPLATE_RAW } from './sdk-gorilla-template.generated.js';

const VARS = ['{{PROJECT_NAME}}', '{{LANE_KEY}}', '{{LANE_LABEL}}', '{{AGENT}}'];

function substitute(content, meta) {
  let out = String(content || '');
  const map = {
    '{{PROJECT_NAME}}': meta.projectName,
    '{{LANE_KEY}}': meta.laneKey,
    '{{LANE_LABEL}}': meta.laneLabel,
    '{{AGENT}}': meta.agent,
  };
  for (const token of VARS) {
    out = out.split(token).join(map[token] ?? '');
  }
  return out;
}

/**
 * @param {{ projectName: string, laneKey: string, laneLabel: string, agent: string }}
 * @returns {{ path: string, content: string }[]}
 */
export function buildGorillaScaffoldFiles(meta) {
  return Object.entries(SDK_GORILLA_TEMPLATE_RAW).map(([filePath, raw]) => ({
    path: filePath,
    content: substitute(raw, meta),
  }));
}
