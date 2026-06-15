export function Skeleton({ className = '' }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-gray-200 ${className}`} />
}

export function SkeletonText({ lines = 1, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={`h-4 ${index === lines - 1 && lines > 1 ? 'w-3/4' : 'w-full'}`}
        />
      ))}
    </div>
  )
}
