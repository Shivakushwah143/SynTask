import { Skeleton, SkeletonText } from './Skeleton'

export function SkeletonCard({ lines = 3, actions = false }) {
  return (
    <div className="card" role="status" aria-label="Loading content">
      <div className="mb-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1">
          <Skeleton className="mb-2 h-4 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <SkeletonText lines={lines} />
      {actions && (
        <div className="mt-4 flex gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-20 rounded-lg" />
        </div>
      )}
    </div>
  )
}
