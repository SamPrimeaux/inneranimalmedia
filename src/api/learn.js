/**
 * Learn API
 * Handles /api/learn/* — course dashboard, progress tracking, assignment submission.
 * All routes are auth-gated. All queries are scoped to authUser.id.
 * Zero cross-tenant data exposure.
 */
import {
  getAuthUser,
  jsonResponse,
  authUserIsSuperadmin,
  fetchAuthUserTenantId,
} from '../core/auth.js';

/**
 * User ids to match LMS enrollments / progress. Superadmins may have rows keyed by `auth_users.id`
 * (e.g. `au_*`) while the session uses `users.id` (`usr_*`) — include tenant superadmin auth ids.
 */
async function learnEnrollmentUserIds(env, authUser) {
  const ids = new Set();
  const primary = String(authUser?.id || '').trim();
  if (primary) ids.add(primary);
  let tenantId =
    authUser?.tenant_id != null && String(authUser.tenant_id).trim() !== ''
      ? String(authUser.tenant_id).trim()
      : null;
  if (authUserIsSuperadmin(authUser) && !tenantId && env?.DB) {
    tenantId = (await fetchAuthUserTenantId(env, primary)) || null;
    if (!tenantId && authUser.email) {
      tenantId = (await fetchAuthUserTenantId(env, authUser.email)) || null;
    }
  }
  if (authUserIsSuperadmin(authUser) && tenantId && env.DB) {
    try {
      const { results } = await env.DB
        .prepare(
          `SELECT id FROM auth_users WHERE tenant_id = ? AND COALESCE(is_superadmin, 0) = 1`,
        )
        .bind(tenantId)
        .all();
      for (const r of results || []) {
        if (r?.id) ids.add(String(r.id).trim());
      }
    } catch (_) {
      /* ignore */
    }
  }
  return [...ids];
}

export async function handleLearnApi(request, url, env) {
  const authUser = await getAuthUser(request, env);
  if (!authUser?.id) return jsonResponse({ error: 'Unauthorized' }, 401);

  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path === '/api/learn/dashboard' && method === 'GET')
    return handleLearnDashboard(request, env, authUser);
  if (path === '/api/learn/progress' && method === 'POST')
    return handleLearnProgress(request, env, authUser);
  if (path === '/api/learn/submit' && method === 'POST')
    return handleLearnSubmit(request, env, authUser);

  return jsonResponse({ error: 'Not found' }, 404);
}

// ---------------------------------------------------------------------------
// GET /api/learn/dashboard
// Returns everything LearnPage needs in a single response.
// ---------------------------------------------------------------------------
async function handleLearnDashboard(_request, env, authUser) {
  if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 500);
  const uidScope = await learnEnrollmentUserIds(env, authUser);
  if (!uidScope.length) {
    return jsonResponse({
      ok: true,
      enrollments: [],
      courses: [],
      modules: [],
      lessons: [],
      progress: [],
      assignments: [],
      submissions: [],
      grades: [],
    });
  }
  const uidPh = uidScope.map(() => '?').join(',');

  // 1. Enrolled courses
  const enrollmentRows = await env.DB.prepare(`
    SELECT
      e.id            AS enrollment_id,
      e.course_id,
      e.enrollment_type,
      e.status        AS enrollment_status,
      e.progress_percent,
      e.started_at,
      e.metadata      AS enrollment_meta,
      c.title,
      c.slug,
      c.description,
      c.level,
      c.category,
      c.duration_hours,
      c.metadata      AS course_meta
    FROM enrollments e
    JOIN courses c ON e.course_id = c.id
    WHERE e.user_id IN (${uidPh}) AND e.status = 'active'
    ORDER BY e.created_at ASC
  `).bind(...uidScope).all();

  const enrollments = enrollmentRows.results ?? [];
  if (enrollments.length === 0) {
    return jsonResponse({
      ok: true,
      enrollments: [],
      courses: [],
      modules: [],
      lessons: [],
      progress: [],
      assignments: [],
      submissions: [],
      grades: [],
    });
  }

  // Collect course IDs for subsequent queries
  // D1 doesn't support array bindings — build parameterised placeholders
  const courseIds = [...new Set(enrollments.map((e) => e.course_id))];
  const ph = courseIds.map(() => '?').join(',');

  // 2–7: batch remaining queries
  const [modRows, lesRows, progRows, asgRows, subRows, gradeRows] =
    await Promise.all([
      env.DB.prepare(`
        SELECT id, course_id, title, description,
               order_index, is_required, estimated_minutes
        FROM course_modules
        WHERE course_id IN (${ph})
        ORDER BY course_id, order_index ASC
      `).bind(...courseIds).all(),

      env.DB.prepare(`
        SELECT id, module_id, course_id, title, type,
               description, estimated_minutes, order_index, is_required
        FROM course_lessons
        WHERE course_id IN (${ph})
        ORDER BY course_id, order_index ASC
      `).bind(...courseIds).all(),

      env.DB.prepare(`
        SELECT lesson_id, module_id, course_id, status,
               completed_at, time_spent_minutes, token_spend
        FROM course_progress
        WHERE user_id IN (${uidPh}) AND course_id IN (${ph})
      `).bind(...uidScope, ...courseIds).all(),

      env.DB.prepare(`
        SELECT id, course_id, module_id, lesson_id, title, description,
               type, rubric, max_score, required_evidence, due_offset_days
        FROM course_assignments
        WHERE course_id IN (${ph})
      `).bind(...courseIds).all(),

      env.DB.prepare(`
        SELECT id, assignment_id, course_id, status, evidence,
               submitted_at, time_spent_minutes, token_spend
        FROM course_submissions
        WHERE user_id IN (${uidPh}) AND course_id IN (${ph})
      `).bind(...uidScope, ...courseIds).all(),

      env.DB.prepare(`
        SELECT g.assignment_id, g.score, g.max_score, g.rubric_scores,
               g.time_score, g.efficiency_score, g.feedback,
               g.graded_at, g.graded_by
        FROM course_grades g
        WHERE g.user_id IN (${uidPh})
      `).bind(...uidScope).all(),
    ]);

  return jsonResponse({
    ok: true,
    enrollments,
    modules: modRows.results ?? [],
    lessons: lesRows.results ?? [],
    progress: progRows.results ?? [],
    assignments: asgRows.results ?? [],
    submissions: subRows.results ?? [],
    grades: gradeRows.results ?? [],
  });
}

// ---------------------------------------------------------------------------
// POST /api/learn/progress
// Body: { lesson_id, course_id, status, time_spent_minutes?, token_spend? }
// ---------------------------------------------------------------------------
async function handleLearnProgress(request, env, authUser) {
  if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 500);
  const uidScope = await learnEnrollmentUserIds(env, authUser);
  if (!uidScope.length) return jsonResponse({ error: 'Unauthorized' }, 401);
  const uidPh = uidScope.map(() => '?').join(',');

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { lesson_id, course_id, status } = body || {};
  if (!lesson_id || !course_id || !status)
    return jsonResponse({ error: 'lesson_id, course_id, status required' }, 400);

  const validStatuses = ['not_started', 'in_progress', 'completed'];
  if (!validStatuses.includes(status))
    return jsonResponse({ error: 'Invalid status' }, 400);

  const timeSpent = Number(body.time_spent_minutes) || 0;
  const tokenSpend = Number(body.token_spend) || 0;

  // Verify the user owns a progress row for this lesson (security check)
  const existing = await env.DB.prepare(`
    SELECT id FROM course_progress
    WHERE user_id IN (${uidPh}) AND lesson_id = ? AND course_id = ?
    LIMIT 1
  `).bind(...uidScope, lesson_id, course_id).first();

  if (!existing)
    return jsonResponse({ error: 'Progress row not found' }, 404);

  await env.DB.prepare(`
    UPDATE course_progress
    SET
      status             = ?,
      time_spent_minutes = time_spent_minutes + ?,
      token_spend        = token_spend + ?,
      completed_at       = CASE WHEN ? = 'completed' THEN unixepoch() ELSE completed_at END,
      updated_at         = unixepoch()
    WHERE user_id IN (${uidPh}) AND lesson_id = ? AND course_id = ?
  `).bind(status, timeSpent, tokenSpend, status, ...uidScope, lesson_id, course_id).run();

  // Recalculate enrollment progress_percent
  const [completedRow, totalRow] = await Promise.all([
    env.DB.prepare(`
      SELECT COUNT(*) AS n FROM course_progress
      WHERE user_id IN (${uidPh}) AND course_id = ? AND status = 'completed'
    `).bind(...uidScope, course_id).first(),
    env.DB.prepare(`
      SELECT COUNT(*) AS n FROM course_progress
      WHERE user_id IN (${uidPh}) AND course_id = ?
    `).bind(...uidScope, course_id).first(),
  ]);

  const completed = completedRow?.n ?? 0;
  const total = totalRow?.n ?? 1;
  const newPercent = Math.round((completed / total) * 100 * 10) / 10;

  await env.DB.prepare(`
    UPDATE enrollments
    SET progress_percent = ?, updated_at = unixepoch()
    WHERE user_id IN (${uidPh}) AND course_id = ?
  `).bind(newPercent, ...uidScope, course_id).run();

  return jsonResponse({ ok: true, progress_percent: newPercent });
}

// ---------------------------------------------------------------------------
// POST /api/learn/submit
// Body: { assignment_id, course_id, evidence: {urls,notes,github_commit}, time_spent_minutes?, token_spend? }
// ---------------------------------------------------------------------------
async function handleLearnSubmit(request, env, authUser) {
  if (!env.DB) return jsonResponse({ error: 'DB unavailable' }, 500);
  const uidScope = await learnEnrollmentUserIds(env, authUser);
  if (!uidScope.length) return jsonResponse({ error: 'Unauthorized' }, 401);
  const uidPh = uidScope.map(() => '?').join(',');

  let body;
  try { body = await request.json(); }
  catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { assignment_id, course_id, evidence } = body || {};
  if (!assignment_id || !course_id || !evidence)
    return jsonResponse({ error: 'assignment_id, course_id, evidence required' }, 400);

  // Verify user is enrolled in this course
  const enrollment = await env.DB.prepare(`
    SELECT id, user_id FROM enrollments
    WHERE user_id IN (${uidPh}) AND course_id = ? AND status = 'active'
    LIMIT 1
  `).bind(...uidScope, course_id).first();

  if (!enrollment)
    return jsonResponse({ error: 'Not enrolled in this course' }, 403);

  const submissionUserId = String(enrollment.user_id || authUser.id || '').trim();

  // Verify assignment belongs to this course
  const assignment = await env.DB.prepare(`
    SELECT id FROM course_assignments WHERE id = ? AND course_id = ? LIMIT 1
  `).bind(assignment_id, course_id).first();

  if (!assignment)
    return jsonResponse({ error: 'Assignment not found' }, 404);

  // Check for existing submission
  const existing = await env.DB.prepare(`
    SELECT id, status FROM course_submissions
    WHERE user_id IN (${uidPh}) AND assignment_id = ? LIMIT 1
  `).bind(...uidScope, assignment_id).first();

  if (existing?.status === 'graded')
    return jsonResponse({ error: 'Already graded — cannot resubmit' }, 409);

  const evidenceJson = typeof evidence === 'string'
    ? evidence
    : JSON.stringify(evidence);

  const timeSpent = Number(body.time_spent_minutes) || 0;
  const tokenSpend = Number(body.token_spend) || 0;

  let submissionId;

  if (existing) {
    // Update draft → submitted
    await env.DB.prepare(`
      UPDATE course_submissions
      SET status = 'submitted', evidence = ?, submitted_at = unixepoch(),
          time_spent_minutes = ?, token_spend = ?, updated_at = unixepoch()
      WHERE id = ?
    `).bind(evidenceJson, timeSpent, tokenSpend, existing.id).run();
    submissionId = existing.id;
  } else {
    submissionId = 'sub_' + Array.from(
      crypto.getRandomValues(new Uint8Array(8)),
      (b) => b.toString(16).padStart(2, '0')
    ).join('');

    await env.DB.prepare(`
      INSERT INTO course_submissions
        (id, assignment_id, enrollment_id, user_id, course_id, status,
         evidence, submitted_at, time_spent_minutes, token_spend,
         created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'submitted', ?, unixepoch(), ?, ?, unixepoch(), unixepoch())
    `).bind(
      submissionId, assignment_id, enrollment.id,
      submissionUserId, course_id, evidenceJson, timeSpent, tokenSpend
    ).run();
  }

  return jsonResponse({ ok: true, submission_id: submissionId });
}

