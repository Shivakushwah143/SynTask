import { Skeleton } from './Skeleton'

export function SkeletonTable({ rows = 5, cols = 5 }) {
  return (
    <div className="card overflow-hidden p-0" role="status" aria-label="Loading table">
      <div className="border-b border-surface-border bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-950">
        <div className="flex gap-4">
          {Array.from({ length: cols }).map((_, index) => (
            <Skeleton key={index} className="h-4 flex-1" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-surface-border p-4 last:border-0 dark:border-gray-800">
          {Array.from({ length: cols }).map((_, colIndex) => (
            <Skeleton key={colIndex} className={`h-4 flex-1 ${colIndex === 0 ? 'basis-1/3' : ''}`} />
          ))}
        </div>
      ))}
    </div>
  )
}
