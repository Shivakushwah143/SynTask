import { eachDayOfInterval, isWeekend } from 'date-fns'
import { timeService } from '@/services/timeService'

// Estimate working hours between now and a due date (8h workday, exclude weekends).
// Returns 0 for invalid/past dates, and never returns 0 for a future date so the
// Estimated Hours field always gets a usable suggestion (min 1h).
export const estimateWorkingHoursUntil = (dueIso, nowIso = timeService.now()) => {
  const now = timeService.instant(nowIso)
  const due = timeService.instant(dueIso)
  if (!now || Number.isNaN(now.getTime()) || !due || Number.isNaN(due.getTime())) return 0
  if (due <= now) return 0

  // Clone the instants before mutating hours — timeService.instant returns the
  // same Date reference for Date inputs, and setHours would corrupt the caller's values.
  const startDay = new Date(now.getTime())
  startDay.setHours(0, 0, 0, 0)
  const endDay = new Date(due.getTime())
  endDay.setHours(0, 0, 0, 0)

  let days
  try {
    days = eachDayOfInterval({ start: startDay, end: endDay })
  } catch {
    return 0
  }

  let total = 0
  days.forEach((day, idx) => {
    if (isWeekend(day)) return
    // Clone day before mutating — timeService.instant returns the same Date
    // reference for Date inputs, so workStart/workEnd would otherwise alias
    // each other (and the day object) and end up with the same time.
    const workStart = new Date(day.getTime())
    workStart.setHours(9, 0, 0, 0)
    const workEnd = new Date(day.getTime())
    workEnd.setHours(17, 0, 0, 0)
    if (idx === 0) {
      const start = now > workStart ? now : workStart
      const end = days.length === 1 ? Math.min(due, workEnd) : workEnd
      total += Math.max(0, (end - start) / 3600000)
    } else if (idx === days.length - 1) {
      const end = Math.min(due, workEnd)
      total += Math.max(0, (end - workStart) / 3600000)
    } else {
      total += 8
    }
  })

  const rounded = Math.round(total * 100) / 100
  // Future dates always yield at least 1h so the field is never left at 0.
  return rounded > 0 ? Math.max(1, Math.round(rounded)) : 1
}
