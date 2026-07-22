const AuthLayout = ({ children, maxWidth = 'max-w-md', showLeftBranding = true, previewImage = null }) => {
  return (
    <div className="flex min-h-screen bg-surface-muted dark:bg-black">
      {/* Left Side - Branding with Preview */}
      {showLeftBranding && (
        <div className="relative hidden overflow-hidden bg-gradient-to-br from-black via-[#171411] to-[#231e19] p-12 lg:flex lg:w-1/2 flex-col items-center justify-between">
          {/* Animated background particles */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-orange-500/18 blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-blue-500/16 blur-3xl animate-pulse delay-1000"></div>
            <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-green-500/8 blur-3xl animate-pulse delay-2000"></div>
            
            {/* Floating geometric shapes */}
            <div className="absolute left-10 top-20 h-16 w-16 rotate-45 rounded-xl border border-white/10 animate-float"></div>
            <div className="absolute bottom-32 right-10 h-12 w-12 rounded-full border border-white/10 animate-float-delayed"></div>
            <div className="absolute right-20 top-1/3 h-8 w-8 rotate-12 rounded-lg border border-white/10 animate-float-slow"></div>
            
            {/* Animated gradient orbs */}
            <div className="absolute left-1/4 top-1/4 h-32 w-32 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 blur-2xl animate-orbit"></div>
            <div className="absolute bottom-1/4 right-1/4 h-40 w-40 rounded-full bg-gradient-to-l from-blue-500/18 to-green-500/14 blur-2xl animate-orbit-delayed"></div>
          </div>

          {previewImage ? (
            // Show preview image with enhanced animations
            <div className="relative w-full h-full flex items-center justify-center z-10">
              {/* Glowing ring behind image */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="h-[90%] w-[90%] rounded-full bg-gradient-to-r from-orange-500/10 via-blue-500/10 to-green-500/10 blur-3xl animate-spin-slow"></div>
              </div>
              
              {/* Floating particles around image */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute left-1/4 top-1/4 h-2 w-2 rounded-full bg-orange-400 animate-particle-float" style={{ animationDelay: '0s' }}></div>
                <div className="absolute right-1/4 top-1/3 h-3 w-3 rounded-full bg-blue-400 animate-particle-float" style={{ animationDelay: '0.5s' }}></div>
                <div className="absolute bottom-1/3 left-1/3 h-2 w-2 rounded-full bg-green-400 animate-particle-float" style={{ animationDelay: '1s' }}></div>
                <div className="absolute bottom-1/4 right-1/3 h-2.5 w-2.5 rounded-full bg-red-400 animate-particle-float" style={{ animationDelay: '1.5s' }}></div>
                <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-white rounded-full animate-particle-float" style={{ animationDelay: '2s' }}></div>
              </div>
              
              {/* Image container with effects */}
              <div className="relative w-full max-w-2xl mx-auto animate-float-slow">
                {/* Glow effect behind image */}
                <div className="absolute -inset-4 rounded-2xl bg-gradient-to-r from-orange-500/20 via-blue-500/20 to-green-500/20 blur-2xl animate-pulse"></div>
                
                {/* Image with multiple effects */}
                <div className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/15 backdrop-blur-sm">
                  {/* Shimmer overlay */}
                  <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"></div>
                  
                  {/* Image */}
                  <img
                    src={previewImage}
                    alt="SynTask Preview"
                    className="w-full h-full object-contain relative z-10 transform transition-transform duration-700 hover:scale-105"
                    style={{ 
                      filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.3))',
                    }}
                  />
                  
                  {/* Border gradient animation */}
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-orange-500 via-blue-500 to-green-500 p-[2px] animate-border-rotate">
                    <div className="absolute inset-[2px] rounded-2xl bg-gradient-to-br from-black/70 to-[#1a1714]/70"></div>
                  </div>
                </div>
                
                {/* Floating badges */}
                <div className="absolute -right-4 -top-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg animate-bounce-slow">
                  ✨ Live Demo
                </div>
                <div className="absolute -bottom-4 -left-4 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-3 py-1.5 text-xs font-bold text-white shadow-lg animate-float">
                  🚀 New Update
                </div>
              </div>
              
              {/* Caption with animation */}
              <div className="absolute bottom-8 left-0 right-0 text-center z-10 animate-fade-in-up">
                <p className="text-white/80 text-sm tracking-wider font-light">
                  <span className="inline-block animate-pulse mr-2">✦</span>
                  Experience the future of task management
                  <span className="inline-block animate-pulse ml-2">✦</span>
                </p>
              </div>
            </div>
          ) : (
            // Show branding content (existing code)
            <>
              {/* Top Content */}
              <div className="w-full relative z-10 animate-fade-in-up">
                <div className="flex items-center gap-3 mb-8">
                  <div className="p-2 bg-white/10 backdrop-blur-sm rounded-xl border border-white/20 shadow-2xl animate-float-slow">
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
                    <h1 className="text-2xl font-bold text-white animate-slide-up">SynTask</h1>
                    <p className="text-sm text-orange-200/80 animate-slide-up-delayed">Task Management & Ticketing Platform</p>
                  </div>
                </div>
                
                <div className="mt-16">
                  <h2 className="text-4xl font-bold text-white mb-4 animate-slide-up">
                    Manage Tasks, Tickets & Teams in One Place
                  </h2>
                    <p className="text-lg text-orange-200/80 animate-slide-up-delayed">
                    Streamline project execution, automate workflows, track tickets, manage teams, and improve productivity with a unified collaboration platform designed for modern organizations.
                  </p>
                </div>
              </div>

              {/* Bottom Partners */}
              <div className="w-full relative z-10 animate-fade-in">
                <p className="mb-6 text-sm text-orange-200/80">Trusted by leading companies</p>
                <div className="flex gap-6 flex-wrap items-center justify-center">
                  {['Google', 'Microsoft', 'Slack', 'AWS', 'Atlassian', 'Shopify'].map((company, index) => (
                    <span 
                      key={company}
                      className="cursor-default text-sm font-semibold text-white transition-colors hover:text-orange-200 animate-float"
                      style={{ animationDelay: `${index * 0.2}s` }}
                    >
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
          <div className="mb-8 text-center lg:hidden animate-fade-in-up">
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
          <div className="rounded-2xl border border-surface-border bg-surface dark:border-gray-800 dark:bg-black p-6 shadow-xl animate-fade-in-up sm:p-8">
            {children}
          </div>

          <div className="mb-4 mt-6 text-center animate-fade-in">
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
