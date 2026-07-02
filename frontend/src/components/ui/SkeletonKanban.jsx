import { Skeleton } from './Skeleton'

export function SkeletonKanban({ cols = 4 }) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4" role="status" aria-label="Loading board">
      {Array.from({ length: cols }).map((_, colIndex) => (
        <div key={colIndex} className="card w-72 flex-none">
          <Skeleton className="mb-4 h-5 w-24" />
          {Array.from({ length: 3 }).map((_, cardIndex) => (
            <div key={cardIndex} className="mb-3 rounded-xl border border-surface-border bg-white p-3 last:mb-0 dark:border-gray-800 dark:bg-gray-950">
              <Skeleton className="mb-2 h-4 w-full" />
              <Skeleton className="mb-3 h-4 w-3/4" />
              <div className="flex gap-2">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
