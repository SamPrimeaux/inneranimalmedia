import React, { useState, useEffect, useRef, useCallback } from 'react';
import CourseNav from './learn/CourseNav';
import LessonView from './learn/LessonView';
import type { LearnData } from './learn/learn.types';

const openGlobalTerminal = () => window.dispatchEvent(new CustomEvent('iam:open-terminal'));

export default function LearnPage() {
  const [data, setData] = useState<LearnData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);

  const lessonStartRef = useRef<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch('/api/learn/dashboard', { credentials: 'same-origin' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: { ok: boolean } & LearnData) => {
        setData(d);
        if (d.enrollments?.length > 0 && !activeCourseId) {
          setActiveCourseId(d.enrollments[0].course_id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [activeCourseId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelectLesson = useCallback(
    async (lessonId: string) => {
      if (activeLessonId && lessonStartRef.current && activeCourseId) {
        const elapsed = Math.round((Date.now() - lessonStartRef.current) / 60000);
        if (elapsed > 0) {
          fetch('/api/learn/progress', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lesson_id: activeLessonId,
              course_id: activeCourseId,
              status: 'in_progress',
              time_spent_minutes: elapsed,
            }),
          }).catch(console.error);
        }
      }

      lessonStartRef.current = Date.now();
      setActiveLessonId(lessonId);

      if (activeCourseId && data) {
        const prog = data.progress.find((p) => p.lesson_id === lessonId && p.course_id === activeCourseId);
        if (prog?.status === 'not_started') {
          const updated = await fetch('/api/learn/progress', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lesson_id: lessonId,
              course_id: activeCourseId,
              status: 'in_progress',
            }),
          })
            .then((r) => r.json())
            .catch(() => null);

          if (updated?.ok) {
            setData((prev) =>
              prev
                ? {
                    ...prev,
                    progress: prev.progress.map((p) =>
                      p.lesson_id === lessonId && p.course_id === activeCourseId ? { ...p, status: 'in_progress' } : p,
                    ),
                  }
                : prev,
            );
          }
        }
      }
    },
    [activeLessonId, activeCourseId, data],
  );

  const handleMarkComplete = useCallback(
    async (lessonId: string) => {
      if (!activeCourseId) return;
      const elapsed = lessonStartRef.current ? Math.round((Date.now() - lessonStartRef.current) / 60000) : 0;
      lessonStartRef.current = null;

      const result = await fetch('/api/learn/progress', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lesson_id: lessonId,
          course_id: activeCourseId,
          status: 'completed',
          time_spent_minutes: elapsed,
        }),
      })
        .then((r) => r.json())
        .catch(() => null);

      if (result?.ok) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            progress: prev.progress.map((p) =>
              p.lesson_id === lessonId && p.course_id === activeCourseId
                ? { ...p, status: 'completed', completed_at: Date.now() / 1000 }
                : p,
            ),
            enrollments: prev.enrollments.map((e) =>
              e.course_id === activeCourseId ? { ...e, progress_percent: result.progress_percent } : e,
            ),
          };
        });
      }
    },
    [activeCourseId],
  );

  const handleSubmitAssignment = useCallback(
    async (assignmentId: string, evidence: object, timeSpentMinutes: number) => {
      if (!activeCourseId) return null;
      const result = await fetch('/api/learn/submit', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assignment_id: assignmentId,
          course_id: activeCourseId,
          evidence,
          time_spent_minutes: timeSpentMinutes,
        }),
      })
        .then((r) => r.json())
        .catch(() => null);

      if (result?.ok) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                submissions: [
                  ...prev.submissions,
                  {
                    id: result.submission_id,
                    assignment_id: assignmentId,
                    course_id: activeCourseId,
                    status: 'submitted',
                    evidence: JSON.stringify(evidence),
                    submitted_at: Date.now() / 1000,
                    time_spent_minutes: timeSpentMinutes,
                    token_spend: 0,
                  },
                ],
              }
            : prev,
        );
      }
      return result;
    },
    [activeCourseId],
  );

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>loading courses...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center', color: 'var(--solar-red)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <div>failed to load</div>
          <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>{error}</div>
          <button
            onClick={load}
            style={{
              marginTop: 12,
              padding: '4px 12px',
              fontSize: 12,
              color: 'var(--text-main)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            retry
          </button>
        </div>
      </div>
    );
  }

  if (!data || data.enrollments.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center" style={{ background: 'var(--bg-app)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>no courses enrolled</div>
        </div>
      </div>
    );
  }

  const activeEnrollment = data.enrollments.find((e) => e.course_id === activeCourseId) ?? data.enrollments[0];

  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: 'var(--bg-app)' }}>
      <CourseNav
        data={data}
        activeCourseId={activeCourseId ?? activeEnrollment.course_id}
        activeLessonId={activeLessonId}
        onSelectCourse={(id) => {
          setActiveCourseId(id);
          setActiveLessonId(null);
        }}
        onSelectLesson={handleSelectLesson}
      />
      <LessonView
        data={data}
        activeCourseId={activeCourseId ?? activeEnrollment.course_id}
        activeLessonId={activeLessonId}
        onMarkComplete={handleMarkComplete}
        onSubmitAssignment={handleSubmitAssignment}
        onOpenTerminal={openGlobalTerminal}
      />
    </div>
  );
}

