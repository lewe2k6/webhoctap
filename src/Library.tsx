import { useMemo, useState } from 'react'
import { attemptLink, courseLink, pdfLink } from './navigation'
import { courseMatches } from './study'
import type { Course, Material, SavedAttempt } from './types'
import { AttemptSummary, Empty, SourceAnchor } from './ui'

const materialKinds: Record<Material['kind'], string> = {
  textbook: 'Giáo trình',
  lecture: 'Bài giảng',
  outline: 'Đề cương bài giảng',
  slide: 'Slide',
  syllabus: 'Đề cương học phần',
}

function CourseCard({ course, downloaded }: { course: Course; downloaded: boolean }) {
  const materials = new Set(course.sources.map((source) => source.documentId || source.id)).size
  return (
    <a className="course-card card" href={courseLink(course.id)}>
      <span className="course-card-top">
        <span className={`subject-code ${course.language === 'en' ? 'subject-code-english' : ''}`}>
          {course.codes[0] || (course.language === 'en' ? 'TIẾNG ANH' : 'KINH TẾ')}
        </span>
        <span className="course-card-arrow" aria-hidden="true">↗</span>
      </span>
      <h2>{course.name}</h2>
      <span className="course-card-meta">
        <span>{materials} tài liệu</span>
        <span aria-hidden="true">·</span>
        <span>{downloaded ? 'Có thể học offline' : course.hasPdf ? 'Có bài luyện' : 'Nguồn TMU'}</span>
      </span>
    </a>
  )
}

export function Dashboard({
  courses, attempts, downloaded,
}: {
  courses: Course[]
  attempts: SavedAttempt[]
  downloaded: Set<string>
}) {
  const draft = attempts.find((attempt) => attempt.data.status === 'draft')
  const draftCourse = courses.find((course) => course.id === draft?.course_id)
  const completed = attempts.filter((attempt) => attempt.data.status === 'submitted')
  const latest = [...new Set(
    attempts.slice(0, 12).map((attempt) => attempt.course_id),
  )].map((id) => courses.find((course) => course.id === id)).filter((course) => course !== undefined)
  const featured = latest.length > 0
    ? latest.slice(0, 3)
    : ['miec0111', 'maec0111', 'miec1211']
        .map((id) => courses.find((course) => course.id === id)).filter((course) => course !== undefined)
  const displayCourses = featured.length > 0 ? featured : courses.slice(0, 3)

  return (
    <main className="page dashboard" id="noi-dung">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Ngành Kinh tế · TMU</p>
          <h1>Hôm nay học gì?</h1>
          <p>Mở một học phần, xem lại tài liệu và luyện bài theo chủ đề.</p>
          <a className="button primary" href="#/thu-vien">Mở thư viện <span aria-hidden="true">→</span></a>
        </div>
        <div className="hero-counts" aria-label="Thống kê">
          <div><strong>{courses.length}</strong><span>Học phần</span></div>
          <div><strong>{completed.length}</strong><span>Bài đã nộp</span></div>
          <div><strong>{downloaded.size}</strong><span>Môn đã tải</span></div>
        </div>
      </section>
      {draft && draftCourse && (
        <section className="resume card">
          <div>
            <p className="eyebrow">Đang học</p>
            <h2>{draftCourse.name}</h2>
            <div className="meta-line"><AttemptSummary attempt={draft} /></div>
          </div>
          <a className="button secondary" href={attemptLink(draft.id)}>Tiếp tục <span aria-hidden="true">→</span></a>
        </section>
      )}
      <section className="dashboard-courses">
        <div className="section-heading">
          <h2>{latest.length > 0 ? 'Học gần đây' : 'Bắt đầu từ một học phần'}</h2>
          <a href="#/thu-vien">Xem thư viện <span aria-hidden="true">→</span></a>
        </div>
        <div className="course-grid">{displayCourses.map((course) =>
          <CourseCard key={course.id} course={course} downloaded={downloaded.has(course.id)} />)}</div>
      </section>
    </main>
  )
}

export function Library({ courses, downloaded }: { courses: Course[]; downloaded: Set<string> }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'practice' | 'offline'>('all')
  const results = useMemo(() => courses.filter((course) => courseMatches(course, query)
    && (filter === 'all' || (filter === 'practice' ? course.hasPdf : downloaded.has(course.id)))),
  [courses, downloaded, filter, query])

  return (
    <main className="page" id="noi-dung">
      <header className="page-header">
        <p className="eyebrow">Học liệu TMU</p>
        <h1>Thư viện học phần</h1>
        <p>Tìm theo tên môn, mã học phần hoặc tên tài liệu.</p>
      </header>
      <div className="library-tools">
        <label className="search-field">
          <span className="search-glyph" aria-hidden="true" />
          <span className="visually-hidden">Tìm học phần</span>
          <input type="search" placeholder="Ví dụ Kinh tế vi mô hoặc MIEC0111" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <div className="filter-row" aria-label="Lọc học phần">
          <button className="filter" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tất cả</button>
          <button className="filter" aria-pressed={filter === 'practice'} onClick={() => setFilter('practice')}>Có bài luyện</button>
          <button className="filter" aria-pressed={filter === 'offline'} onClick={() => setFilter('offline')}>Đã tải</button>
        </div>
      </div>
      <p className="result-count" aria-live="polite">{results.length} học phần</p>
      {results.length > 0 ? (
        <div className="course-grid">{results.map((course) =>
          <CourseCard key={course.id} course={course} downloaded={downloaded.has(course.id)} />)}</div>
      ) : (
        <Empty title="Chưa thấy học phần phù hợp" details="Hãy thử tên ngắn hơn hoặc đổi bộ lọc." />
      )}
    </main>
  )
}

export function History({ courses, attempts }: { courses: Course[]; attempts: SavedAttempt[] }) {
  const [filter, setFilter] = useState<'all' | 'draft' | 'submitted'>('all')
  const rows = attempts.filter((attempt) => filter === 'all' || attempt.data.status === filter)
  return (
    <main className="page" id="noi-dung">
      <header className="page-header">
        <p className="eyebrow">Tiến độ</p>
        <h1>Lịch sử học</h1>
        <p>Tiếp tục bài nháp hoặc xem đáp án và góp ý của bài đã nộp.</p>
      </header>
      <div className="filter-row" aria-label="Lọc lịch sử">
        <button className="filter" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Tất cả</button>
        <button className="filter" aria-pressed={filter === 'draft'} onClick={() => setFilter('draft')}>Đang làm</button>
        <button className="filter" aria-pressed={filter === 'submitted'} onClick={() => setFilter('submitted')}>Đã nộp</button>
      </div>
      {rows.length > 0 ? (
        <ul className="attempt-history">
          {rows.map((attempt) => (
            <li className="card attempt-history-row" key={attempt.id}>
              <div>
                <h2>{courses.find((course) => course.id === attempt.course_id)?.name ?? attempt.course_id}</h2>
                <div className="meta-line"><AttemptSummary attempt={attempt} /></div>
              </div>
              <a className="button secondary" href={attemptLink(attempt.id)}>
                {attempt.data.status === 'draft' ? 'Tiếp tục' : 'Xem kết quả'} <span aria-hidden="true">→</span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <Empty title={filter === 'all' ? 'Bạn chưa có bài luyện' : 'Chưa có bài trong mục này'}>
          <a className="button secondary" href="#/thu-vien">Đến thư viện</a>
        </Empty>
      )}
    </main>
  )
}

export function Materials({ course, available, search }: { course: Course; available: Set<string>; search: string }) {
  const visible = course.sources.filter((source) => courseMatches({ ...course, name: source.title, codes: [], sources: [] }, search))
  const groups = new Map<string, Material[]>()
  for (const source of visible) {
    const key = source.documentId || source.id
    const records = groups.get(key)
    if (records) records.push(source)
    else groups.set(key, [source])
  }

  if (!groups.size) return <p className="muted">Chưa thấy tài liệu phù hợp.</p>
  return (
    <ul className="material-list">
      {[...groups.values()].map((records) => {
        const source = records.find((record) => !record.duplicateOf) ?? records[0]
        const alternates = records.filter((record) => record.id !== source.id)
        const canRead = Boolean(source.documentId && available.has(source.documentId))
        return (
          <li className="material-row" key={source.id}>
            <div className="file-symbol" aria-hidden="true">{source.documentId ? 'PDF' : '↗'}</div>
            <div className="material-info">
              <h3>{source.title}</h3>
              <div className="meta-line">
                <span>{materialKinds[source.kind]}</span>
                {Boolean(source.pageCount) && <><span aria-hidden="true">·</span><span>{source.pageCount} trang</span></>}
                {source.variant && <><span aria-hidden="true">·</span><span>{source.variant}</span></>}
              </div>
              {alternates.length > 0 && <details className="material-alternates">
                <summary>{alternates.length + 1} hồ sơ cho cùng nội dung</summary>
                {records.map((record) => <SourceAnchor key={record.id} url={record.url}>{record.title}</SourceAnchor>)}
              </details>}
            </div>
            {canRead
              ? <a className="button secondary" href={pdfLink(course.id, source.id)}>Đọc PDF <span aria-hidden="true">→</span></a>
              : <SourceAnchor url={source.url} className="button secondary">Mở tại TMU <span aria-hidden="true">↗</span></SourceAnchor>}
          </li>
        )
      })}
    </ul>
  )
}
