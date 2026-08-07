export function SynzinAvatar({ size = 'sm', className = '' }) {
  const sizeClass =
  size === 'lg'
    ? 'h-12 w-12 text-base'
    : size === 'xs'
      ? 'h-6 w-6 text-xs'
      : 'h-10 w-10 text-xs';
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 via-amber-400 to-orange-600 font-black text-white shadow-sm shadow-orange-500/25 ${sizeClass} ${className}`}
      aria-hidden="true"
    >
      <span className="absolute top-1 h-1 w-1 rounded-full bg-white/90" />
      <span className="mt-1">Sz</span>
    </span>
  )
}
