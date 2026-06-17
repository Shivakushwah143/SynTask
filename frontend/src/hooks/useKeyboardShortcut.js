import { useEffect } from 'react'

export function useKeyboardShortcut(key, callback, { metaKey = false, ctrlKey = false } = {}) {
  useEffect(() => {
    const handler = (event) => {
      const metaMatches = !metaKey || event.metaKey
      const ctrlMatches = !ctrlKey || event.ctrlKey
      if (event.key.toLowerCase() === key.toLowerCase() && metaMatches && ctrlMatches) {
        event.preventDefault()
        callback(event)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [callback, ctrlKey, key, metaKey])
}
