import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { allowDemo, allowLocalLibrary, supabase } from './api'
import { getTrustedOwner, setTrustedOwner } from './storage'
import { Brand, Loading } from './ui'

type OwnerState = { state: 'checking' | 'anonymous' | 'denied' | 'error'; message?: string }
  | { state: 'owner'; userId: string }

export function useOnline() {
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const change = () => setOnline(navigator.onLine)
    window.addEventListener('online', change)
    window.addEventListener('offline', change)
    return () => {
      window.removeEventListener('online', change)
      window.removeEventListener('offline', change)
    }
  }, [])
  return online
}

export function useOwner(online: boolean) {
  const [owner, setOwner] = useState<OwnerState>({ state: 'checking' })

  useEffect(() => {
    const client = supabase
    if (!client) {
      setOwner({ state: 'anonymous' })
      return
    }
    if (!online) {
      const cached = getTrustedOwner()
      setOwner(cached ? { state: 'owner', userId: cached } : { state: 'anonymous' })
      return
    }

    let active = true
    let version = 0
    async function authorize(session: Session | null) {
      if (!active || !client) return
      const check = ++version
      if (!session) {
        setOwner({ state: 'anonymous' })
        return
      }
      const { data, error } = await client.rpc('is_study_owner')
      if (!active || check !== version) return
      if (error) {
        if (!error.code && getTrustedOwner() === session.user.id) {
          setOwner({ state: 'owner', userId: session.user.id })
        } else {
          setOwner({ state: 'error', message: 'Không xác minh được tài khoản. Hãy kiểm tra mạng và thử lại.' })
        }
      } else if (!data) {
        setTrustedOwner(null)
        setOwner({ state: 'denied', message: 'Tài khoản GitHub này chưa được cấp quyền học.' })
      } else {
        setTrustedOwner(session.user.id)
        setOwner({ state: 'owner', userId: session.user.id })
      }
    }

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        window.setTimeout(() => { void authorize(session) }, 0)
      }
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [online])

  const back = new URLSearchParams(location.search)
  const callbackError = back.has('error') || back.has('error_description')
    ? 'Đăng nhập chưa hoàn tất. Hãy thử lại.'
    : undefined
  return { owner, callbackError }
}

export async function signOut() {
  setTrustedOwner(null)
  const result = await supabase?.auth.signOut({ scope: 'local' })
  if (result?.error) {
    try { localStorage.removeItem('webhoctap-auth-v1') } catch { /* session is also abandoned on reload */ }
    location.reload()
  }
}

export function Login({
  owner, online, callbackError, startDemo, startLocal,
}: {
  owner: OwnerState
  online: boolean
  callbackError?: string
  startDemo(): void
  startLocal(): void
}) {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function logIn() {
    if (!supabase || !online) return
    setPending(true)
    setError('')
    try {
      const redirectTo = new URL(import.meta.env.BASE_URL, location.origin).href
      const result = await supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo } })
      if (result.error) throw result.error
    } catch {
      setError('Không mở được trang đăng nhập GitHub. Bạn có thể thử lại.')
      setPending(false)
    }
  }

  return (
    <main className="login-page">
      <header className="login-top"><Brand /></header>
      <div className="login-layout">
        <div className="login-intro">
          <h1>Ôn tập Kinh tế TMU</h1>
          <p>Đọc tài liệu, làm bài theo chủ đề và tiếp tục trên điện thoại từ đúng bài đang học.</p>
        </div>
        <section className="login-card card" aria-label="Đăng nhập">
          <div className="login-mark" aria-hidden="true">↗</div>
          <h2>Vào góc học tập</h2>
          <p>Dùng tài khoản GitHub đã được cấp quyền để mở thư viện và đồng bộ bài làm.</p>
          {owner.state === 'checking' ? (
            <Loading label="Đang kiểm tra đăng nhập…" />
          ) : owner.state === 'denied' ? (
            <button className="button primary" onClick={() => void signOut()}>Đổi tài khoản</button>
          ) : (
            <button className="button primary" disabled={pending || !online || !supabase} onClick={() => void logIn()}>
              {pending ? 'Đang mở GitHub…' : 'Đăng nhập bằng GitHub'} <span aria-hidden="true">→</span>
            </button>
          )}
          {(error || callbackError || ('message' in owner && owner.message)) && (
            <p className="inline-notice" role="alert">{error || callbackError || ('message' in owner && owner.message)}</p>
          )}
          {!online && <p className="small muted">Hãy kết nối mạng để đăng nhập lần đầu.</p>}
          {!supabase && <p className="small muted">Cần kết nối Supabase để đăng nhập.</p>}
          {allowLocalLibrary && <button className="text-button" onClick={startLocal}>Mở học liệu trên máy này</button>}
          {allowDemo && <button className="text-button" onClick={startDemo}>Mở bản thử với dữ liệu mẫu</button>}
        </section>
      </div>
    </main>
  )
}
