import { X } from "lucide-react";

export function RecruitmentDrawer({ open, title, description, onClose, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} role="presentation" />
      <aside className="relative flex h-full w-full max-w-2xl flex-col overflow-hidden bg-white shadow-modal dark:bg-gray-950">
        <header className="flex items-start justify-between gap-4 border-b border-surface-border px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">{title}</h2>
            {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-text-muted hover:bg-surface-muted" aria-label="Close drawer">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
        {footer ? <footer className="border-t border-surface-border p-4 dark:border-gray-800">{footer}</footer> : null}
      </aside>
    </div>
  );
}
