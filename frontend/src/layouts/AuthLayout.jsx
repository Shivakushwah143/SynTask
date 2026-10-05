import { TEAM_IMAGE } from '../config/visualAssets'

const AuthLayout = ({ children, maxWidth = 'max-w-md', showLeftBranding = true, previewImage = null }) => {
  return (
    <div className="flex min-h-screen bg-surface-muted dark:bg-black">
      {/* Left Side - Branding with Preview */}
      {showLeftBranding && (
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-black via-[#171411] to-[#231e19] p-12 lg:flex lg:w-1/2 flex-col items-center justify-between">
          {/* Single subtle ambient glow — no particles, no floating shapes */}
          <div aria-hidden="true" className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />

          {previewImage ? (
            // One clearly visible workplace/team image + compact real product preview
            <div className="relative z-10 flex w-full max-w-2xl flex-1 flex-col items-center justify-center">
              <div className="w-full">
                <div className="relative mb-8 flex items-center gap-3">
                  <img
                    src="/logo.svg"
                    alt="SynTask Logo"
                    className="h-10 w-10 object-contain"
                    onError={(event) => { event.currentTarget.style.display = 'none' }}
                  />
                  <div>
                    <h1 className="text-xl font-bold text-white">SynTask</h1>
                    <p className="text-sm text-orange-200/80">One workspace for your entire company</p>
                  </div>
                </div>
                <img
                  src={TEAM_IMAGE.src}
                  alt={TEAM_IMAGE.alt}
                  loading={TEAM_IMAGE.loading}
                  width="1200"
                  height="500"
                  className="aspect-[12/5] w-full rounded-2xl object-cover shadow-2xl ring-1 ring-white/15"
                />
                <div className="mt-4 overflow-hidden rounded-xl shadow-xl ring-1 ring-white/10">
                  <img
                    src={previewImage}
                    alt="SynTask product preview"
                    loading="lazy"
                    className="h-auto w-full object-cover"
                  />
                </div>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/70">
                  <span className="flex items-center gap-2"><span className="text-orange-300">✓</span> Tasks, CRM & Projects</span>
                  <span className="flex items-center gap-2"><span className="text-orange-300">✓</span> HR, Attendance & Payroll</span>
                  <span className="flex items-center gap-2"><span className="text-orange-300">✓</span> Executive AI</span>
                </div>
              </div>
            </div>
          ) : (
            // Branding content (no preview image supplied)
            <>
              {/* Top Content */}
              <div className="w-full relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 shadow-2xl">
                    <img
                      src="/logo.svg"
                      alt="SynTask Logo"
                      className="h-10 w-10 object-contain"
                      onError={(event) => {
                        event.currentTarget.style.display = 'none'
                      }}
                    />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white">SynTask</h1>
                    <p className="text-sm text-orange-200/80">Task Management & Ticketing Platform</p>
                  </div>
                </div>

                <div className="mt-16">
                  <h2 className="text-4xl font-bold text-white mb-4">
                    Manage Tasks, Tickets & Teams in One Place
                  </h2>
                  <p className="text-lg text-orange-200/80">
                    Streamline project execution, automate workflows, track tickets, manage teams, and improve productivity with a unified collaboration platform designed for modern organizations.
                  </p>
                </div>
              </div>

              {/* Bottom Partners */}
              <div className="w-full relative z-10">
                <p className="mb-6 text-sm text-orange-200/80">Trusted by leading companies</p>
                <div className="flex gap-6 flex-wrap items-center justify-center">
                  {['Google', 'Microsoft', 'Slack', 'AWS', 'Atlassian', 'Shopify'].map((company) => (
                    <span key={company} className="cursor-default text-sm font-semibold text-white transition-colors hover:text-orange-200">
                      {company}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Right Side - Form */}
      <div className={`flex w-full ${showLeftBranding ? 'lg:w-1/2' : ''} bg-surface-muted dark:bg-black flex-col items-center justify-center p-4 py-8`}>
        <div className={`w-full ${maxWidth}`}>
          {/* Mobile Logo (shown on mobile only) */}
          <div className="mb-8 text-center lg:hidden">
            <div className="mb-3 flex justify-center">
              <img
                src="/logo.svg"
                alt="SynTask Logo"
                className="h-10 w-10 object-contain"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            </div>
            <h1 className="text-2xl font-bold text-text-primary dark:text-white">SynTask</h1>
          </div>

          {/* Form Container */}
          <div className="rounded-2xl border border-surface-border bg-surface dark:border-gray-800 dark:bg-black p-6 shadow-xl sm:p-8">
            {children}
          </div>

          <div className="mb-4 mt-6 text-center">
            <p className="text-xs text-text-muted dark:text-gray-400">
              Powered by <span className="font-semibold text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-300 dark:hover:text-primary-200">Alphanexis</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout