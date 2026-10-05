/**
 * Responsive table enhancement (mobile production readiness).
 *
 * SynTask has many hand-written data tables. Rather than rewriting each one
 * (or hiding columns on phones), this progressive enhancement derives a
 * mobile card representation from the table's own markup:
 *
 *   - reads the header labels from the table's single <thead> row
 *   - marks the table with [data-syntask-cards]
 *   - copies each header label onto the matching <td> as [data-label]
 *
 * CSS in index.css turns those tables into stacked cards below 768px while
 * leaving the desktop table markup completely untouched. No data is removed:
 * every cell — including row actions — is still rendered, just reorganized.
 *
 * Escape hatch: add `data-syntask-no-cards` to a <table> to opt out (use it
 * for tables that genuinely are a matrix rather than a record list).
 */

export const CARD_TABLE_ATTR = 'data-syntask-cards'
export const NO_CARDS_ATTR = 'data-syntask-no-cards'

/** Read the label for each column from the table's single header row. */
function readHeaderLabels(table) {
  const headRows = table.querySelectorAll(':scope > thead > tr')
  // Grouped/multi-row headers cannot be mapped 1:1 onto cells — leave them be.
  if (headRows.length !== 1) return null
  const headerRow = headRows[0]
  if (headerRow.querySelector('th[colspan]')) return null
  const labels = Array.from(headerRow.children).map((cell) => (cell.textContent || '').trim())
  if (labels.length < 2) return null
  return labels
}

function decorateTable(table) {
  if (!table || table.tagName !== 'TABLE') return
  if (table.hasAttribute(NO_CARDS_ATTR)) return
  // Never decorate a table nested inside another table's cell.
  if (table.parentElement && table.parentElement.closest('table')) return

  const labels = readHeaderLabels(table)
  if (!labels) return

  const bodyRows = table.querySelectorAll(':scope > tbody > tr')
  if (!bodyRows.length && table.hasAttribute(CARD_TABLE_ATTR)) return
  if (!bodyRows.length) {
    // Still mark tables that render their rows later; the observer re-runs.
    table.setAttribute(CARD_TABLE_ATTR, '')
    return
  }

  table.setAttribute(CARD_TABLE_ATTR, '')

  bodyRows.forEach((row) => {
    const cells = Array.from(row.children)
    // Empty-state / message rows span the whole table: keep them full width.
    if (cells.length === 1 && cells[0].hasAttribute('colspan')) return

    cells.forEach((cell, index) => {
      if (cell.tagName !== 'TD') return
      if (cell.hasAttribute('colspan')) return
      const label = labels[index] ?? ''
      if (cell.getAttribute('data-label') !== label) {
        cell.setAttribute('data-label', label)
      }
    })
  })
}

/** Decorate every (still undecorated) table under `root`. Idempotent. */
export function enhanceTables(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return
  root.querySelectorAll('table').forEach((table) => {
    if (table.hasAttribute(NO_CARDS_ATTR)) return
    if (!table.hasAttribute(CARD_TABLE_ATTR)) {
      decorateTable(table)
      return
    }
    // Already decorated: make sure newly rendered rows/cells got labels too.
    if (table.querySelector(':scope > tbody > tr > td:not([data-label]):not([colspan])')) {
      decorateTable(table)
    }
  })
}

/**
 * Start observing the document and decorate tables as they mount/update.
 * Returns a cleanup function.
 */
export function observeTables(target) {
  if (!target || typeof MutationObserver === 'undefined') return () => {}

  let frame = null
  const run = () => {
    frame = null
    enhanceTables(target)
  }
  const schedule = () => {
    if (frame !== null) return
    frame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame(run)
      : window.setTimeout(run, 16)
  }

  enhanceTables(target)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && (mutation.addedNodes.length || mutation.removedNodes.length)) {
        schedule()
        return
      }
      // React can replace a whole <td>/<tr> subtree in place.
      if (mutation.type === 'childList') {
        schedule()
        return
      }
    }
  })

  observer.observe(target, { childList: true, subtree: true })

  return () => {
    observer.disconnect()
    if (frame !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
      else window.clearTimeout(frame)
      frame = null
    }
  }
}
