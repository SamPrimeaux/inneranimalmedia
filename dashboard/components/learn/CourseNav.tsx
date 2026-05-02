import React, { useState } from 'react';
import {
  CheckCircle,
  Circle,
  Dot,
  ChevronDown,
  ChevronRight,
  Terminal,
  FileText,
  Flag,
} from 'lucide-react';
import ProgressRing from './ProgressRing';
import type { LearnData, ProgressRow } from './learn.types';

interface Props {
  data: LearnData;
  activeCourseId: string;
  activeLessonId: string | null;
  onSelectCourse: (id: string) => void;
  onSelectLesson: (id: string) => void;
}

const TYPE_ICONS: Record<string, React.FC<any>> = {
  lab: Terminal,
  lesson: FileText,
  assignment: Flag,
  milestone: Flag,
};

const TYPE_COLORS: Record<string, string> = {
  lab: 'var(--solar-cyan)',
  lesson: 'var(--text-muted)',
  assignment: 'var(--solar-yellow)',
  milestone: 'var(--solar-red)',
};

function statusIcon(status: ProgressRow['status']) {
  if (status === 'completed') return <CheckCircle size={14} style={{ color: 'var(--solar-cyan)', flexShrink: 0 }} />;
  if (status === 'in_progress') return <Dot size={16} style={{ color: 'var(--solar-yellow)', flexShrink: 0 }} />;
  return <Circle size={14} style={{ color: 'var(--border-subtle)', flexShrink: 0 }} />;
}

export default function CourseNav({
  data,
  activeCourseId,
  activeLessonId,
  onSelectCourse,
  onSelectLesson,
}: Props) {
  const [expandedModules, setExpandedModules] = useState<Set<string>>(() => new Set(data.modules.map((m) => m.id)));

  const enrollment = data.enrollments.find((e) => e.course_id === activeCourseId)!;
  const modules = data.modules
    .filter((m) => m.course_id === activeCourseId)
    .sort((a, b) => a.order_index - b.order_index);

  const progressMap = new Map(
    data.progress
      .filter((p) => p.course_id === activeCourseId)
      .map((p) => [p.lesson_id, p] as const),
  );

  const toggleModule = (id: string) =>
    setExpandedModules((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const lessonsForModule = (moduleId: string) =>
    data.lessons
      .filter((l) => l.module_id === moduleId && l.course_id === activeCourseId)
      .sort((a, b) => a.order_index - b.order_index);

  const moduleProgress = (moduleId: string) => {
    const lessons = lessonsForModule(moduleId);
    const completed = lessons.filter((l) => progressMap.get(l.id)?.status === 'completed').length;
    return { completed, total: lessons.length };
  };

  return (
    <div
      style={{
        width: 272,
        flexShrink: 0,
        background: 'var(--bg-panel)',
        borderRight: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
        {data.enrollments.length > 1 && (
          <select
            value={activeCourseId}
            onChange={(e) => onSelectCourse(e.target.value)}
            style={{
              width: '100%',
              marginBottom: 12,
              padding: '4px 8px',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-main)',
              fontSize: 12,
              borderRadius: 4,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {data.enrollments.map((e) => (
              <option key={e.course_id} value={e.course_id}>
                {e.title}
              </option>
            ))}
          </select>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ProgressRing percent={enrollment.progress_percent ?? 0} size={40} strokeWidth={3} />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                color: 'var(--text-main)',
                fontSize: 13,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {enrollment.title}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 1 }}>
              {enrollment.level} · {enrollment.duration_hours}h
            </div>
          </div>
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '8px 0' }}>
        {modules.map((mod) => {
          const { completed, total } = moduleProgress(mod.id);
          const expanded = expandedModules.has(mod.id);
          const lessons = lessonsForModule(mod.id);

          return (
            <div key={mod.id}>
              <button
                onClick={() => toggleModule(mod.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  textAlign: 'left',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                {expanded ? (
                  <ChevronDown size={12} style={{ flexShrink: 0 }} />
                ) : (
                  <ChevronRight size={12} style={{ flexShrink: 0 }} />
                )}
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {mod.title}
                </span>
                <span style={{ fontSize: 10, opacity: 0.6, flexShrink: 0 }}>
                  {completed}/{total}
                </span>
              </button>

              {expanded &&
                lessons.map((lesson) => {
                  const prog = progressMap.get(lesson.id);
                  const status = prog?.status ?? 'not_started';
                  const isActive = lesson.id === activeLessonId;
                  const TypeIcon = TYPE_ICONS[lesson.type] ?? FileText;

                  return (
                    <button
                      key={lesson.id}
                      onClick={() => onSelectLesson(lesson.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '5px 12px 5px 20px',
                        background: isActive ? 'var(--bg-hover)' : 'none',
                        borderLeft: isActive ? '2px solid var(--solar-cyan)' : '2px solid transparent',
                        border: 'none',
                        borderRadius: 0,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {statusIcon(status)}
                      <span
                        style={{
                          flex: 1,
                          fontSize: 12,
                          color: status === 'completed' ? 'var(--text-muted)' : 'var(--text-main)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {lesson.title}
                      </span>
                      <TypeIcon size={11} style={{ color: TYPE_COLORS[lesson.type], flexShrink: 0 }} />
                      {lesson.estimated_minutes > 0 && (
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', flexShrink: 0 }}>
                          {lesson.estimated_minutes}m
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

