/**
 * Storage utilities for auth tokens
 * Stores tokens in both localStorage and cookies for persistence
 */

const TOKEN_KEY = 'auth_token'
const REFRESH_TOKEN_KEY = 'refresh_token'
const USER_KEY = 'auth_user'

/**
 * Set cookie with optional expiration
 */
export const setCookie = (name, value, days = 7) => {
  const date = new Date()
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
  const expires = `expires=${date.toUTCString()}`
  document.cookie = `${name}=${encodeURIComponent(value)};${expires};path=/;SameSite=Lax`
}

/**
 * Get cookie value
 */
export const getCookie = (name) => {
  const nameEQ = name + '='
  const cookies = document.cookie.split(';')
  for (let i = 0; i < cookies.length; i++) {
    let cookie = cookies[i].trim()
    if (cookie.indexOf(nameEQ) === 0) {
      return decodeURIComponent(cookie.substring(nameEQ.length))
    }
  }
  return null
}

/**
 * Delete cookie
 */
export const deleteCookie = (name) => {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`
}

/**
 * Save auth tokens to both localStorage and cookies
 */
export const saveAuthTokens = (accessToken, refreshToken, rememberMe = false) => {
  // Always save to localStorage for this session
  localStorage.setItem(TOKEN_KEY, accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
  
  // Save to cookies if rememberMe is enabled (7 days), otherwise session cookie
  const cookieDays = rememberMe ? 30 : 0 // 0 = session cookie
  setCookie(TOKEN_KEY, accessToken, cookieDays)
  setCookie(REFRESH_TOKEN_KEY, refreshToken, cookieDays)
}

/**
 * Save user data to localStorage
 */
export const saveUserData = (user) => {
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

/**
 * Get access token from storage (localStorage or cookies)
 */
export const getAccessToken = () => {
  return localStorage.getItem(TOKEN_KEY) || getCookie(TOKEN_KEY)
}

/**
 * Get refresh token from storage
 */
export const getRefreshToken = () => {
  return localStorage.getItem(REFRESH_TOKEN_KEY) || getCookie(REFRESH_TOKEN_KEY)
}

/**
 * Get user data from localStorage
 */
export const getUserData = () => {
  const user = localStorage.getItem(USER_KEY)
  return user ? JSON.parse(user) : null
}

/**
 * Clear all auth data from storage
 */
export const clearAuthStorage = () => {
  // Clear localStorage
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  
  // Clear cookies
  deleteCookie(TOKEN_KEY)
  deleteCookie(REFRESH_TOKEN_KEY)
}

/**
 * Check if auth data exists in storage
 */
export const hasAuthData = () => {
  return !!(getAccessToken() && getRefreshToken())
}

/**
 * Update access token in storage
 */
export const updateAccessToken = (accessToken) => {
  localStorage.setItem(TOKEN_KEY, accessToken)
  setCookie(TOKEN_KEY, accessToken, 0) // Session cookie
}
