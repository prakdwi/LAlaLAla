/**
 * Backup reminder. Everything lives in this browser's IndexedDB until cloud sync exists, so after
 * enough edits without a bundle export the app asks for one. State is a small localStorage record
 * (it is about this browser, not about any one project).
 */
import { useStudio } from './store'

const KEY = 'lalala-backup'
export const EDITS_BEFORE_REMINDER = 150
export const DAYS_BEFORE_REMINDER = 7
const MIN_EDITS_FOR_AGE_REMINDER = 20

type BackupRecord = { editsSince: number; lastBackup: number; snoozedUntil: number }

export function readBackup(): BackupRecord {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<BackupRecord> | null
    return {
      editsSince: Number(stored?.editsSince) || 0,
      lastBackup: Number(stored?.lastBackup) || Date.now(),
      snoozedUntil: Number(stored?.snoozedUntil) || 0,
    }
  } catch {
    return { editsSince: 0, lastBackup: Date.now(), snoozedUntil: 0 }
  }
}

function writeBackup(record: BackupRecord) {
  try {
    localStorage.setItem(KEY, JSON.stringify(record))
  } catch {
    /* storage unavailable: no reminder */
  }
}

export function backupDue(record = readBackup(), now = Date.now()) {
  if (record.snoozedUntil > now) return false
  const days = (now - record.lastBackup) / 86_400_000
  return (
    record.editsSince >= EDITS_BEFORE_REMINDER ||
    (days >= DAYS_BEFORE_REMINDER && record.editsSince >= MIN_EDITS_FOR_AGE_REMINDER)
  )
}

/** Call after a bundle export: the reminder resets. */
export function markBackedUp() {
  writeBackup({ editsSince: 0, lastBackup: Date.now(), snoozedUntil: 0 })
  useStudio.setState({ backupDue: false })
}

/** Hide the reminder for a day. */
export function snoozeBackup(hours = 24) {
  const record = readBackup()
  writeBackup({ ...record, snoozedUntil: Date.now() + hours * 3_600_000 })
  useStudio.setState({ backupDue: false })
}

/** Counts edits (store revisions) and raises the reminder flag when due. Returns an unsubscribe. */
export function watchBackup() {
  const record = readBackup()
  useStudio.setState({ backupDue: backupDue(record) })
  let pending = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const flush = () => {
    if (!pending) return
    const current = readBackup()
    current.editsSince += pending
    pending = 0
    writeBackup(current)
    if (backupDue(current) && !useStudio.getState().backupDue) useStudio.setState({ backupDue: true })
  }
  const unsubscribe = useStudio.subscribe((state, previous) => {
    if (state.revision === previous.revision || !state.ready) return
    pending++
    clearTimeout(timer)
    timer = setTimeout(flush, 1000)
  })
  return () => {
    clearTimeout(timer)
    flush()
    unsubscribe()
  }
}
