import { HelpCircle, ChevronDown } from 'lucide-react'

/**
 * Card shell that matches the reference design:
 * - white/dark surface, soft rounded corners, subtle border
 * - title + info tooltip icon on the left
 * - a period selector ("This Fiscal Year") on the right
 */
export const ChartCard = ({ title, period = 'This Fiscal Year', onPeriodClick, right, children, className = '' }) => {
  return (
    <div className={`rounded-2xl border border-surface-border bg-surface/95 dark:border-[var(--color-app-border)] dark:bg-[var(--color-app-surface)] ${className}`}>
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-4 dark:border-[var(--color-app-border)]">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[15px] font-semibold text-text-primary dark:text-[var(--color-app-text)]">{title}</h3>
          <HelpCircle className="h-3.5 w-3.5 text-text-muted dark:text-[var(--color-app-text-muted)]" />
        </div>
        {right ?? (
          <button
            type="button"
            onClick={onPeriodClick}
            className="flex items-center gap-1 rounded-full px-2 py-1 text-sm text-text-secondary transition-colors hover:bg-surface-muted hover:text-text-primary dark:text-[var(--color-app-text-muted)] dark:hover:bg-[var(--color-app-surface-muted)] dark:hover:text-[var(--color-app-text)]"
          >
            {period}
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default ChartCard
