export type LessonType = 'lesson' | 'lab' | 'assignment' | 'milestone';
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';
export type SubmissionStatus = 'draft' | 'submitted' | 'graded' | 'revision_requested';

export interface LearnDashboardResponse {
  ok: boolean;
  courses: Course[];
}

export interface Course {
  id: string;
  org_id: string | null;
  title: string;
  slug: string;
  description: string;
  long_description: string;
  thumbnail_url: string | null;
  category: string | null;
  level: string;
  duration_hours: number | null;
  status: string | null;
  instructor_id: string | null;
  metadata: Record<string, any>;
  enrollment: CourseEnrollment | null;
  progress_summary: CourseProgressSummary;
  modules: CourseModule[];
  assignments: AssignmentWithState[];
  exports: CourseExport[];
  submissions: Submission[];
  grades: Grade[];
}

export interface CourseEnrollment {
  id: string;
  status: string;
  enrollment_type: string;
  progress_percent: number;
  started_at: number | null;
  metadata: Record<string, any>;
}

export interface CourseProgressSummary {
  total_lessons: number;
  completed_lessons: number;
  progress_percent: number;
}

export interface CourseModule {
  id: string;
  course_id: string;
  title: string;
  description: string;
  order_index: number;
  is_required: number;
  estimated_minutes: number;
  lessons: Lesson[];
  assignments: AssignmentWithState[];
}

export interface LessonProgress {
  status: ProgressStatus;
  completed_at: number | null;
  time_spent_minutes: number;
  token_spend: number;
}

export interface Lesson {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  type: LessonType;
  description: string;
  estimated_minutes: number;
  order_index: number;
  is_required: number;
  content: string | null;
  content_format: string;
  has_content: number;
  sandbox_query: string | null;
  sandbox_db: string;
  progress: LessonProgress;
  assignments: AssignmentWithState[];
}

export interface Assignment {
  id: string;
  course_id: string;
  module_id: string;
  lesson_id: string | null;
  title: string;
  description: string;
  type: string;
  rubric: string;
  max_score: number;
  required_evidence: string;
  due_offset_days: number | null;
  is_graded?: number;
}

export interface Submission {
  id: string;
  assignment_id: string;
  enrollment_id: string;
  user_id: string;
  course_id: string;
  status: SubmissionStatus;
  evidence: string | null;
  submitted_at: number | null;
  time_spent_minutes: number | null;
  token_spend: number | null;
  created_at?: number;
  updated_at?: number;
}

export interface Grade {
  id: string;
  submission_id: string;
  assignment_id: string;
  user_id: string;
  enrollment_id: string;
  score: number | null;
  max_score: number | null;
  rubric_scores: string | null;
  time_score: number | null;
  efficiency_score: number | null;
  graded_by: string | null;
  feedback: string | null;
  graded_at: number | null;
}

export interface CourseExport {
  id: string;
  course_id: string;
  export_type: string;
  file_url: string | null;
  r2_key: string | null;
  r2_bucket: string | null;
  file_size: number | null;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: number;
}

export interface AssignmentWithState extends Assignment {
  submission: Submission | null;
  grade: Grade | null;
}

export interface EvidenceFields {
  urls: string[];
  notes: string;
  github_commit: string;
}

// Rubric (supports multiple schemas; UI should be defensive)
export interface RubricCriterion {
  name?: string;
  label?: string;
  weight?: number;
  max_score?: number;
  description?: string;
}

export interface RubricSchema {
  scale?: { min?: number; max?: number; step?: number };
  pass_score?: number;
  distinction_score?: number;
  criteria?: RubricCriterion[];
}

