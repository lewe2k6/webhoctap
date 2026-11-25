import { useEffect, useState } from 'react'

export type Route =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'history' }
  | { name: 'course'; courseId: string }
  | { name: 'attempt'; attemptId: string }
  | { name: 'pdf'; courseId: string; sourceId: string; page: number }

export const courseLink = (id: string) => '#/mon/' + encodeURIComponent(id)
export const attemptLink = (id: string) => '#/bai/' + encodeURIComponent(id)
export const pdfLink = (courseId: string, sourceId: string, page = 1) =>
  courseLink(courseId) + '/pdf/' + encodeURIComponent(sourceId) + '/' + page

function readRoute(): Route {
  try {
    const parts = location.hash.slice(1).split('/').filter(Boolean).map(decodeURIComponent)
    if (parts[0] === 'thu-vien') return { name: 'library' }
    if (parts[0] === 'lich-su') return { name: 'history' }
    if (parts[0] === 'bai' && parts[1]) return { name: 'attempt', attemptId: parts[1] }
    if (parts[0] === 'mon' && parts[1]) {
      if (parts[2] === 'pdf' && parts[3]) {
        return { name: 'pdf', courseId: parts[1], sourceId: parts[3], page: Math.max(1, Math.trunc(Number(parts[4])) || 1) }
      }
      return { name: 'course', courseId: parts[1] }
    }
  } catch {
    // Malformed links go back to the dashboard.
  }
  return { name: 'home' }
}

export function useRoute() {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const listener = () => {
      setRoute(readRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', listener)
    return () => window.removeEventListener('hashchange', listener)
  }, [])
  return route
}
