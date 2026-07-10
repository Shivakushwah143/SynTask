export function AppShell({ sidebar, header, children }) {
  return (
    <div className="relative flex min-h-screen w-full max-w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(229,106,31,0.08),_transparent_26%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.05),_transparent_24%),linear-gradient(180deg,rgba(248,242,232,1)_0%,rgba(239,230,216,1)_100%)] text-text-primary dark:bg-[radial-gradient(circle_at_top_left,_rgba(229,106,31,0.12),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.06),_transparent_24%),linear-gradient(180deg,rgba(15,13,11,1)_0%,rgba(18,16,14,1)_100%)] dark:text-gray-100">
      {sidebar}
      <div className="relative flex min-w-0 flex-1 flex-col">
        {header}
        <main className="min-w-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
          {children}
        </main>
      </div>
    </div>
  )
}
