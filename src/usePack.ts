import { useEffect, useState } from 'react'
import type { StudyApi } from './api'
import { localData } from './storage'
import type { Pack } from './types'

export function usePack(userId: string, courseId: string, api: StudyApi, online: boolean) {
  const [pack, setPack] = useState<Pack | null>(null)
  const [loading, setLoading] = useState(true)
  const [downloaded, setDownloaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      let offlinePack
      setError('')
      try {
        offlinePack = await localData.getPack(userId, courseId)
        if (!active) return
        setDownloaded(Boolean(offlinePack))
        if (offlinePack) {
          setPack(offlinePack)
          setLoading(false)
        }
      } catch {
        // A blocked offline store still allows fetching the course online.
      }
      try {
        if (online) {
          const onlinePack = await api.pack(courseId)
          if (!active) return
          setPack(onlinePack ?? offlinePack ?? null)
          if (offlinePack && onlinePack) {
            await localData.setPack(userId, onlinePack).catch(() => undefined)
          }
        } else if (!offlinePack && active) {
          setError('Bộ câu hỏi này chưa được tải trên thiết bị.')
        }
      } catch (error) {
        if (active && !offlinePack) setError(error instanceof Error ? error.message : 'Không tải được bài luyện.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void load()
    return () => { active = false }
  }, [api, courseId, online, userId])

  async function download() {
    if (!pack) return false
    try {
      await localData.setPack(userId, pack)
      setDownloaded(true)
      return true
    } catch {
      setError('Không đủ bộ nhớ để lưu bài luyện trên thiết bị.')
      return false
    }
  }

  return { pack, loading, downloaded, error, download }
}
