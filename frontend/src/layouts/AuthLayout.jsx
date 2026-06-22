const AuthLayout = ({ children, maxWidth = 'max-w-md', showLeftBranding = true, previewImage = null }) => {
  return (
    <div className="app-shell flex min-h-screen">
      {/* Left Side - Branding with Preview */}
      {showLeftBranding && (
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-950 via-primary-900 to-indigo-700 flex-col items-center justify-between p-12 relative overflow-hidden">
          {/* Decorative background elements */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-10 right-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
            <div className="absolute bottom-10 left-10 w-72 h-72 bg-white rounded-full blur-3xl"></div>
          </div>

          {previewImage ? (
            // Show preview image
            <div className="relative w-full h-full flex items-center justify-center">
              <img
                src={previewImage}
                alt="SynTask Preview"
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            // Show branding content
            <>
              {/* Top Content */}
              <div className="w-full relative z-10">
                <div className="flex items-center gap-3 mb-8">
                  <img
                    src="/logo.svg"
                    alt="SynTask Logo"
                    className="h-10 w-10 object-contain"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none'
                    }}
                  />
                  <div>
                    <h1 className="text-2xl font-bold text-white">SynTask</h1>
                    <p className="text-sm text-purple-100">Task Management & Ticketing Platform</p>
                  </div>
                </div>
                
                <div className="mt-16">
                  <h2 className="text-4xl font-bold text-white mb-4">Manage Tasks, Tickets & Teams in One Place</h2>
                  <p className="text-lg text-purple-100">Streamline project execution, automate workflows, track tickets, manage teams, and improve productivity with a unified collaboration platform designed for modern organizations.</p>
                </div>
              </div>

              {/* Bottom Partners */}
              <div className="w-full relative z-10">
                <p className="text-sm text-purple-100 mb-6">Trusted by leading companies</p>
                <div className="flex gap-6 flex-wrap items-center justify-center">
                  <span className="text-white font-semibold text-sm">Google</span>
                  <span className="text-white font-semibold text-sm">Microsoft</span>
                  <span className="text-white font-semibold text-sm">Slack</span>
                  <span className="text-white font-semibold text-sm">AWS</span>
                  <span className="text-white font-semibold text-sm">Atlassian</span>
                  <span className="text-white font-semibold text-sm">Shopify</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Right Side - Form */}
      <div className={`flex w-full ${showLeftBranding ? 'lg:w-1/2' : ''} flex-col items-center justify-center p-4 py-8`}>
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SynTask</h1>
          </div>

          {/* Form Container */}
          <div className="app-surface rounded-2xl p-6 sm:p-8">
            {children}
          </div>

          <div className="mb-4 mt-6 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Powered by <span className="font-semibold">Alphanexis</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout

