export function RecruitmentTabs({ tabs, activeTab, onChange }) {
  return (
    <div className="mb-5 overflow-x-auto border-b border-surface-border dark:border-gray-800">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={`rounded-t-2xl px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500/30 ${
              activeTab === tab.key
                ? "bg-primary-50 text-primary-700 dark:bg-primary-950/40 dark:text-primary-200"
                : "text-text-muted hover:bg-surface-muted hover:text-text-primary"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
