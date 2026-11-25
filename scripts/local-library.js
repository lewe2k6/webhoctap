import { createReadStream, existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'

const prefix = '/__study-local/'
const loopback = new Set(['::1', '127.0.0.1', '::ffff:127.0.0.1'])
const localhost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/
const catalogPath = '.private/catalog.json'
const indexPath = '.private/source-index.json'

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

function localPdf(index, id) {
  const file = index.readerFiles[id]
  if (!file) return null
  const root = realpathSync(index.sourceRoot)
  const candidate = resolve(root, file.path)
  if (!existsSync(candidate)) return null
  const path = realpathSync(candidate)
  const local = relative(root, path)
  if (!local || local === '..' || local.startsWith('..' + sep) || isAbsolute(local)) return null
  return file.bytes === statSync(path).size ? path : null
}

function readRange(header, size) {
  const parts = /^bytes=(\d*)-(\d*)$/.exec(header)
  if (!parts || (!parts[1] && !parts[2])) return null
  const start = parts[1] ? Number(parts[1]) : Math.max(0, size - Number(parts[2]))
  const end = parts[1] && parts[2] ? Math.min(size - 1, Number(parts[2])) : size - 1
  return Number.isSafeInteger(start) && Number.isSafeInteger(end) && start <= end ? { start, end } : null
}

function streamPdf(req, res, path) {
  const size = statSync(path).size
  const headers = { 'Content-Type': 'application/pdf', 'Accept-Ranges': 'bytes' }
  const range = req.headers.range ? readRange(req.headers.range, size) : undefined
  if (range === null) {
    res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` }).end()
    return
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
  }
  headers['Content-Length'] = range ? range.end - range.start + 1 : size
  res.writeHead(range ? 206 : 200, headers)
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  const stream = createReadStream(path, range)
  stream.on('error', () => res.destroy())
  res.on('close', () => stream.destroy())
  stream.pipe(res)
}

export function localStudyLibrary() {
  return {
    name: 'local-study-library',
    apply: 'serve',
    configureServer(server) {
      if (server.config.env.VITE_PRIVATE_PREVIEW !== '1') return
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next()
        res.setHeader('Cache-Control', 'private, no-store')
        if (!loopback.has(req.socket.remoteAddress) || !localhost.test(req.headers.host ?? '')) {
          return sendJson(res, 403, { error: 'Bản xem thử chỉ mở trên máy này.' })
        }
        if (!['GET', 'HEAD'].includes(req.method)) {
          return sendJson(res, 405, { error: 'Phương thức không được hỗ trợ.' })
        }
        const target = req.url.split('?', 1)[0].slice(prefix.length)
        const pathMatch = /^(packs|pdf)\/([a-z0-9-]+)$/.exec(target)
        try {
          if (target === 'catalog') {
            const catalog = readJson(catalogPath)
            const index = readJson(indexPath)
            const available = catalog.documents.filter(({ id }) => localPdf(index, id)).map(({ id }) => id)
            return sendJson(res, 200, { catalog, available })
          }
          if (pathMatch?.[1] === 'packs') {
            const path = `.private/packs/${pathMatch[2]}.json`
            if (existsSync(path)) return sendJson(res, 200, readJson(path))
          }
          if (pathMatch?.[1] === 'pdf' && /^[0-9a-f]{64}$/.test(pathMatch[2])) {
            const path = localPdf(readJson(indexPath), pathMatch[2])
            if (path) return streamPdf(req, res, path)
          }
          return sendJson(res, 404, { error: 'Chưa có học liệu tương ứng.' })
        } catch {
          return sendJson(res, 503, { error: 'Chưa đọc được thư viện cục bộ. Kiểm tra danh mục và thư mục PDF.' })
        }
      })
    },
  }
}
