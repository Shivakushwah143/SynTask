import { HelpCircle, ChevronDown } from 'lucide-react'

/**
 * Card shell that matches the reference design:
 * - white/dark surface, soft rounded corners, subtle border
 * - title + info tooltip icon on the left
 * - a period selector ("This Fiscal Year") on the right
 */
export const ChartCard = ({ title, period = 'This Fiscal Year', onPeriodClick, right, children, className = '' }) => {
  return (
    <div className={`rounded-2xl border border-surface-border bg-surface/95 dark:border-gray-800 dark:bg-black ${className}`}>
      <div className="flex items-center justify-between border-b border-surface-border px-5 py-4 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          <h3 className="text-[15px] font-semibold text-text-primary dark:text-gray-100">{title}</h3>
          <HelpCircle className="h-3.5 w-3.5 text-text-muted" />
        </div>
        {right ?? (
          <button
            type="button"
            onClick={onPeriodClick}
            className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary dark:text-gray-400 dark:hover:text-gray-200"
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
