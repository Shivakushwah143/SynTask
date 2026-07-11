export function RecruitmentStatCard({ label, value, icon: Icon, helper }) {
  return (
    <div className="rounded-3xl border border-surface-border bg-surface p-5 shadow-card dark:border-gray-800 dark:bg-gray-950">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-text-muted">{label}</p>
          <p className="mt-2 text-3xl font-bold text-text-primary">{value ?? 0}</p>
          {helper ? <p className="mt-2 text-xs text-text-muted">{helper}</p> : null}
        </div>
        {Icon ? (
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-100 text-primary-700 dark:bg-primary-950/60 dark:text-primary-200">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
