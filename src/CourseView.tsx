import { useState } from 'react'
import type { StudyApi } from './api'
import { Materials } from './Library'
import { attemptLink } from './navigation'
import { availableExam, createAttempt } from './study'
import type { AttemptData, Course, Mode, Question, SavedAttempt } from './types'
import { AttemptSummary, Breadcrumb, Loading } from './ui'
import { usePack } from './usePack'

export function CourseView({
  api, userId, course, attempts, available, online, save, onDownload,
}: {
  api: StudyApi
  userId: string
  course: Course
  attempts: SavedAttempt[]
  available: Set<string>
  online: boolean
  save(id: string, courseId: string, data: AttemptData): void
  onDownload(courseId: string): void
}) {
  const { pack, loading, downloaded, error, download } = usePack(userId, course.id, api, online)
  const [section, setSection] = useState<'practice' | 'materials'>(course.hasPdf ? 'practice' : 'materials')
  const [topic, setTopic] = useState('')
  const [query, setQuery] = useState('')
  const draft = attempts.find((attempt) => attempt.course_id === course.id && attempt.data.status === 'draft')
  const selected = pack?.questions.filter((question) => !topic || question.topicId === topic) ?? []
  const mcqs = selected.filter((question) => question.type === 'mcq').length
  const essays = selected.length - mcqs
  const canExam = Boolean(pack && availableExam(pack))

  async function savePack() {
    if (await download()) onDownload(course.id)
  }

  function start(mode: Mode, type?: Question['type']) {
    if (!pack) return
    const data = createAttempt(pack, mode, topic || undefined, type)
    if (!data) return
    const id = crypto.randomUUID()
    save(id, course.id, data)
    if (!downloaded) void savePack()
    location.hash = attemptLink(id)
  }

  return (
    <main className="page" id="noi-dung">
      <Breadcrumb page={course.name} />
      <header className="page-header course-header">
        <p className="eyebrow">{course.codes.length > 0 ? course.codes.join(' · ') : 'Học phần'}</p>
        <h1>{course.name}</h1>
        {course.language === 'en' && <p>Học liệu bằng tiếng Anh</p>}
      </header>
      <nav className="tab-list" aria-label="Nội dung học phần">
        <button className="tab" aria-pressed={section === 'practice'} onClick={() => setSection('practice')}>Bài luyện</button>
        <button className="tab" aria-pressed={section === 'materials'} onClick={() => setSection('materials')}>Tài liệu</button>
      </nav>
      {section === 'materials' ? (
        <section className="card material-card">
          <div className="section-heading">
            <h2>Tài liệu học phần</h2>
            {course.sources.length > 4 && <label className="search-field compact">
              <span className="search-glyph" aria-hidden="true" />
              <span className="visually-hidden">Lọc tài liệu</span>
              <input type="search" placeholder="Lọc tài liệu" value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>}
          </div>
          <Materials course={course} available={available} search={query} />
        </section>
      ) : (
        <div className="practice-stack">
          {draft && <section className="resume card">
            <div>
              <p className="eyebrow">Đang học</p>
              <h2>Tiếp tục bài nháp</h2>
              <div className="meta-line"><AttemptSummary attempt={draft} /></div>
            </div>
            <a className="button secondary" href={attemptLink(draft.id)}>Tiếp tục <span aria-hidden="true">→</span></a>
          </section>}
          {loading && <Loading label="Đang tải bài luyện…" />}
          {error && <p className="inline-notice" role="status">{error}</p>}
          {pack && <>
            <div className="practice-grid">
              <section className="card practice-card">
                <div className="practice-symbol" aria-hidden="true">✎</div>
                <h2>Luyện theo chủ đề</h2>
                <label className="select-label">
                  Chủ đề
                  <select value={topic} onChange={(event) => setTopic(event.target.value)}>
                    <option value="">Tất cả chủ đề</option>
                    {pack.topics.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                  </select>
                </label>
                <div className="actions">
                  <button className="button primary" disabled={mcqs === 0} onClick={() => start('practice', 'mcq')}>
                    Trắc nghiệm <span className="button-count">{mcqs}</span>
                  </button>
                  <button className="button secondary" disabled={essays === 0} onClick={() => start('practice', 'essay')}>
                    Tự luận <span className="button-count">{essays}</span>
                  </button>
                </div>
              </section>
              <section className="card practice-card">
                <div className="practice-symbol exam" aria-hidden="true">◴</div>
                <h2>Thi thử</h2>
                <p>30 phút. 10 câu trắc nghiệm và 2 câu tự luận.</p>
                <button className="button secondary" disabled={!canExam} onClick={() => start('exam')}>Bắt đầu thi <span aria-hidden="true">→</span></button>
              </section>
            </div>
            <section className="offline-card card">
              <div>
                <h2>{downloaded ? 'Đã lưu trên thiết bị' : 'Mang bài luyện theo'}</h2>
                <p>{downloaded ? 'Có thể mở bài luyện khi mất mạng.' : 'Lưu câu hỏi, lời giải và dàn ý để học khi mất mạng.'}</p>
              </div>
              <button className="button secondary" disabled={downloaded} onClick={() => void savePack()}>
                <span aria-hidden="true">{downloaded ? '✓' : '↓'}</span> {downloaded ? 'Đã tải' : 'Tải bài luyện'}
              </button>
            </section>
          </>}
          {!loading && !pack && !error && <section className="empty card">
            <h2>Chưa có bài luyện cho môn này</h2>
            <button className="button secondary" onClick={() => setSection('materials')}>Xem tài liệu</button>
          </section>}
        </div>
      )}
    </main>
  )
}
