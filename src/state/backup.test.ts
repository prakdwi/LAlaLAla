import { expect, it } from 'vitest'
import { backupDue, DAYS_BEFORE_REMINDER, EDITS_BEFORE_REMINDER } from './backup'

const day = 86_400_000

it('reminds after many edits, or after a week with some edits, unless snoozed', () => {
  const now = Date.now()
  expect(backupDue({ editsSince: 0, lastBackup: now, snoozedUntil: 0 }, now)).toBe(false)
  expect(backupDue({ editsSince: EDITS_BEFORE_REMINDER, lastBackup: now, snoozedUntil: 0 }, now)).toBe(true)
  expect(backupDue({ editsSince: 5, lastBackup: now - (DAYS_BEFORE_REMINDER + 1) * day, snoozedUntil: 0 }, now)).toBe(
    false,
  )
  expect(backupDue({ editsSince: 40, lastBackup: now - (DAYS_BEFORE_REMINDER + 1) * day, snoozedUntil: 0 }, now)).toBe(
    true,
  )
  expect(backupDue({ editsSince: 999, lastBackup: now, snoozedUntil: now + day }, now)).toBe(false)
})
