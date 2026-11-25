import type { ReactNode } from 'react'
import { courseLink } from './navigation'
import { answeredCount, formatDate } from './study'
import type { Course, SavedAttempt } from './types'

export function Brand({ to }: { to?: string }) {
  const content = (
    <>
      <span className="brand-symbol" aria-hidden="true">T<span>.</span></span>
      <span>Học Kinh tế<span className="brand-university"> TMU</span></span>
    </>
  )
  return to
    ? <a className="brand" href={to}>{content}</a>
    : <div className="brand">{content}</div>
}

export function Empty({ title, details, children }: { title: string; details?: string; children?: ReactNode }) {
  return (
    <section className="empty card">
      <h2>{title}</h2>
      {details && <p>{details}</p>}
      {children}
    </section>
  )
}

export function Loading({ label = 'Đang tải…' }: { label?: string }) {
  return <p className="loading" role="status"><span className="spinner" aria-hidden="true" />{label}</p>
}

export function Breadcrumb({ course, page }: { course?: Course; page: string }) {
  return (
    <nav aria-label="Đường dẫn" className="breadcrumb">
      <a href="#/thu-vien">Thư viện</a>
      <span aria-hidden="true">/</span>
      {course && <>
        <a href={courseLink(course.id)}>{course.name}</a><span aria-hidden="true">/</span>
      </>}
      <span>{page}</span>
    </nav>
  )
}

export function AttemptSummary({ attempt }: { attempt: SavedAttempt }) {
  const { data } = attempt
  return (
    <>
      <span>{data.mode === 'exam' ? 'Thi thử' : 'Bài luyện'}</span>
      <span aria-hidden="true">·</span>
      <span>{formatDate(data.submittedAt ?? data.startedAt)}</span>
      <span aria-hidden="true">·</span>
      <span>{data.score?.total
        ? `${data.score.correct}/${data.score.total} câu đúng`
        : `${answeredCount(data)}/${data.questionIds.length} câu đã làm`}</span>
    </>
  )
}

export function SourceAnchor({ url, children, className }: { url: string; children: ReactNode; className?: string }) {
  if (!/^https:\/\//i.test(url)) return <>{children}</>
  return <a className={className} href={url} target="_blank" rel="noopener noreferrer">{children}</a>
}
