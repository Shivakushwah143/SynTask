import { useEffect } from 'react'

export function useKeyboardShortcut(
  key,
  callback,
  { metaKey = false, ctrlKey = false, shiftKey = false, altKey = false } = {},
) {
  useEffect(() => {
    const handler = (event) => {
      const metaMatches = !metaKey || event.metaKey
      const ctrlMatches = !ctrlKey || event.ctrlKey
      const shiftMatches = !shiftKey || event.shiftKey
      const altMatches = !altKey || event.altKey
      if (
        event.key.toLowerCase() === key.toLowerCase() &&
        metaMatches &&
        ctrlMatches &&
        shiftMatches &&
        altMatches
      ) {
        event.preventDefault()
        callback(event)
      }
    }

    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [altKey, callback, ctrlKey, key, metaKey, shiftKey])
}
