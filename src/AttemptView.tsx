import { useEffect, useRef, useState } from 'react'
import type { StudyApi } from './api'
import { attemptLink, courseLink, pdfLink } from './navigation'
import { answeredCount, formatDuration, OPTIONS, submitAttempt } from './study'
import type { AttemptData, Course, Feedback, Question, SavedAttempt, Source } from './types'
import { Breadcrumb, Empty, Loading, SourceAnchor } from './ui'
import { usePack } from './usePack'

function SourceReference({ course, source, available }: { course: Course; source: Source; available: Set<string> }) {
  const material = course.sources.find((item) => item.id === source.sourceId)
    ?? course.sources.find((item) => item.documentId === source.documentId)
  const text = `${source.label || material?.title || 'Tài liệu tham khảo'} · Trang PDF ${source.page}`
  return (
    <p className="reference">
      <strong>Bài luyện biên soạn · Nguồn tham khảo</strong>
      {material && available.has(source.documentId)
        ? <a href={pdfLink(course.id, material.id, source.page)}>{text} <span aria-hidden="true">→</span></a>
        : (source.url || material?.url)
            ? <SourceAnchor url={source.url || material?.url || ''}>{text} <span aria-hidden="true">↗</span></SourceAnchor>
            : <span>{text}</span>}
    </p>
  )
}

function QuestionResult({
  question, attempt, course, available, online, api, tutorEnabled,
}: {
  question: Question
  attempt: SavedAttempt
  course: Course
  available: Set<string>
  online: boolean
  api: StudyApi
  tutorEnabled: boolean
}) {
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [error, setError] = useState('')
  const answer = attempt.data.answers[question.id]
  const mcq = question.type === 'mcq'
  const correct = mcq && answer === question.answer
  const showFeedback = mcq ? !correct && typeof answer === 'number' : typeof answer === 'string' && answer.trim().length > 0

  async function requestHelp() {
    setWaiting(true)
    setError('')
    try { setFeedback(await api.tutor(attempt.id, question.id)) }
    catch (error) { setError(error instanceof Error ? error.message : 'Không lấy được góp ý.') }
    finally { setWaiting(false) }
  }

  return (
    <div className="answer-review">
      {mcq ? (
        <>
          <p className={`answer-status ${correct ? 'correct' : 'wrong'}`}>
            {correct ? '✓ Chính xác' : typeof answer === 'number' ? 'Cần xem lại' : 'Chưa trả lời'}
          </p>
          <div className="solution-grid">
            <div><strong>Bạn chọn</strong><p>{typeof answer === 'number' ? `${OPTIONS[answer]}. ${question.options[answer]}` : 'Chưa chọn'}</p></div>
            <div><strong>Đáp án</strong><p>{question.answer === null ? 'Xem lời giải' : `${OPTIONS[question.answer]}. ${question.options[question.answer]}`}</p></div>
          </div>
        </>
      ) : (
        <div className="essay-response">
          <strong>Bài làm của bạn</strong>
          <p>{typeof answer === 'string' && answer.trim() ? answer : 'Chưa có nội dung.'}</p>
        </div>
      )}
      <h3>{mcq ? 'Lời giải' : 'Dàn ý tham khảo'}</h3>
      <p className="long-text">{question.explanation}</p>
      {!mcq && question.rubric?.length > 0 && <>
        <h3>Tiêu chí tự chấm</h3>
        <ul className="rubric">{question.rubric.map((item, index) => <li key={index}>{item}</li>)}</ul>
      </>}
      <SourceReference course={course} source={question.source} available={available} />
      {showFeedback && tutorEnabled && <div className="feedback-area">
        {!feedback && <button className="button secondary" disabled={waiting || !online || attempt.pending} onClick={() => void requestHelp()}>
          {waiting ? 'Đang lấy góp ý…' : 'Nhận góp ý từ Gemini'}
        </button>}
        {!online && !feedback && <p className="small muted">Kết nối mạng để nhận góp ý.</p>}
        {online && attempt.pending && !feedback && <p className="small muted">Góp ý sẽ mở sau khi bài được đồng bộ.</p>}
        {error && <p className="inline-notice" role="alert">{error}</p>}
        {feedback && <section className="feedback-box" aria-live="polite">
          <h3>Góp ý của Gemini</h3>
          <p>{feedback.summary}</p>
          {feedback.strengths.length > 0 && <><strong>Điểm làm tốt</strong><ul>{feedback.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
          {feedback.improvements.length > 0 && <><strong>Điểm cần cải thiện</strong><ul>{feedback.improvements.map((item, index) => <li key={index}>{item}</li>)}</ul></>}
        </section>}
      </div>}
    </div>
  )
}

function SubmitDialog({ done, total, cancel, finish }: { done: number; total: number; cancel(): void; finish(): void }) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  return (
    <dialog className="modal card" ref={dialog} aria-labelledby="submit-title" onCancel={cancel}>
      <h2 id="submit-title">Nộp bài?</h2>
      <p>Bạn đã làm {done}/{total} câu. Sau khi nộp, bạn có thể xem lời giải và trang nguồn.</p>
      <div className="actions">
        <button className="button secondary" autoFocus onClick={cancel}>Làm tiếp</button>
        <button className="button primary" onClick={finish}>Xác nhận nộp</button>
      </div>
    </dialog>
  )
}

export function AttemptView({
  api, userId, course, attempt, available, online, save, localOnly,
}: {
  api: StudyApi
  userId: string
  course: Course
  attempt: SavedAttempt
  available: Set<string>
  online: boolean
  localOnly: boolean
  save(id: string, courseId: string, data: AttemptData): void
}) {
  const { pack, loading, error } = usePack(userId, course.id, api, online)
  const { data } = attempt
  const submitted = data.status === 'submitted'
  const [now, setNow] = useState(Date.now)
  const [resultPosition, setResultPosition] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const deadline = data.deadlineAt
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : undefined
  const position = Math.min(Math.max(submitted ? resultPosition : data.position || 0, 0), data.questionIds.length - 1)
  const questions = data.questionIds.map((id) => pack?.questions.find((question) => question.id === id)).filter((question) => question !== undefined)
  const completePack = questions.length > 0 && questions.length === data.questionIds.length
  const question = questions[position]
  const done = answeredCount(data)

  useEffect(() => {
    if (!deadline || submitted) return
    const tick = () => setNow(Date.now())
    tick()
    const interval = window.setInterval(tick, 1000)
    window.addEventListener('focus', tick)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', tick)
    }
  }, [deadline, submitted])

  useEffect(() => {
    if (!submitted && remaining === 0 && completePack) save(attempt.id, course.id, submitAttempt(data, questions))
  }, [attempt.id, completePack, course.id, data, questions, remaining, save, submitted])

  function writeAnswer(value: string | number) {
    if (!question || submitted || (deadline && Date.now() >= deadline)) return
    save(attempt.id, course.id, { ...data, answers: { ...data.answers, [question.id]: value } })
  }

  function move(target: number) {
    if (target < 0 || target >= questions.length) return
    setConfirming(false)
    if (submitted) setResultPosition(target)
    else save(attempt.id, course.id, { ...data, position: target })
    document.getElementById('cau-hoi')?.scrollIntoView({ block: 'start' })
  }

  function finish() {
    setConfirming(false)
    save(attempt.id, course.id, submitAttempt(data, questions))
    window.scrollTo(0, 0)
  }

  const mistakes = questions.filter((item) => item.type === 'mcq' && data.answers[item.id] !== item.answer)
  function retryMistakes() {
    const id = crypto.randomUUID()
    save(id, course.id, {
      status: 'draft', mode: 'practice', position: 0, questionIds: mistakes.map((item) => item.id), answers: {}, startedAt: Date.now(),
    })
    location.hash = attemptLink(id)
  }

  return (
    <main className="page study-page" id="noi-dung">
      <Breadcrumb course={course} page={submitted ? 'Kết quả' : data.mode === 'exam' ? 'Thi thử' : 'Bài luyện'} />
      <header className="page-header study-header">
        <h1>{submitted ? 'Kết quả bài làm' : data.mode === 'exam' ? 'Thi thử' : 'Luyện tập'}</h1>
        {remaining !== undefined && !submitted && <div className={`timer ${remaining <= 60 ? 'ending' : ''}`}>
          <span>Còn lại</span><strong role="timer">{formatDuration(remaining)}</strong>
        </div>}
      </header>
      {loading && !pack && <Loading label="Đang mở bài làm…" />}
      {!loading && !completePack && <Empty title="Chưa mở được câu hỏi" details={error || 'Bộ câu hỏi của lần làm bài này chưa sẵn sàng.'}>
        <a className="button secondary" href={courseLink(course.id)}>Về học phần</a>
      </Empty>}
      {completePack && question && <>
        {submitted && (
          <section className="result-banner card">
            <div>
              <p className="eyebrow">Đã nộp bài</p>
              <h2>{data.score?.total ? `${data.score.correct}/${data.score.total} câu trắc nghiệm đúng` : 'Xem dàn ý tự luận'}</h2>
              {attempt.pending && <span className="small muted">Đang chờ đồng bộ</span>}
            </div>
            {mistakes.length > 0 && <button className="button secondary" onClick={retryMistakes}>Luyện lại câu sai <span aria-hidden="true">→</span></button>}
          </section>
        )}
        <div className="study-grid">
          <section className="card question-card" id="cau-hoi">
            <div className="question-meta">
              <p className="eyebrow">Câu {position + 1}/{questions.length} · {question.type === 'mcq' ? 'Trắc nghiệm' : 'Tự luận'}</p>
              <span>{pack?.topics.find((item) => item.id === question.topicId)?.title}</span>
            </div>
            <h2 className="question-text">{question.prompt}</h2>
            {submitted ? (
              <QuestionResult key={question.id} question={question} attempt={attempt} course={course} available={available} online={online} api={api} tutorEnabled={!localOnly} />
            ) : question.type === 'mcq' ? (
              <fieldset className="options">
                <legend className="visually-hidden">Chọn đáp án</legend>
                {question.options.map((option, index) => (
                  <label key={index} className={`option ${data.answers[question.id] === index ? 'selected' : ''}`}>
                    <input type="radio" name={question.id} value={index} checked={data.answers[question.id] === index} onChange={() => writeAnswer(index)} />
                    <span className="option-marker" aria-hidden="true">{OPTIONS[index]}</span>
                    <span>{option}</span>
                  </label>
                ))}
              </fieldset>
            ) : (
              <label className="essay-field">
                Câu trả lời
                <textarea value={String(data.answers[question.id] ?? '')} onChange={(event) => writeAnswer(event.target.value)} placeholder="Viết lập luận của bạn ở đây…" maxLength={6000} />
              </label>
            )}
            <div className="question-navigation">
              <button className="button secondary" disabled={position === 0} onClick={() => move(position - 1)}><span aria-hidden="true">←</span> Trước</button>
              {position < questions.length - 1
                ? <button className="button primary" onClick={() => move(position + 1)}>Câu tiếp <span aria-hidden="true">→</span></button>
                : submitted
                    ? <a className="button secondary" href="#/lich-su">Lịch sử học</a>
                    : <button className="button primary" onClick={() => setConfirming(true)}>Nộp bài</button>}
            </div>
          </section>
          <aside className="card attempt-progress" aria-label="Danh sách câu hỏi">
            <h2>Danh sách câu</h2>
            <p>{done}/{questions.length} câu đã làm</p>
            <div className="question-numbers">
              {questions.map((item, index) => {
                const answer = data.answers[item.id]
                const answered = typeof answer === 'number' || (typeof answer === 'string' && answer.trim().length > 0)
                return <button key={item.id} className={answered ? 'done' : ''} aria-current={position === index ? 'step' : undefined} aria-label={`Câu ${index + 1}${answered ? ', đã làm' : ''}`} onClick={() => move(index)}>{index + 1}</button>
              })}
            </div>
            {!submitted && position < questions.length - 1 && <button className="button secondary" onClick={() => setConfirming(true)}>Nộp bài</button>}
            {!submitted && <p className="small">{online && !attempt.pending && !localOnly ? 'Đã đồng bộ' : 'Bản nháp trên thiết bị'}</p>}
          </aside>
        </div>
      </>}
      {confirming && !submitted && <SubmitDialog done={done} total={questions.length} cancel={() => setConfirming(false)} finish={finish} />}
    </main>
  )
}
