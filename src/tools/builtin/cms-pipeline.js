/**
 * Agent Sam tools → iam-cms-pipeline Python Worker (HTML extract/inject, AI prototype).
 */
import { fetchCmsPipeline, fetchCmsPipelineJson, hasCmsPipelineBinding } from '../../core/cms-pipeline-service-proxy.js';

function missingBinding() {
  return { error: 'CMS_PIPELINE binding not configured — deploy iam-cms-pipeline and inneranimalmedia service binding' };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 */
async function cmsPipelinePrototype(params, env) {
  if (!hasCmsPipelineBinding(env)) return missingBinding();
  const goal = String(params.goal ?? params.prompt ?? params.message ?? '').trim();
  if (!goal) return { error: 'goal required' };
  const pageId = String(params.page_id ?? params.pageId ?? '').trim() || undefined;
  const projectSlug = String(params.project_slug ?? params.projectSlug ?? params.project ?? '').trim() || undefined;
  const out = await fetchCmsPipelineJson(env, '/agent/prototype', {
    goal,
    page_id: pageId,
    project_slug: projectSlug,
    page: params.page,
    sections: params.sections,
  });
  if (out.error) return out;
  return { ok: true, ...out, agent_applied: false };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 */
async function cmsPipelineExtract(params, env) {
  if (!hasCmsPipelineBinding(env)) return missingBinding();
  const html = String(params.html ?? params.content ?? '').trim();
  if (!html) return { error: 'html or content required' };
  const out = await fetchCmsPipelineJson(env, '/pipeline/extract-sections', { html });
  if (out.error) return out;
  return { ok: true, ...out };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 */
async function cmsPipelineInject(params, env) {
  if (!hasCmsPipelineBinding(env)) return missingBinding();
  const shellHtml = String(params.shell_html ?? params.html ?? '').trim();
  const sectionName = String(params.section_name ?? params.sectionName ?? '').trim();
  const fragment = String(params.fragment_html ?? params.fragment ?? '').trim();
  if (!shellHtml || !sectionName || !fragment) {
    return { error: 'shell_html, section_name, and fragment_html required' };
  }
  const out = await fetchCmsPipelineJson(env, '/pipeline/inject', {
    shell_html: shellHtml,
    section_name: sectionName,
    fragment_html: fragment,
    position: params.position || 'replace',
  });
  if (out.error) return out;
  return { ok: true, ...out };
}

/**
 * @param {Record<string, unknown>} params
 * @param {any} env
 */
async function cmsPipelineBootstrap(params, env) {
  if (!hasCmsPipelineBinding(env)) return missingBinding();
  const projectSlug = String(
    params.project_slug ?? params.projectSlug ?? params.project_id ?? params.project ?? '',
  ).trim();
  if (!projectSlug) return { error: 'project_slug required' };
  const res = await fetchCmsPipeline(
    env,
    `/pipeline/bootstrap?project_slug=${encodeURIComponent(projectSlug)}`,
    { method: 'GET' },
  );
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    return { error: data?.error || res.statusText || 'cms_pipeline_error', status: res.status, body: data };
  }
  return { ok: true, ...data };
}

export const pipelineHandlers = {
  cms_pipeline_prototype: cmsPipelinePrototype,
  cms_pipeline_extract: cmsPipelineExtract,
  cms_pipeline_inject: cmsPipelineInject,
  cms_pipeline_bootstrap: cmsPipelineBootstrap,
};
