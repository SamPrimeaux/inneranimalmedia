import React from 'react';
import { Terminal, CheckCircle, Clock } from 'lucide-react';
import AssignmentPanel from './AssignmentPanel';
import type { LearnData, Lesson } from './learn.types';

interface Props {
  data: LearnData;
  activeCourseId: string;
  activeLessonId: string | null;
  onMarkComplete: (lessonId: string) => void;
  onSubmitAssignment: (assignmentId: string, evidence: object, timeSpent: number) => Promise<any>;
  onOpenTerminal: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  lab: 'LAB',
  lesson: 'LESSON',
  assignment: 'ASSIGNMENT',
  milestone: 'MILESTONE',
};
const TYPE_COLOR: Record<string, string> = {
  lab: 'var(--solar-cyan)',
  lesson: 'var(--text-muted)',
  assignment: 'var(--solar-yellow)',
  milestone: 'var(--solar-red)',
};

export default function LessonView({
  data,
  activeCourseId,
  activeLessonId,
  onMarkComplete,
  onSubmitAssignment,
  onOpenTerminal,
}: Props) {
  const enrollment = data.enrollments.find((e) => e.course_id === activeCourseId);

  if (!activeLessonId) {
    const totalLessons = data.lessons.filter((l) => l.course_id === activeCourseId).length;
    const completedLessons = data.progress.filter((p) => p.course_id === activeCourseId && p.status === 'completed').length;

    const upcomingAssignments = data.assignments
      .filter((a) => a.course_id === activeCourseId)
      .filter((a) => !data.submissions.find((s) => s.assignment_id === a.id));

    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 40,
          gap: 8,
        }}
      >
        <div style={{ color: 'var(--text-main)', fontSize: 18, fontWeight: 500 }}>{enrollment?.title ?? 'Course'}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
          {completedLessons} of {totalLessons} lessons complete
        </div>
        {upcomingAssignments.length > 0 && (
          <div
            style={{
              marginTop: 24,
              padding: '12px 16px',
              background: 'var(--bg-panel)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              width: '100%',
              maxWidth: 420,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-muted)',
                marginBottom: 8,
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              open assignments
            </div>
            {upcomingAssignments.map((a) => (
              <div
                key={a.id}
                style={{
                  fontSize: 12,
                  color: 'var(--solar-yellow)',
                  padding: '3px 0',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                {a.title}
                <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>due day {a.due_offset_days}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 16 }}>select a lesson to begin</div>
      </div>
    );
  }

  const lesson = data.lessons.find((l) => l.id === activeLessonId);
  if (!lesson) return null;

  const prog = data.progress.find((p) => p.lesson_id === activeLessonId && p.course_id === activeCourseId);
  const isCompleted = prog?.status === 'completed';

  if (lesson.type === 'assignment' || lesson.type === 'milestone') {
    const assignment = data.assignments.find(
      (a) => (a.lesson_id === lesson.id || a.module_id === lesson.module_id) && a.course_id === activeCourseId,
    );
    const submission = assignment ? data.submissions.find((s) => s.assignment_id === assignment.id) : undefined;
    const grade = assignment ? data.grades.find((g) => g.assignment_id === assignment.id) : undefined;

    return (
      <div style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
        <LessonHeader lesson={lesson} />
        {assignment && (
          <AssignmentPanel assignment={assignment} submission={submission} grade={grade} onSubmit={onSubmitAssignment} />
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 32, maxWidth: 760 }}>
      <LessonHeader lesson={lesson} />

      <div
        style={{
          fontSize: 14,
          color: 'var(--text-muted)',
          lineHeight: 1.75,
          marginTop: 20,
          whiteSpace: 'pre-wrap',
        }}
      >
        {lesson.description}
      </div>

      {lesson.type === 'lab' && (
        <button
          onClick={onOpenTerminal}
          style={{
            marginTop: 28,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: 'transparent',
            border: '1px solid var(--solar-cyan)',
            borderRadius: 4,
            color: 'var(--solar-cyan)',
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <Terminal size={14} /> open terminal
        </button>
      )}

      <div style={{ marginTop: 32 }}>
        {isCompleted ? (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              color: 'var(--solar-cyan)',
              fontSize: 13,
              fontFamily: 'var(--font-mono)',
            }}
          >
            <CheckCircle size={14} /> completed
            {prog?.time_spent_minutes ? (
              <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>· {prog.time_spent_minutes}m spent</span>
            ) : null}
          </div>
        ) : (
          <button
            onClick={() => onMarkComplete(lesson.id)}
            style={{
              padding: '7px 18px',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
              color: 'var(--text-main)',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--solar-cyan)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--solar-cyan)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-subtle)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-main)';
            }}
          >
            mark complete
          </button>
        )}
      </div>
    </div>
  );
}

function LessonHeader({ lesson }: { lesson: Lesson }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span
          style={{
            fontSize: 10,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.08em',
            color: TYPE_COLOR[lesson.type],
            textTransform: 'uppercase',
          }}
        >
          {TYPE_LABEL[lesson.type] ?? lesson.type}
        </span>
        {lesson.estimated_minutes > 0 && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
            <Clock size={10} /> {lesson.estimated_minutes}m
          </span>
        )}
      </div>
      <h1 style={{ fontSize: 20, fontWeight: 500, color: 'var(--text-main)', margin: 0, lineHeight: 1.3 }}>
        {lesson.title}
      </h1>
    </div>
  );
}

