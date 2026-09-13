import { useEffect } from 'react'
import { observeTables } from '../utils/responsiveTables'

/**
 * App-level progressive enhancement that gives every table a mobile card
 * representation (see utils/responsiveTables.js). Mounted once in App.jsx so
 * it covers every layout — authenticated app, CRM/Sales workspaces, modals and
 * public pages alike.
 */
export default function ResponsiveTables() {
  useEffect(() => {
    if (typeof document === 'undefined') return undefined
    return observeTables(document.body)
  }, [])

  return null
}
