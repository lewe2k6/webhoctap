import { createClient, FunctionsHttpError } from '@supabase/supabase-js'
import type { SavedCatalog } from './storage'
import type { AttemptRow, Catalog, Feedback, Pack, SavedAttempt, SaveResponse, SignedPdf } from './types'

const endpoint = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = endpoint && key
  ? createClient(endpoint, key, {
      auth: { flowType: 'pkce', detectSessionInUrl: true, storageKey: 'webhoctap-auth-v1' },
    })
  : null

const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
export const allowDemo = localHost && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === 'true')
export const allowLocalLibrary = localHost && import.meta.env.DEV && import.meta.env.VITE_PRIVATE_PREVIEW === '1'

export interface StudyApi {
  catalog(): Promise<SavedCatalog>
  pack(courseId: string): Promise<Pack | null>
  attempts(): Promise<AttemptRow[]>
  save(attempt: SavedAttempt): Promise<SaveResponse>
  pdf(documentId: string): Promise<SignedPdf>
  tutor(attemptId: string, questionId: string): Promise<Feedback>
}

function client() {
  if (!supabase) throw new Error('Website chưa kết nối máy chủ.')
  return supabase
}

async function invoke<T>(name: string, body: Record<string, string>) {
  const { data, error } = await client().functions.invoke<T>(name, { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const value = await error.context.json().catch(() => null) as { message?: string } | null
      throw new Error(value?.message || 'Dịch vụ tạm thời gián đoạn. Vui lòng thử lại.')
    }
    throw new Error('Không kết nối được dịch vụ. Hãy kiểm tra mạng và thử lại.')
  }
  if (!data) throw new Error('Máy chủ chưa trả kết quả.')
  return data
}

export const cloudApi: StudyApi = {
  async catalog() {
    const [catalog, documents] = await Promise.all([
      client().from('study_catalog').select('data').eq('id', 1).single(),
      client().from('study_documents').select('document_id'),
    ])
    if (catalog.error) throw new Error('Danh mục trên máy chủ chưa sẵn sàng.')
    if (documents.error) throw new Error('Không kiểm tra được kho PDF.')
    return { catalog: catalog.data.data as Catalog, available: documents.data.map((row) => row.document_id) }
  },
  async pack(courseId) {
    const { data, error } = await client().from('study_packs').select('data').eq('course_id', courseId).maybeSingle()
    if (error) throw new Error('Không tải được bộ câu hỏi.')
    return (data?.data ?? null) as Pack | null
  },
  async attempts() {
    const { data, error } = await client().from('study_attempts')
      .select('id,user_id,course_id,revision,data,updated_at')
      .order('updated_at', { ascending: false })
    if (error) throw new Error('Không đồng bộ được lịch sử học tập.')
    return data as AttemptRow[]
  },
  async save(attempt) {
    const { data, error } = await client().rpc('save_study_attempt', {
      p_id: attempt.id,
      p_course_id: attempt.course_id,
      p_revision: attempt.revision,
      p_data: attempt.data,
    })
    if (error) throw new Error('Không đồng bộ được bài làm.')
    return data as SaveResponse
  },
  pdf: (documentId) => invoke<SignedPdf>('pdf-url', { documentId }),
  async tutor(attemptId, questionId) {
    const result = await invoke<{ feedback: Feedback }>('tutor-feedback', { attemptId, questionId })
    return result.feedback
  },
}
