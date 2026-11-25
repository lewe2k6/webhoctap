import type { AttemptData, Course, Mode, Pack, Question, Score } from './types'

export const EXAM_MS = 30 * 60 * 1000
export const OPTIONS = ['A', 'B', 'C', 'D']

export function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('vi')
    .replaceAll('đ', 'd')
    .trim()
}

export function courseMatches(course: Course, query: string) {
  const searchable = normalize([
    course.name, ...course.codes, ...course.sources.map((source) => source.title),
  ].join(' '))
  return normalize(query).split(/\s+/).every((token) => searchable.includes(token))
}

function shuffled(questions: Question[]) {
  const result = [...questions]
  for (let index = result.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    const current = result[index]
    result[index] = result[other]
    result[other] = current
  }
  return result
}

export function availableExam(pack: Pack) {
  return pack.questions.filter((question) => question.type === 'mcq').length >= 10
    && pack.questions.filter((question) => question.type === 'essay').length >= 2
}

export function createAttempt(pack: Pack, mode: Mode, topic?: string, type?: Question['type']): AttemptData | null {
  const startedAt = Date.now()
  const questions = mode === 'exam'
    ? [
        ...shuffled(pack.questions.filter((question) => question.type === 'mcq')).slice(0, 10),
        ...shuffled(pack.questions.filter((question) => question.type === 'essay')).slice(0, 2),
      ]
    : pack.questions.filter((question) => (!topic || question.topicId === topic) && (!type || question.type === type))
  if (questions.length === 0 || (mode === 'exam' && !availableExam(pack))) return null

  return {
    status: 'draft',
    mode,
    questionIds: questions.map((question) => question.id),
    answers: {},
    position: 0,
    startedAt,
    ...(mode === 'exam' ? { deadlineAt: startedAt + EXAM_MS } : {}),
  }
}

export function getScore(data: AttemptData, questions: Question[]): Score {
  const selected = new Set(data.questionIds)
  const mcqs = questions.filter((question) => selected.has(question.id) && question.type === 'mcq')
  return {
    total: mcqs.length,
    correct: mcqs.filter((question) => data.answers[question.id] === question.answer).length,
  }
}

export function submitAttempt(data: AttemptData, questions: Question[]): AttemptData {
  return {
    ...data,
    status: 'submitted',
    score: getScore(data, questions),
    submittedAt: Date.now(),
  }
}

export function answeredCount(data: AttemptData) {
  return data.questionIds.filter((id) => {
    const answer = data.answers[id]
    return typeof answer === 'number' || (typeof answer === 'string' && answer.trim().length > 0)
  }).length
}

export function formatDuration(seconds: number) {
  return [Math.floor(seconds / 60), seconds % 60]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':')
}

export function formatDate(value: number | string) {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}
