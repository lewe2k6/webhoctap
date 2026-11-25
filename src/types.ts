export interface Material {
  id: string
  title: string
  kind: 'textbook' | 'lecture' | 'outline' | 'slide' | 'syllabus'
  handle: string
  url: string
  documentId?: string
  pageCount?: number
  variant?: string
  duplicateOf?: string
}

export interface Course {
  id: string
  name: string
  codes: string[]
  language: 'vi' | 'en'
  hasPdf: boolean
  sources: Material[]
}

export interface Catalog {
  courses: Course[]
}

export interface Topic {
  id: string
  title: string
}

export interface Source {
  documentId: string
  sourceId?: string
  page: number
  url?: string
  label?: string
}

export interface Question {
  id: string
  type: 'mcq' | 'essay'
  topicId: string
  prompt: string
  options: string[]
  answer: number | null
  explanation: string
  rubric: string[]
  source: Source
}

export interface Pack {
  courseId: string
  topics: Topic[]
  questions: Question[]
}

export type Mode = 'practice' | 'exam'
export type Answers = Record<string, number | string>

export interface Score {
  correct: number
  total: number
}

export interface AttemptData {
  status: 'draft' | 'submitted'
  mode: Mode
  questionIds: string[]
  answers: Answers
  position: number
  startedAt: number
  deadlineAt?: number
  submittedAt?: number
  score?: Score
}

export interface AttemptRow {
  id: string
  user_id: string
  course_id: string
  revision: number
  data: AttemptData
  updated_at: string
}

export interface SavedAttempt extends AttemptRow {
  pending: boolean
}

export interface Feedback {
  summary: string
  strengths: string[]
  improvements: string[]
}

export interface SignedPdf {
  url: string
  expiresAt: string
}

export type SaveResponse = { applied: boolean; attempt: AttemptRow }
