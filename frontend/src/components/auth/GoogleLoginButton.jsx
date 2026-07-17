const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

const GoogleLoginButton = ({ className = '' }) => {
  const googleEnabled = false

  if (!GOOGLE_CLIENT_ID || !googleEnabled) {
    return (
      <button
        type="button"
        disabled={!GOOGLE_CLIENT_ID}
        className={`flex min-h-11 w-full items-center justify-center rounded-xl border border-surface-border bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-500 ${className}`}
      >
        Google sign-in unavailable
      </button>
    )
  }
}

export default GoogleLoginButton
