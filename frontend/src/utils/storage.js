/**
 * Storage utilities for auth tokens
 * Auth tokens are intentionally not persisted in web storage. The backend
 * sets httpOnly cookies; these helpers only keep non-sensitive user state.
 */

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const USER_KEY = 'auth_user'
const REMEMBER_KEY = 'auth_remember_me'

const getSessionStorage = () => (typeof window === 'undefined' ? null : window.sessionStorage)
const getLocalStorage = () => (typeof window === 'undefined' ? null : window.localStorage)

const removeFromStorage = (storage) => {
  if (!storage) return
  storage.removeItem(TOKEN_KEY)
  storage.removeItem(REFRESH_TOKEN_KEY)
  storage.removeItem(USER_KEY)
  storage.removeItem(REMEMBER_KEY)
}

const deleteLegacyCookie = (name) => {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`
}

const clearLegacyCookies = () => {
  deleteLegacyCookie(TOKEN_KEY)
  deleteLegacyCookie(REFRESH_TOKEN_KEY)
}

const getActiveStorage = () => {
  const session = getSessionStorage()
  const local = getLocalStorage()

  if (session?.getItem(USER_KEY)) return session
  if (local?.getItem(USER_KEY)) return local
  return session || local
}

const getStorageForRememberMe = (rememberMe) => {
  if (rememberMe === true) return getLocalStorage()
  if (rememberMe === false) return getSessionStorage()
  return getActiveStorage()
}

export const saveAuthTokens = (_accessToken, _refreshToken, rememberMe) => {
  const targetStorage = getStorageForRememberMe(rememberMe)
  const inactiveStorage = targetStorage === getLocalStorage() ? getSessionStorage() : getLocalStorage()

  removeFromStorage(inactiveStorage)
  clearLegacyCookies()
  targetStorage?.removeItem(TOKEN_KEY)
  targetStorage?.removeItem(REFRESH_TOKEN_KEY)
  if (targetStorage && typeof rememberMe === 'boolean') {
    targetStorage.setItem(REMEMBER_KEY, String(rememberMe))
  }
}

export const saveUserData = (user, rememberMe) => {
  const targetStorage = getStorageForRememberMe(rememberMe)
  const inactiveStorage = targetStorage === getLocalStorage() ? getSessionStorage() : getLocalStorage()

  if (!targetStorage || !user) return

  inactiveStorage?.removeItem(USER_KEY)
  targetStorage.setItem(USER_KEY, JSON.stringify(user))
}

export const getAccessToken = () => {
  return null
}

export const getRefreshToken = () => {
  return null
}

export const getUserData = () => {
  const storedUser = getSessionStorage()?.getItem(USER_KEY) || getLocalStorage()?.getItem(USER_KEY)
  if (!storedUser) return null

  try {
    return JSON.parse(storedUser)
  } catch {
    clearAuthStorage()
    return null
  }
}

export const clearAuthStorage = () => {
  removeFromStorage(getSessionStorage())
  removeFromStorage(getLocalStorage())
  clearLegacyCookies()
}

export const hasAuthData = () => {
  return !!getUserData()
}

export const getStoredAuthData = () => {
  const token = getAccessToken()
  const refreshToken = getRefreshToken()
  const user = getUserData()

  if (!user) {
    if (token || refreshToken) clearAuthStorage()
    return null
  }

  return { token, refreshToken, user }
}

export const updateAccessToken = (_accessToken) => {
  void _accessToken
  clearLegacyCookies()
}
