import { timeService } from '@/services/timeService'

function formatCarryForwardDuration(days) {
  if (days >= 30 && days % 30 === 0) {
    return `${days / 30} M`
  }
  return `${days} D`
}

/** Canonical Work due-date display: effective date plus responsive carry-forward label. */
export default function CarryForwardDueDate({ task, formatOptions, className = '' }) {
  const effectiveDue = task?.carry_forward_due_date
  const originalDue = task?.due_date
  const carriedDays = Number(task?.carry_forward_days || 0)
  const shownDue = effectiveDue || originalDue
  if (!shownDue) return <span className={className}>—</span>

  return <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
    <span>{timeService.format(shownDue, formatOptions || { month: 'short', day: 'numeric', year: 'numeric' })}</span>
    {effectiveDue && carriedDays > 0 ? <span className="inline-flex rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-700 dark:bg-primary-950/50 dark:text-primary-200" title={`Carry forwarded — ${formatCarryForwardDuration(carriedDays)}.`}><span className="hidden sm:inline">Carry forwarded — {formatCarryForwardDuration(carriedDays)}</span><span className="sm:hidden">CF</span></span> : null}
  </span>
}
