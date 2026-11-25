import type { StudyApi } from './api'
import type { SavedAttempt } from './types'

export function localAttempts(): Pick<StudyApi, 'attempts' | 'save'> {
  const records = new Map<string, SavedAttempt>()
  return {
    async attempts() { return [...records.values()] },
    async save(row) {
      const current = records.get(row.id)
      if (current && current.revision !== row.revision) return { applied: false, attempt: current }
      const updated = { ...row, revision: row.revision + 1, pending: false }
      records.set(row.id, updated)
      return { applied: true, attempt: updated }
    },
  }
}
