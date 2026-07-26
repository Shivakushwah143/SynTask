import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = join(process.cwd(), 'src')
const allowed = new Set([
  'services/timeService.js',
  'services/timeService.test.js',
  'services/timeAudit.test.js',
  'utils/apiPerformanceMonitor.ts',
])

const patterns = [
  /new Date\(/,
  /Date\.now\(/,
  /\.toLocaleDateString\(/,
  /\.toLocaleTimeString\(/,
  /\.toISOString\(/,
  /Intl\.DateTimeFormat\(/,
]

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.(js|jsx|ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('frontend time audit', () => {
  it('routes app time through timeService outside allowed internals', () => {
    const offenders = files(root)
      .map((path) => [relative(root, path).replaceAll('\\', '/'), readFileSync(path, 'utf8')])
      .filter(([path]) => !allowed.has(path) && !path.endsWith('.test.jsx') && !path.endsWith('.test.js'))
      .flatMap(([path, source]) =>
        patterns
          .filter((pattern) => pattern.test(source))
          .map((pattern) => `${path}: ${pattern.source}`),
      )

    expect(offenders).toEqual([])
  })
})
