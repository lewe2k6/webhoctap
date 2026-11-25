import type { StudyApi } from './api'
import { localAttempts } from './localAttempts'
import type { SavedCatalog } from './storage'
import type { Pack } from './types'

export const localUser = 'local-library'

export const localApi: StudyApi = {
  async catalog() {
    const response = await fetch('/__study-local/catalog', { cache: 'no-store' })
    if (!response.ok) throw new Error('Danh mục trên máy này chưa sẵn sàng.')
    return await response.json() as SavedCatalog
  },
  async pack(courseId) {
    const response = await fetch('/__study-local/packs/' + encodeURIComponent(courseId), { cache: 'no-store' })
    if (response.status === 404) return null
    if (!response.ok) throw new Error('Không tải được bài luyện trên máy này.')
    return await response.json() as Pack
  },
  ...localAttempts(),
  async pdf(documentId) {
    return {
      url: location.origin + '/__study-local/pdf/' + encodeURIComponent(documentId),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }
  },
  async tutor() {
    throw new Error('Trợ giảng Gemini cần kết nối dịch vụ trực tuyến.')
  },
}
