const AuthLayout = ({ children, maxWidth = 'max-w-md' }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 py-8">
        <div className={`w-full ${maxWidth}`}>
          {/* Logo and Company Info */}
          <div className="text-center mb-6 sm:mb-8">
            <div className="flex justify-center mb-3 sm:mb-4">
              <img
                src="/logo.svg"
                alt="SynTask Logo"
                className="h-12 w-12 sm:h-16 sm:w-16 object-contain"
                onError={(e) => {
                  e.target.style.display = 'none'
                }}
              />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-primary-600 mb-2">
              SynTask
            </h1>
            <p className="text-sm sm:text-base text-gray-600">Task Management & Ticketing Platform</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">
              © 2025 SynTask. All Rights Reserved.
            </p>
          </div>

          {/* Auth Form Card */}
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 border border-gray-100">
            {children}
          </div>

          {/* Footer */}
          <div className="text-center mt-4 sm:mt-6 mb-4">
            <p className="text-xs sm:text-sm text-gray-500">
              Powered by <span className="font-semibold">Alphanexis</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout

