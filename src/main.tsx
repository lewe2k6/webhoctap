import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { StudyApi } from './api'
import { allowDemo, allowLocalLibrary, cloudApi } from './api'
import { AttemptView } from './AttemptView'
import { Login, signOut, useOnline, useOwner } from './Auth'
import { CourseView } from './CourseView'
import { Dashboard, History, Library } from './Library'
import { useRoute } from './navigation'
import { localData } from './storage'
import type { SavedCatalog } from './storage'
import { Brand, Empty, Loading } from './ui'
import { useAttempts } from './useAttempts'
import './style.css'

const PdfReader = lazy(() => import('./PdfReader'))

type PreviewKind = 'demo' | 'local'

function StudyApp({
  api, userId, online, preview, onLogout,
}: {
  api: StudyApi
  userId: string
  online: boolean
  preview?: PreviewKind
  onLogout(): void
}) {
  const [data, setData] = useState<SavedCatalog | null>(null)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [downloaded, setDownloaded] = useState(new Set<string>())
  const route = useRoute()
  const { attempts, ready, syncing, notice, save, sync, clearNotice, hasPending } = useAttempts(userId, api, online)
  const available = useMemo(() => new Set(data?.available), [data?.available])

  useEffect(() => {
    let active = true
    async function load() {
      setError('')
      let cached: SavedCatalog | undefined
      try {
        const [catalog, packs] = await Promise.all([localData.getCatalog(userId), localData.listPacks(userId)])
        if (!active) return
        cached = catalog
        if (catalog) setData(catalog)
        setDownloaded(new Set(packs.map(({ value }) => value.courseId)))
      } catch {
        // Online learning still works if this browser blocks private offline storage.
      }
      if (!online) {
        if (active && !cached) setError('Bạn chưa mở thư viện trên thiết bị này. Hãy kết nối mạng để tải.')
        return
      }
      try {
        const latest = await api.catalog()
        if (active) {
          setData(latest)
          void localData.setCatalog(userId, latest).catch(() => undefined)
        }
      } catch (problem) {
        if (active) setError(problem instanceof Error ? problem.message : 'Không tải được thư viện.')
      }
    }
    void load()
    return () => { active = false }
  }, [api, online, reload, userId])

  async function logOut() {
    if (preview) {
      onLogout()
      return
    }
    await sync()
    if (hasPending() && !window.confirm('Có bài làm chưa đồng bộ. Đăng xuất sẽ xóa bản lưu trên thiết bị này. Bạn có muốn tiếp tục?')) return
    await localData.clear(userId).catch(() => undefined)
    await signOut()
  }

  const courses = data?.catalog.courses ?? []
  const course = 'courseId' in route ? courses.find((item) => item.id === route.courseId) : undefined
  let content
  if (!data) {
    content = <main className="page" id="noi-dung">
      {error
        ? <Empty title="Chưa mở được thư viện" details={error}>
            <button className="button secondary" onClick={() => setReload((value) => value + 1)}>Thử lại</button>
          </Empty>
        : <Loading label="Đang tải thư viện…" />}
    </main>
  } else if (route.name === 'home') {
    content = <Dashboard courses={courses} attempts={attempts} downloaded={downloaded} />
  } else if (route.name === 'library') {
    content = <Library courses={courses} downloaded={downloaded} />
  } else if (route.name === 'history') {
    content = ready && (!syncing || attempts.length)
      ? <History courses={courses} attempts={attempts} />
      : <main className="page" id="noi-dung"><Loading label="Đang tải lịch sử…" /></main>
  } else if (route.name === 'course' && course) {
    content = <CourseView key={course.id} api={api} userId={userId} course={course} attempts={attempts} available={available} online={online} save={save}
      onDownload={(id) => setDownloaded((previous) => new Set(previous).add(id))} />
  } else if (route.name === 'pdf' && course) {
    const source = course.sources.find((record) => record.id === route.sourceId)
    if (source) content = <Suspense fallback={<main className="page" id="noi-dung"><Loading label="Đang mở trình đọc…" /></main>}>
      <PdfReader key={source.id} course={course} source={source} initialPage={route.page} available={Boolean(source.documentId && available.has(source.documentId))} online={online} api={api} />
    </Suspense>
  } else if (route.name === 'attempt') {
    const attempt = attempts.find((item) => item.id === route.attemptId)
    const attemptCourse = courses.find((item) => item.id === attempt?.course_id)
    if (attempt && attemptCourse) content = <AttemptView key={attempt.id} userId={userId} api={api} course={attemptCourse} attempt={attempt}
      available={available} online={online} save={save} localOnly={preview === 'local'} />
    else if (!ready || syncing) content = <main className="page" id="noi-dung"><Loading label="Đang tìm bài làm…" /></main>
  }

  if (!content) content = <main className="page" id="noi-dung"><Empty title="Không tìm thấy nội dung" details="Hãy mở học phần hoặc bài làm từ thư viện và lịch sử.">
    <a className="button secondary" href="#/thu-vien">Về thư viện</a>
  </Empty></main>

  const navOpen = route.name === 'home' ? 'home' : route.name === 'history' ? 'history' : 'library'
  return (
    <>
      <a className="skip-link" href="#noi-dung" onClick={(event) => { event.preventDefault(); document.getElementById('noi-dung')?.scrollIntoView() }}>Đến nội dung</a>
      <header className="topbar">
        <div className="topbar-inner">
          <Brand to="#/" />
          <nav className="main-nav" aria-label="Điều hướng chính">
            <a href="#/" aria-current={navOpen === 'home' ? 'page' : undefined}>Trang học</a>
            <a href="#/thu-vien" aria-current={navOpen === 'library' ? 'page' : undefined}>Thư viện</a>
            <a href="#/lich-su" aria-current={navOpen === 'history' ? 'page' : undefined}>Lịch sử</a>
          </nav>
          <button className="icon-button logout-button" aria-label={preview ? 'Thoát xem trước' : 'Đăng xuất'} title={preview ? 'Thoát xem trước' : 'Đăng xuất'} onClick={() => void logOut()}>
            <span aria-hidden="true">⇥</span>
          </button>
        </div>
      </header>
      {(preview || !online || notice || (data && error)) && <div className="status-bar" role="status">
        <div className="status-bar-inner">
          {preview === 'demo' && <span>Bản thử · Dữ liệu minh họa</span>}
          {preview === 'local' && <span>Đang dùng học liệu trên máy này</span>}
          {!online && <span className="status-dot">Đang học offline</span>}
          {data && error && <span>{error} Đang dùng bản đã lưu.</span>}
          {notice && <span>{notice}</span>}
          {notice && online && <button className="text-button" onClick={() => { clearNotice(); void sync() }}>Đồng bộ lại</button>}
          {notice && !online && <button className="text-button" onClick={clearNotice}>Đóng</button>}
        </div>
      </div>}
      {content}
    </>
  )
}

function App() {
  const online = useOnline()
  const { owner, callbackError } = useOwner(online)
  const [preview, setPreview] = useState<{ kind: PreviewKind; userId: string; api: StudyApi } | null>(null)

  async function openDemo() {
    if (!allowDemo) return
    const { demoApi, demoUser } = await import('./demo')
    sessionStorage.setItem('webhoctap-demo', 'true')
    setPreview({ kind: 'demo', userId: demoUser, api: demoApi })
  }

  async function openLocal() {
    if (!allowLocalLibrary) return
    const { localApi, localUser } = await import('./privatePreview')
    setPreview({ kind: 'local', userId: localUser, api: localApi })
  }

  useEffect(() => {
    if (allowLocalLibrary) void openLocal()
    else if (allowDemo && sessionStorage.getItem('webhoctap-demo') === 'true') void openDemo()
  }, [])

  if (preview) return <StudyApp key={preview.userId} api={preview.api} userId={preview.userId} online={online} preview={preview.kind}
    onLogout={() => { sessionStorage.removeItem('webhoctap-demo'); setPreview(null); location.hash = '#/' }} />
  if (owner.state === 'owner') return <StudyApp key={owner.userId} api={cloudApi} userId={owner.userId} online={online} onLogout={() => undefined} />
  return <Login owner={owner} online={online} callbackError={callbackError} startDemo={() => void openDemo()} startLocal={() => void openLocal()} />
}

createRoot(document.getElementById('root')!).render(<App />)
