import { useEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { StudyApi } from './api'
import { pdfLink } from './navigation'
import { Breadcrumb, Empty, Loading, SourceAnchor } from './ui'
import type { Course, Material } from './types'

GlobalWorkerOptions.workerSrc = workerUrl

const resourceDirectory = new URL(`${import.meta.env.BASE_URL}pdfjs/`, location.origin).href

export default function PdfReader({
  api, course, source, initialPage, available, online,
}: {
  api: StudyApi
  course: Course
  source: Material
  initialPage: number
  available: boolean
  online: boolean
}) {
  const [page, setPage] = useState(initialPage)
  const [pageText, setPageText] = useState(String(initialPage))
  const [data, setData] = useState<{ pdf: PDFDocumentProxy; expires: number } | null>(null)
  const [width, setWidth] = useState(0)
  const [zoom, setZoom] = useState(1)
  const [refresh, setRefresh] = useState(0)
  const [opening, setOpening] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const pageSurface = useRef<HTMLDivElement>(null)
  const retried = useRef(false)

  useEffect(() => {
    const element = stage.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(element)
    return () => observer.disconnect()
  }, [available, online])

  useEffect(() => {
    const { documentId } = source
    if (!available || !online || !documentId) return
    let active = true
    let task: ReturnType<typeof getDocument> | undefined
    setOpening(true)
    setError('')
    setData(null)
    pageSurface.current?.replaceChildren()

    const load = async () => {
      try {
        const { url, expiresAt } = await api.pdf(documentId)
        if (!active) return
        const expires = Date.parse(expiresAt)
        if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error('Liên kết PDF đã hết hạn.')
        task = getDocument({
          url,
          disableRange: false,
          disableStream: true,
          disableAutoFetch: true,
          rangeChunkSize: 256 * 1024,
          cMapUrl: resourceDirectory + 'cmaps/',
          cMapPacked: true,
          standardFontDataUrl: resourceDirectory + 'standard_fonts/',
          wasmUrl: resourceDirectory + 'wasm/',
          isEvalSupported: false,
        })
        const pdf = await task.promise
        if (active) setData({ pdf, expires })
      } catch {
        if (active) setError('Không mở được PDF. Hãy thử tải lại hoặc mở nguồn TMU.')
      } finally {
        if (active) setOpening(false)
      }
    }
    void load()
    return () => {
      active = false
      void task?.destroy().catch(() => undefined)
    }
  }, [api, available, online, refresh, source])

  useEffect(() => {
    if (!data || !width || !online) return
    if (data.expires - Date.now() < 15_000) {
      setRefresh((value) => value + 1)
      return
    }
    const actualPage = Math.min(page, data.pdf.numPages)
    if (actualPage !== page) {
      setPage(actualPage)
      setPageText(String(actualPage))
      return
    }

    let active = true
    let renderer: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    setRendering(true)
    setError('')
    pageSurface.current?.replaceChildren()
    const draw = async () => {
      try {
        const pdfPage = await data.pdf.getPage(actualPage)
        if (!active) return
        const original = pdfPage.getViewport({ scale: 1 })
        const cssWidth = Math.min(width, 950) * zoom
        const scale = cssWidth / original.width
        const density = Math.min(window.devicePixelRatio || 1, 2, 2800 / cssWidth)
        const viewport = pdfPage.getViewport({ scale: scale * density })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width)
        canvas.height = Math.ceil(viewport.height)
        canvas.style.width = Math.round(viewport.width / density) + 'px'
        canvas.style.height = Math.round(viewport.height / density) + 'px'
        canvas.setAttribute('role', 'img')
        canvas.setAttribute('aria-label', `${source.title}, trang ${actualPage}`)
        renderer = pdfPage.render({ canvas, viewport })
        await renderer.promise
        if (active) {
          pageSurface.current?.replaceChildren(canvas)
          retried.current = false
        }
      } catch {
        if (!active) return
        if (!retried.current) {
          retried.current = true
          setRefresh((value) => value + 1)
        } else {
          setError('Không hiển thị được trang PDF.')
        }
      } finally {
        if (active) setRendering(false)
      }
    }
    void draw()
    return () => {
      active = false
      renderer?.cancel()
    }
  }, [data, online, page, source.title, width, zoom])

  const total = data?.pdf.numPages ?? source.pageCount
  function goTo(target: number) {
    if (!Number.isFinite(target)) {
      setPageText(String(page))
      return
    }
    const next = Math.min(total ?? Infinity, Math.max(1, Math.trunc(target)))
    setPage(next)
    setPageText(String(next))
    window.history.replaceState(null, '', pdfLink(course.id, source.id, next))
  }

  return (
    <main className="page reader-page" id="noi-dung">
      <Breadcrumb course={course} page="Đọc PDF" />
      <header className="reading-header">
        <div>
          <p className="eyebrow">Tài liệu học</p>
          <h1>{source.title}</h1>
        </div>
        <SourceAnchor url={source.url} className="button secondary">Mở tại TMU <span aria-hidden="true">↗</span></SourceAnchor>
      </header>
      {!available || !online ? (
        <Empty title={available ? 'Hãy kết nối mạng để đọc PDF' : 'Tài liệu mở qua thư viện TMU'}>
          <SourceAnchor url={source.url} className="button secondary">Mở tại TMU <span aria-hidden="true">↗</span></SourceAnchor>
        </Empty>
      ) : (
        <section className="pdf-shell card" aria-label="Trình đọc PDF">
          <div className="pdf-toolbar">
            <div className="control-group">
              <button className="icon-button" title="Trang trước" aria-label="Trang trước" disabled={opening || page <= 1} onClick={() => goTo(page - 1)}>←</button>
              <form className="page-form" onSubmit={(event) => { event.preventDefault(); goTo(Number(pageText)) }}>
                <label htmlFor="pdf-page" className="visually-hidden">Số trang PDF</label>
                <input id="pdf-page" type="text" inputMode="numeric" size={4} value={pageText} onChange={(event) => setPageText(event.target.value)} onBlur={() => goTo(Number(pageText))} />
                <span>/ {total ?? '…'}</span>
              </form>
              <button className="icon-button" title="Trang sau" aria-label="Trang sau" disabled={opening || Boolean(total && page >= total)} onClick={() => goTo(page + 1)}>→</button>
            </div>
            <div className="control-group" aria-label="Thu phóng">
              <button className="icon-button" title="Thu nhỏ" aria-label="Thu nhỏ" disabled={zoom <= 0.75} onClick={() => setZoom((value) => value - 0.25)}>−</button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button className="icon-button" title="Phóng to" aria-label="Phóng to" disabled={zoom >= 2} onClick={() => setZoom((value) => value + 0.25)}>+</button>
            </div>
          </div>
          <div className="pdf-stage" ref={stage} aria-busy={opening || rendering}>
            {(opening || rendering) && <Loading label={opening ? 'Đang mở PDF…' : `Đang tải trang ${page}…`} />}
            {error && <div className="error-panel" role="alert">
              <p>{error}</p>
              <button className="button secondary" onClick={() => { retried.current = false; setRefresh((value) => value + 1) }}>Thử lại</button>
            </div>}
            <div className="pdf-surface" ref={pageSurface} />
          </div>
        </section>
      )}
    </main>
  )
}
