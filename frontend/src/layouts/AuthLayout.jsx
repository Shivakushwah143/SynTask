const AuthLayout = ({ children, maxWidth = 'max-w-md', showLeftBranding = true, previewImage = null }) => {
  return (
    <div className="flex min-h-screen bg-white dark:bg-gray-900">
      {/* Left Side - Branding with Preview */}
      {showLeftBranding && (
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460] flex-col items-center justify-between p-12 relative overflow-hidden">
          {/* Animated background particles */}
          <div className="absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl animate-pulse"></div>
            <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl animate-pulse delay-2000"></div>
            
            {/* Floating geometric shapes */}
            <div className="absolute top-20 left-10 w-16 h-16 border border-white/10 rounded-xl rotate-45 animate-float"></div>
            <div className="absolute bottom-32 right-10 w-12 h-12 border border-white/10 rounded-full animate-float-delayed"></div>
            <div className="absolute top-1/3 right-20 w-8 h-8 border border-white/10 rounded-lg rotate-12 animate-float-slow"></div>
            
            {/* Animated gradient orbs */}
            <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-gradient-to-r from-pink-500/20 to-purple-500/20 rounded-full blur-2xl animate-orbit"></div>
            <div className="absolute bottom-1/4 right-1/4 w-40 h-40 bg-gradient-to-l from-blue-500/20 to-indigo-500/20 rounded-full blur-2xl animate-orbit-delayed"></div>
          </div>

          {previewImage ? (
            // Show preview image with enhanced animations
            <div className="relative w-full h-full flex items-center justify-center z-10">
              {/* Glowing ring behind image */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-[90%] h-[90%] bg-gradient-to-r from-purple-500/10 via-blue-500/10 to-purple-500/10 rounded-full blur-3xl animate-spin-slow"></div>
              </div>
              
              {/* Floating particles around image */}
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-2 h-2 bg-purple-400 rounded-full animate-particle-float" style={{ animationDelay: '0s' }}></div>
                <div className="absolute top-1/3 right-1/4 w-3 h-3 bg-blue-400 rounded-full animate-particle-float" style={{ animationDelay: '0.5s' }}></div>
                <div className="absolute bottom-1/3 left-1/3 w-2 h-2 bg-pink-400 rounded-full animate-particle-float" style={{ animationDelay: '1s' }}></div>
                <div className="absolute bottom-1/4 right-1/3 w-2.5 h-2.5 bg-indigo-400 rounded-full animate-particle-float" style={{ animationDelay: '1.5s' }}></div>
                <div className="absolute top-1/2 left-1/2 w-1.5 h-1.5 bg-white rounded-full animate-particle-float" style={{ animationDelay: '2s' }}></div>
              </div>
              
              {/* Image container with effects */}
              <div className="relative w-full max-w-2xl mx-auto animate-float-slow">
                {/* Glow effect behind image */}
                <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 via-blue-500/20 to-purple-500/20 rounded-2xl blur-2xl animate-pulse"></div>
                
                {/* Image with multiple effects */}
                <div className="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-white/20 backdrop-blur-sm">
                  {/* Shimmer overlay */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full animate-shimmer"></div>
                  
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
                  <div className="absolute inset-0 rounded-2xl p-[2px] bg-gradient-to-r from-purple-500 via-blue-500 to-purple-500 animate-border-rotate">
                    <div className="absolute inset-[2px] rounded-2xl bg-gradient-to-br from-[#1a1a2e]/50 to-[#0f3460]/50"></div>
                  </div>
                </div>
                
                {/* Floating badges */}
                <div className="absolute -top-4 -right-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-bounce-slow">
                  ✨ Live Demo
                </div>
                <div className="absolute -bottom-4 -left-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg animate-float">
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
                    <p className="text-sm text-purple-200/80 animate-slide-up-delayed">Task Management & Ticketing Platform</p>
                  </div>
                </div>
                
                <div className="mt-16">
                  <h2 className="text-4xl font-bold text-white mb-4 animate-slide-up">
                    Manage Tasks, Tickets & Teams in One Place
                  </h2>
                  <p className="text-lg text-purple-200/80 animate-slide-up-delayed">
                    Streamline project execution, automate workflows, track tickets, manage teams, and improve productivity with a unified collaboration platform designed for modern organizations.
                  </p>
                </div>
              </div>

              {/* Bottom Partners */}
              <div className="w-full relative z-10 animate-fade-in">
                <p className="text-sm text-purple-200/80 mb-6">Trusted by leading companies</p>
                <div className="flex gap-6 flex-wrap items-center justify-center">
                  {['Google', 'Microsoft', 'Slack', 'AWS', 'Atlassian', 'Shopify'].map((company, index) => (
                    <span 
                      key={company}
                      className="text-white font-semibold text-sm hover:text-purple-200 transition-colors cursor-default animate-float"
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
      <div className={`flex w-full ${showLeftBranding ? 'lg:w-1/2' : ''} bg-white dark:bg-gray-900 flex-col items-center justify-center p-4 py-8`}>
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SynTask</h1>
          </div>

          {/* Form Container */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8 shadow-xl animate-fade-in-up">
            {children}
          </div>

          <div className="mb-4 mt-6 text-center animate-fade-in">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Powered by <span className="font-semibold text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 transition-colors">Alphanexis</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout