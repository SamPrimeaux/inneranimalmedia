/**
 * src/cron/jobs/skill-trigger-cron.js
 *
 * Timed Workflow Trigger — CF Workers native (no Cloud Scheduler, no GCP).
 *
 * Runs on `0 6 * * *` alongside existing RAG jobs (rag-six-am.js).
 * Two responsibilities:
 *
 * 1. SKILL PLAYBOOK R2 SYNC
 *    Reads agentsam_skill + agentsam_subagent_profile from D1,
 *    builds a full .md playbook per skill, writes to AUTORAG_BUCKET
 *    at skills/{skill_key}/SKILL.md — same bucket/prefix visible in
 *    your R2 dashboard (inneranimalmedia-autorag/skills/).
 *
 * 2. SKILL PLAYBOOK VECTORIZE INDEX
 *    Chunks each SKILL.md by ## heading, embeds via Workers AI,
 *    upserts into AGENTSAM_VECTORIZE_DOCUMENTS so sub-agents can
 *    RAG-retrieve their own playbooks during execution.
 *    source_type = 'skill_playbook' for filtered queries.
 *
 * Ledgered via agentsam_cron_runs. Non-fatal per-skill.
 */

import { chunkMarkdown } from '../chunk-markdown.js';
import { generateWorkersAiEmbedding } from '../../core/embed-workers-ai.js';
import { completeCronRun, failCronRun, startCronRun } from '../../core/cron-run-ledger.js';
import { cronTenantId } from '../cron-tenant.js';

const CRON_EXPR = '0 6 * * *';
const JOB_NAME = 'skill_playbook_sync';
const SKILLS_R2_PREFIX = 'skills/';
const SOURCE_TYPE = 'skill_playbook';
const EMBED_BATCH_SIZE = 20;

function buildSkillPlaybook(skill, profiles) {
  const meta = (() => { try { return JSON.parse(skill.metadata_json || '{}'); } catch { return {}; } })();
  const pipeline = Array.isArray(meta.pipeline) ? meta.pipeline : [];
  const maxIter = meta.max_iterations ?? meta.max_slides ?? 1;

  let md = `# Skill: ${skill.name}\n\n`;
  md += `**Skill key:** \`${skill.id}\`\n`;
  md += `**Slash trigger:** \`/${skill.slash_trigger}\`\n`;
  md += `**Scope:** ${skill.scope || 'workspace'}\n`;
  md += `**Retrieval strategy:** ${skill.retrieval_strategy || 'db'}\n`;
  if (maxIter > 1) md += `**Max iterations:** ${maxIter}\n`;
  md += `\n## Description\n\n${skill.description || skill.content_markdown || ''}\n\n`;

  if (pipeline.length) {
    md += `## Pipeline\n\n`;
    md += `Sequential sub-agent slugs: ${pipeline.map(s => `\`${s}\``).join(' → ')}\n\n`;
  }

  const configKeys = Object.entries(meta)
    .filter(([k]) => !['pipeline','max_iterations','max_slides','master_agent_slug','model_key'].includes(k));
  if (configKeys.length) {
    md += `## Config\n\n`;
    for (const [k, v] of configKeys) md += `- **${k}:** ${JSON.stringify(v)}\n`;
    md += '\n';
  }

  if (profiles.length) {
    md += `## Sub-Agents\n\n`;
    for (const p of profiles) {
      md += `### ${p.display_name} (\`${p.slug}\`)\n\n`;
      if (p.description) md += `${p.description}\n\n`;
      if (p.instructions_markdown) md += `**Instructions:**\n\n${p.instructions_markdown}\n\n`;
      if (p.allowed_tool_globs) md += `**Allowed tools:** ${p.allowed_tool_globs}\n\n`;
      const flags = [];
      if (p.requires_sequential) flags.push('sequential');
      if (p.is_parallelizable) flags.push('parallelizable');
      if (p.can_spawn_subagents) flags.push(`can_spawn: ${p.spawnable_agent_slugs || '[]'}`);
      if (p.run_in_background) flags.push('background');
      if (flags.length) md += `**Flags:** ${flags.join(', ')}\n\n`;
    }
  }

  md += `## Storage\n\nR2 playbook: \`${SKILLS_R2_PREFIX}${skill.id.replace('skill_','')}/SKILL.md\`\n`;
  md += `Vectorize lane: \`AGENTSAM_VECTORIZE_DOCUMENTS\` (source_type=${SOURCE_TYPE})\n`;
  return md;
}

async function writeSkillPlaybookToR2(env, skillKey, markdown) {
  const r2Key = `${SKILLS_R2_PREFIX}${skillKey}/SKILL.md`;
  const bucket = env.AUTORAG_BUCKET ?? env.R2;
  if (!bucket) return { ok: false, r2Key, reason: 'no_bucket' };
  try {
    await bucket.put(r2Key, markdown, { httpMetadata: { contentType: 'text/markdown' } });
    return { ok: true, r2Key };
  } catch (e) {
    return { ok: false, r2Key, reason: e?.message ?? String(e) };
  }
}

async function indexSkillPlaybookToVectorize(env, skillId, skillKey, markdown) {
  const vectorize = env.AGENTSAM_VECTORIZE_DOCUMENTS;
  if (!vectorize) return { ok: false, reason: 'no_vectorize_binding', chunks: 0 };
  const chunks = chunkMarkdown(markdown);
  if (!chunks.length) return { ok: true, chunks: 0 };
  const vectors = [];
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    for (let j = 0; j < batch.length; j++) {
      const chunkIdx = i + j;
      try {
        const embedding = await generateWorkersAiEmbedding(env, batch[j]);
        if (!embedding?.length) continue;
        vectors.push({
          id: `skill-${skillKey}-${chunkIdx}`,
          values: embedding,
          metadata: {
            source_type: SOURCE_TYPE,
            skill_id: skillId,
            skill_key: skillKey,
            source_path: `${SKILLS_R2_PREFIX}${skillKey}/SKILL.md`,
            chunk_index: chunkIdx,
            text: batch[j].slice(0, 500),
          },
        });
      } catch (e) {
        console.warn(`[skill-trigger-cron] embed failed chunk ${chunkIdx} skill=${skillKey}`, e?.message);
      }
    }
  }
  if (!vectors.length) return { ok: true, chunks: 0 };
  try {
    for (let i = 0; i < vectors.length; i += 100) {
      await vectorize.upsert(vectors.slice(i, i + 100));
    }
    return { ok: true, chunks: vectors.length };
  } catch (e) {
    return { ok: false, reason: e?.message ?? String(e), chunks: vectors.length };
  }
}

async function updateSkillFilePath(env, skillId, skillKey) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `UPDATE agentsam_skill
       SET file_path = ?, retrieval_strategy = 'vectorize', updated_at = datetime('now')
       WHERE id = ?`
    ).bind(`${SKILLS_R2_PREFIX}${skillKey}/SKILL.md`, skillId).run();
  } catch (e) {
    console.warn(`[skill-trigger-cron] D1 file_path update failed skill=${skillId}`, e?.message);
  }
}

/**
 * Main export — called from rag-six-am.js via ctx.waitUntil.
 * @param {any} env
 * @returns {Promise<{ skills: number, chunks: number, errors: string[] }>}
 */
export async function runSkillPlaybookSync(env) {
  const tenantId = cronTenantId(env);
  const begun = env?.DB
    ? await startCronRun(env, { jobName: JOB_NAME, cronExpression: CRON_EXPR, tenantId, workspaceId: null })
    : null;
  const runId = begun?.runId ?? null;
  const startedAt = begun?.startedAt ?? Date.now();
  let totalSkills = 0;
  let totalChunks = 0;
  const errors = [];

  try {
    if (!env.DB) throw new Error('no_db');
    const { results: skills } = await env.DB.prepare(
      `SELECT id, name, slash_trigger, description, content_markdown,
              scope, retrieval_strategy, metadata_json
       FROM agentsam_skill WHERE is_active = 1
       ORDER BY sort_order ASC, id ASC`
    ).all();

    if (!skills?.length) {
      if (runId) await completeCronRun(env, runId, startedAt, { rowsRead: 0, rowsWritten: 0, metadata: { skills: 0 } });
      return { skills: 0, chunks: 0, errors: [] };
    }

    const { results: allProfiles } = await env.DB.prepare(
      `SELECT slug, display_name, description, instructions_markdown,
              allowed_tool_globs, requires_sequential, is_parallelizable,
              can_spawn_subagents, spawnable_agent_slugs, run_in_background,
              agent_type, model_reasoning_effort
       FROM agentsam_subagent_profile WHERE is_active = 1
       ORDER BY sort_order ASC, slug ASC`
    ).all();

    const profilesBySlug = {};
    for (const p of (allProfiles || [])) profilesBySlug[p.slug] = p;

    for (const skill of skills) {
      const skillKey = skill.id.replace(/^skill_/, '');
      try {
        const meta = (() => { try { return JSON.parse(skill.metadata_json || '{}'); } catch { return {}; } })();
        const pipeline = Array.isArray(meta.pipeline) ? meta.pipeline : [];
        const orderedProfiles = pipeline.map(slug => profilesBySlug[slug]).filter(Boolean);
        const prefixMatches = (allProfiles || []).filter(
          p => p.slug.startsWith(`${skillKey}_`) && !pipeline.includes(p.slug)
        );
        const profiles = [...orderedProfiles, ...prefixMatches];

        const markdown = buildSkillPlaybook(skill, profiles);

        const r2Result = await writeSkillPlaybookToR2(env, skillKey, markdown);
        if (!r2Result.ok) {
          errors.push(`${skillKey}: R2 write failed — ${r2Result.reason}`);
          continue;
        }

        const vecResult = await indexSkillPlaybookToVectorize(env, skill.id, skillKey, markdown);
        if (!vecResult.ok) errors.push(`${skillKey}: Vectorize failed — ${vecResult.reason}`);

        await updateSkillFilePath(env, skill.id, skillKey);

        totalSkills += 1;
        totalChunks += vecResult.chunks || 0;
        console.log(`[skill-trigger-cron] ${skillKey}: ${vecResult.chunks || 0} chunks indexed`);
      } catch (e) {
        const msg = e?.message ?? String(e);
        errors.push(`${skillKey}: ${msg}`);
        console.warn(`[skill-trigger-cron] ${skillKey} failed`, msg);
      }
    }

    if (runId) await completeCronRun(env, runId, startedAt, {
      rowsRead: skills.length,
      rowsWritten: totalSkills,
      metadata: { skills: totalSkills, chunks: totalChunks, errors: errors.length },
    });
    return { skills: totalSkills, chunks: totalChunks, errors };
  } catch (e) {
    if (runId) await failCronRun(env, runId, startedAt, e);
    console.warn('[skill-trigger-cron] job failed', e?.message ?? e);
    return { skills: 0, chunks: 0, errors: [e?.message ?? String(e)] };
  }
}
