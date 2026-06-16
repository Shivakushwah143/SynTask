const AuthLayout = ({ children, maxWidth = 'max-w-md' }) => {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-primary-50 via-white to-primary-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
      <div className="flex flex-1 items-center justify-center p-4 py-8">
        <div className={`w-full ${maxWidth}`}>
          <div className="mb-6 text-center sm:mb-8">
            <div className="mb-3 flex justify-center sm:mb-4">
              <img
                src="/logo.svg"
                alt="SynTask Logo"
                className="h-12 w-12 object-contain sm:h-16 sm:w-16"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            </div>
            <h1 className="mb-2 text-2xl font-bold text-primary-600 sm:text-3xl">
              SynTask
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-300 sm:text-base">Task Management & Ticketing Platform</p>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
              Copyright 2025 SynTask. All Rights Reserved.
            </p>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-xl dark:border-gray-800 dark:bg-gray-900 dark:shadow-none sm:p-8">
            {children}
          </div>

          <div className="mb-4 mt-4 text-center sm:mt-6">
            <p className="text-xs text-gray-500 dark:text-gray-400 sm:text-sm">
              Powered by <span className="font-semibold">Alphanexis</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AuthLayout
