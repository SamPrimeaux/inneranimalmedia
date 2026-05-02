export interface Enrollment {
  enrollment_id: string;
  course_id: string;
  enrollment_type: 'student' | 'instructor';
  enrollment_status: string;
  progress_percent: number;
  started_at: number | null;
  enrollment_meta: string | null;
  title: string;
  slug: string;
  description: string;
  level: string;
  category: string;
  duration_hours: number;
  course_meta: string | null;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description: string;
  order_index: number;
  is_required: number;
  estimated_minutes: number;
}

export interface Lesson {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  type: 'lesson' | 'lab' | 'assignment' | 'milestone';
  description: string;
  estimated_minutes: number;
  order_index: number;
  is_required: number;
}

export interface ProgressRow {
  lesson_id: string;
  module_id: string;
  course_id: string;
  status: 'not_started' | 'in_progress' | 'completed';
  completed_at: number | null;
  time_spent_minutes: number;
  token_spend: number;
}

export interface Assignment {
  id: string;
  course_id: string;
  module_id: string;
  lesson_id: string | null;
  title: string;
  description: string;
  type: string;
  rubric: string; // JSON — parse before use
  max_score: number;
  required_evidence: string; // JSON — parse before use
  due_offset_days: number;
}

export interface Submission {
  id: string;
  assignment_id: string;
  course_id: string;
  status: 'draft' | 'submitted' | 'graded' | 'revision_requested';
  evidence: string; // JSON — parse before use
  submitted_at: number | null;
  time_spent_minutes: number;
  token_spend: number;
}

export interface Grade {
  assignment_id: string;
  score: number;
  max_score: number;
  rubric_scores: string; // JSON — parse before use
  time_score: number;
  efficiency_score: number;
  feedback: string;
  graded_at: number;
  graded_by: string;
}

export interface LearnData {
  enrollments: Enrollment[];
  modules: CourseModule[];
  lessons: Lesson[];
  progress: ProgressRow[];
  assignments: Assignment[];
  submissions: Submission[];
  grades: Grade[];
}

export interface RubricCriterion {
  name: string;
  weight: number;
  max_score: number;
  description: string;
}

export interface EvidenceFields {
  urls: string[];
  notes: string;
  github_commit: string;
}

