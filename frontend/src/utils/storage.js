/**
 * Storage utilities for auth tokens
 * Uses sessionStorage for normal sessions and localStorage only when
 * "remember me" is selected.
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

  if (session?.getItem(TOKEN_KEY) || session?.getItem(REFRESH_TOKEN_KEY)) return session
  if (local?.getItem(TOKEN_KEY) || local?.getItem(REFRESH_TOKEN_KEY)) return local
  return session || local
}

const getStorageForRememberMe = (rememberMe) => {
  if (rememberMe === true) return getLocalStorage()
  if (rememberMe === false) return getSessionStorage()
  return getActiveStorage()
}

export const saveAuthTokens = (accessToken, refreshToken, rememberMe) => {
  const targetStorage = getStorageForRememberMe(rememberMe)
  const inactiveStorage = targetStorage === getLocalStorage() ? getSessionStorage() : getLocalStorage()

  removeFromStorage(inactiveStorage)
  clearLegacyCookies()

  if (!targetStorage || !accessToken || !refreshToken) return

  targetStorage.setItem(TOKEN_KEY, accessToken)
  targetStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  if (typeof rememberMe === 'boolean') {
    targetStorage.setItem(REMEMBER_KEY, String(rememberMe))
  }
}

export const saveUserData = (user) => {
  const targetStorage = getActiveStorage()
  const inactiveStorage = targetStorage === getLocalStorage() ? getSessionStorage() : getLocalStorage()

  if (!targetStorage || !user) return

  inactiveStorage?.removeItem(USER_KEY)
  targetStorage.setItem(USER_KEY, JSON.stringify(user))
}

export const getAccessToken = () => {
  return getSessionStorage()?.getItem(TOKEN_KEY) || getLocalStorage()?.getItem(TOKEN_KEY) || null
}

export const getRefreshToken = () => {
  return getSessionStorage()?.getItem(REFRESH_TOKEN_KEY) || getLocalStorage()?.getItem(REFRESH_TOKEN_KEY) || null
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
  return !!(getAccessToken() && getRefreshToken() && getUserData())
}

export const getStoredAuthData = () => {
  const token = getAccessToken()
  const refreshToken = getRefreshToken()
  const user = getUserData()

  if (!token || !refreshToken || !user) {
    if (token || refreshToken || user) clearAuthStorage()
    return null
  }

  return { token, refreshToken, user }
}

export const updateAccessToken = (accessToken) => {
  const targetStorage = getActiveStorage()
  if (!targetStorage || !accessToken) return
  targetStorage.setItem(TOKEN_KEY, accessToken)
  clearLegacyCookies()
}
