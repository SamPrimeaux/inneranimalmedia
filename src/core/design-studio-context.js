/**
 * Compact Design Studio viewport context for Agent Sam chat.
 */

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {string|null}
 */
export function formatDesignStudioContextForAgent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const surface = String(raw.surface || '');
  const route = String(raw.route || raw.dashboard_route || '');
  const isDesignStudio =
    surface === 'design_studio' ||
    route.includes('/dashboard/designstudio') ||
    route.includes('/dashboard/agent/');
  if (!isDesignStudio && !raw.scene_id && !raw.entity_count) return null;

  const lines = [
    '[Design Studio — live viewport context. You CAN see what is loaded in the 3D viewer from this block. Answer questions about the open scene using these facts; do not claim you lack a viewer feed when this block is present.]',
    `surface: design_studio`,
    `phase: ${String(raw.phase || 'unknown')}`,
    `scene_id: ${raw.scene_id != null ? String(raw.scene_id) : '(none)'}`,
    `scene_name: ${raw.scene_name != null ? String(raw.scene_name) : '(none)'}`,
    `cad_job_id: ${raw.cad_job_id != null ? String(raw.cad_job_id) : '(none)'}`,
    `entity_count: ${Number(raw.entity_count ?? 0)}`,
    `selected_entity_id: ${raw.selected_entity_id != null ? String(raw.selected_entity_id) : '(none)'}`,
    `compute_status: ${raw.compute_status != null ? String(raw.compute_status) : '(unknown)'}`,
  ];

  if (raw.cad_job_status) {
    lines.push(
      `cad_job_status: ${String(raw.cad_job_status)}`,
      `cad_job_progress_pct: ${raw.cad_job_progress_pct != null ? String(raw.cad_job_progress_pct) : '—'}`,
      `cad_public_url: ${raw.cad_public_url != null ? String(raw.cad_public_url) : '(none)'}`,
      `cad_engine: ${raw.engine != null ? String(raw.engine) : '(unknown)'}`,
    );
  }

  const selected =
    raw.selected_entity && typeof raw.selected_entity === 'object'
      ? /** @type {Record<string, unknown>} */ (raw.selected_entity)
      : null;
  if (selected) {
    lines.push(
      `selected_entity: name=${String(selected.name || selected.id || '?')} type=${String(selected.type || 'prop')} model=${selected.modelUrl != null ? String(selected.modelUrl) : '(none)'}`,
    );
  }

  const entities = Array.isArray(raw.entities) ? raw.entities : [];
  if (entities.length) {
    const preview = entities
      .slice(0, 12)
      .map((e) => {
        const row = /** @type {Record<string, unknown>} */ (e);
        const nm = String(row.name || row.id || '?');
        const ty = String(row.type || 'prop');
        const url = row.modelUrl != null ? String(row.modelUrl).slice(0, 80) : '';
        return url ? `${nm} (${ty}, glb)` : `${nm} (${ty})`;
      })
      .join('; ');
    lines.push(`entities_in_viewport: ${preview}`);
  } else if (Number(raw.entity_count ?? 0) === 0) {
    lines.push('entities_in_viewport: (empty — no models loaded yet)');
  }

  lines.push(
    'cad_actions: For new 3D models call illustration_create with iam.illustration.v1 (intent model_3d, engine auto/openscad, brief from user). Do not only describe — run the tool. After script_ready the pipeline auto-executes to GLB.',
  );

  return lines.join('\n');
}

/**
 * @param {unknown} browserContext
 * @param {unknown} body
 * @returns {Record<string, unknown>|null}
 */
export function extractDesignStudioContext(browserContext, body) {
  const fromBrowser =
    browserContext && typeof browserContext === 'object'
      ? /** @type {Record<string, unknown>} */ (browserContext).designStudioContext
      : null;
  const ws =
    browserContext &&
    typeof browserContext === 'object' &&
    /** @type {Record<string, unknown>} */ (browserContext).workspaceContext &&
    typeof /** @type {Record<string, unknown>} */ (browserContext).workspaceContext === 'object'
      ? /** @type {Record<string, unknown>} */ (
          /** @type {Record<string, unknown>} */ (browserContext).workspaceContext
        ).designStudioContext
      : null;
  const fromBody =
    body && typeof body === 'object'
      ? /** @type {Record<string, unknown>} */ (body).designStudioContext
      : null;
  const raw =
    fromBrowser && typeof fromBrowser === 'object'
      ? fromBrowser
      : ws && typeof ws === 'object'
        ? ws
        : fromBody && typeof fromBody === 'object'
          ? fromBody
          : null;
  return raw && typeof raw === 'object' ? raw : null;
}
