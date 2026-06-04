const AuthLayout = ({ children, maxWidth = 'max-w-md' }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex items-center justify-center p-4">
      <div className={`w-full ${maxWidth}`}>
        {/* Logo and Company Info */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary-600 mb-2">
            Alphanexis
          </h1>
          <p className="text-gray-600">Task Management & Ticketing Platform</p>
          <p className="text-sm text-gray-500 mt-1">
            © 2025 Alphanexis Tech LLC. All Rights Reserved.
          </p>
        </div>

        {/* Auth Form Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {children}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-sm text-gray-500">
            Powered by <span className="font-semibold">Alphanexis Tech LLC</span>
          </p>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout

