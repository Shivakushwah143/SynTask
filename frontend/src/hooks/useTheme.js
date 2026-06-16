import { useEffect, useLayoutEffect, useState } from 'react'

const STORAGE_KEY = 'syntask-theme'
const THEME_CHANGE_EVENT = 'syntask-theme-change'
const THEMES = ['light', 'dark']

const normalizeTheme = (theme) => (THEMES.includes(theme) ? theme : null)

const getInitialTheme = () => {
  if (typeof window === 'undefined') return 'light'
  const documentTheme = normalizeTheme(document.documentElement.dataset.theme)
  if (documentTheme) return documentTheme
  const savedTheme = normalizeTheme(window.localStorage.getItem(STORAGE_KEY))
  if (savedTheme) return savedTheme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const applyTheme = (theme) => {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const body = document.body

  root.classList.remove('light', 'dark')
  root.classList.add(theme)
  root.dataset.theme = theme
  root.style.colorScheme = theme

  if (body) {
    body.classList.remove('light', 'dark')
    body.classList.add(theme)
    body.dataset.theme = theme
  }
}

export const useTheme = () => {
  const [theme, setTheme] = useState(getInitialTheme)

  useLayoutEffect(() => {
    applyTheme(theme)
    window.localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  useEffect(() => {
    const handleThemeChange = (event) => {
      setTheme(normalizeTheme(event.detail?.theme) || getInitialTheme())
    }

    const handleStorage = (event) => {
      if (event.key === STORAGE_KEY) setTheme(getInitialTheme())
    }

    window.addEventListener(THEME_CHANGE_EVENT, handleThemeChange)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, handleThemeChange)
      window.removeEventListener('storage', handleStorage)
    }
  }, [])

  const toggleTheme = () => {
    setTheme((currentTheme) => {
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark'
      window.localStorage.setItem(STORAGE_KEY, nextTheme)
      window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: { theme: nextTheme } }))
      return nextTheme
    })
  }

  return { theme, toggleTheme }
}
