import { useCallback, useEffect, useRef, useState } from 'react'
import type { StudyApi } from './api'
import { localData } from './storage'
import type { AttemptData, AttemptRow, SavedAttempt } from './types'

export function useAttempts(userId: string, api: StudyApi, online: boolean) {
  const [attempts, setAttempts] = useState<SavedAttempt[]>([])
  const [ready, setReady] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState('')
  const records = useRef(new Map<string, SavedAttempt>())
  const operation = useRef<Promise<void> | null>(null)
  const syncTimer = useRef<number>(undefined)
  const active = useRef(false)
  const readyRef = useRef(false)

  const display = useCallback(() => {
    if (!active.current) return
    setAttempts([...records.current.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at)))
  }, [])

  const persist = useCallback((attempt: SavedAttempt) => {
    records.current.set(attempt.id, attempt)
    display()
    void localData.saveAttempt(userId, attempt).catch(() => {
      if (active.current) setNotice('Trình duyệt chưa lưu được bản ngoại tuyến. Hãy giữ mạng để đồng bộ bài làm.')
    })
  }, [display, userId])

  useEffect(() => {
    active.current = true
    const initialize = async () => {
      try {
        const rows = await localData.listAttempts(userId)
        if (active.current) {
          for (const { value } of rows) records.current.set(value.id, value)
          display()
        }
      } catch {
        if (active.current) setNotice('Không mở được bộ nhớ bài làm ngoại tuyến.')
      } finally {
        if (active.current) {
          readyRef.current = true
          setReady(true)
        }
      }
    }
    void initialize()
    return () => {
      active.current = false
      window.clearTimeout(syncTimer.current)
    }
  }, [userId, display])

  const sync = useCallback(function syncAttempts(): Promise<void> {
    if (operation.current) return operation.current
    if (!navigator.onLine || !active.current || !readyRef.current) return Promise.resolve()
    setSyncing(true)

    const pull = (row: AttemptRow) => {
      const local = records.current.get(row.id)
      if (!local || (!local.pending && row.revision > local.revision)) persist({ ...row, pending: false })
    }

    operation.current = (async () => {
      let failed = false
      try {
        const pending = [...records.current.values()].filter((attempt) => attempt.pending)
        for (const attempt of pending) {
          if (!active.current) return
          const { applied, attempt: remote } = await api.save(attempt)
          if (!active.current) return
          const current = records.current.get(attempt.id) ?? attempt
          if (!applied) {
            persist({ ...remote, pending: false })
            persist({ ...current, id: crypto.randomUUID(), revision: 0, pending: true })
            setNotice('Bài này cũng đã sửa trên thiết bị khác. Cả hai bản được giữ trong lịch sử.')
          } else {
            persist(current === attempt
              ? { ...remote, pending: false }
              : { ...current, revision: remote.revision, pending: true })
          }
        }
        const remote = await api.attempts()
        if (active.current) remote.forEach(pull)
      } catch {
        failed = true
        if (active.current) setNotice('Chưa thể đồng bộ. Bạn có thể thử lại khi có mạng.')
      } finally {
        operation.current = null
        if (active.current) {
          setSyncing(false)
          if (!failed && [...records.current.values()].some((attempt) => attempt.pending)) {
            window.clearTimeout(syncTimer.current)
            syncTimer.current = window.setTimeout(() => { void syncAttempts() }, 300)
          }
        }
      }
    })()
    return operation.current
  }, [api, persist])

  useEffect(() => {
    if (!ready || !online) return
    void sync()
    const onFocus = () => {
      if (document.visibilityState === 'visible') void sync()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [ready, online, sync])

  function save(id: string, courseId: string, data: AttemptData) {
    persist({
      id,
      user_id: userId,
      course_id: courseId,
      revision: records.current.get(id)?.revision ?? 0,
      data,
      updated_at: new Date().toISOString(),
      pending: true,
    })
    window.clearTimeout(syncTimer.current)
    syncTimer.current = window.setTimeout(() => { void sync() }, 450)
  }

  return {
    attempts, ready, syncing, notice, save, sync,
    clearNotice: () => setNotice(''),
    hasPending: () => [...records.current.values()].some((attempt) => attempt.pending),
  }
}
