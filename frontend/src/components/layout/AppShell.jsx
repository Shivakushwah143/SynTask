export function AppShell({ sidebar, header, children }) {
  return (
    <div className="relative flex min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.06),_transparent_28%),linear-gradient(180deg,rgba(249,250,251,1)_0%,rgba(244,247,251,1)_100%)] text-gray-900 dark:bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.10),_transparent_24%),linear-gradient(180deg,rgba(2,6,23,1)_0%,rgba(15,23,42,1)_100%)] dark:text-gray-100">
      {sidebar}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {header}
        <main className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  )
}
