import * as chrono from 'chrono-node'

/**
 * Parse a natural language date string into a Date object.
 * @param {string} text - User input like "tomorrow 5pm"
 * @param {Date} referenceDate - Optional reference date (defaults to now)
 * @returns {{ date: Date, matchedText: string, hasTime: boolean } | null}
 */
export function parseNaturalDate(text, referenceDate = new Date()) {
  if (!text?.trim()) return null

  const results = chrono.parse(text, referenceDate, { forwardDate: true })
  if (!results.length) return null

  const result = results[0]
  return {
    date: result.start.date(),
    matchedText: result.text,
    hasTime: result.start.isCertain('hour'),
  }
}
