// utils/storage.js - clean token handling
/**
 * Storage utilities for auth tokens.
 * Persists tokens in sessionStorage or localStorage based on the "remember me" flag.
 * Also provides helpers for user data and token refresh handling.
 */

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'refresh_token';
const USER_KEY = 'auth_user';
const REMEMBER_KEY = 'auth_remember_me';

const getSessionStorage = () => (typeof window === 'undefined' ? null : window.sessionStorage);
const getLocalStorage = () => (typeof window === 'undefined' ? null : window.localStorage);

const removeFromStorage = (storage) => {
  if (!storage) return;
  storage.removeItem(TOKEN_KEY);
  storage.removeItem(REFRESH_TOKEN_KEY);
  storage.removeItem(USER_KEY);
  storage.removeItem(REMEMBER_KEY);
};

const deleteLegacyCookie = (name) => {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;SameSite=Lax`;
};

const clearLegacyCookies = () => {
  deleteLegacyCookie(TOKEN_KEY);
  deleteLegacyCookie(REFRESH_TOKEN_KEY);
};

const getActiveStorage = () => {
  const session = getSessionStorage();
  const local = getLocalStorage();
  // Prefer the storage that already holds user data
  if (session?.getItem(USER_KEY)) return session;
  if (local?.getItem(USER_KEY)) return local;
  // Fallback to session (short‑lived) storage for safety
  return session || local;
};

const getStorageForRememberMe = (rememberMe) => {
  if (rememberMe === true) return getLocalStorage();
  if (rememberMe === false) return getSessionStorage();
  // When undefined, keep whatever storage currently holds user data, defaulting to session
  return getActiveStorage();
};

export const saveAuthTokens = (accessToken, refreshToken, rememberMe) => {
  const target = getStorageForRememberMe(rememberMe);
  const opposite = target === getLocalStorage() ? getSessionStorage() : getLocalStorage();
  removeFromStorage(opposite);
  clearLegacyCookies();
  if (target) {
    if (accessToken) target.setItem(TOKEN_KEY, accessToken);
    if (refreshToken) target.setItem(REFRESH_TOKEN_KEY, refreshToken);
    if (typeof rememberMe === 'boolean') target.setItem(REMEMBER_KEY, String(rememberMe));
  }
};

export const saveUserData = (user, rememberMe) => {
  const target = getStorageForRememberMe(rememberMe);
  const opposite = target === getLocalStorage() ? getSessionStorage() : getLocalStorage();
  if (!target || !user) return;
  opposite?.removeItem(USER_KEY);
  target.setItem(USER_KEY, JSON.stringify(user));
};

export const getAccessToken = () => {
  const storage = getActiveStorage();
  return storage?.getItem(TOKEN_KEY) || null;
};

export const getRefreshToken = () => {
  const storage = getActiveStorage();
  return storage?.getItem(REFRESH_TOKEN_KEY) || null;
};

export const getUserData = () => {
  const stored = getSessionStorage()?.getItem(USER_KEY) || getLocalStorage()?.getItem(USER_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored);
  } catch {
    clearAuthStorage();
    return null;
  }
};

export const clearAuthStorage = () => {
  removeFromStorage(getSessionStorage());
  removeFromStorage(getLocalStorage());
  clearLegacyCookies();
};

export const hasAuthData = () => !!getUserData();

export const getStoredAuthData = () => {
  const token = getAccessToken();
  const refresh = getRefreshToken();
  const user = getUserData();
  if (!user) {
    if (token || refresh) clearAuthStorage();
    return null;
  }
  return { token, refreshToken: refresh, user };
};

export const updateAccessToken = (accessToken) => {
  const storage = getActiveStorage();
  if (storage && accessToken) storage.setItem(TOKEN_KEY, accessToken);
  clearLegacyCookies();
};
