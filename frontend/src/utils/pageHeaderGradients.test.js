import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const sourceRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const headerPattern = /bg-gradient-to-(?:r|br) (from-\S+ via-\S+ to-\S+) p-6 text-white/g

function jsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name)
    if (entry.isDirectory()) return jsxFiles(entryPath)
    return entry.name.endsWith('.jsx') ? [entryPath] : []
  })
}

describe('page header gradients', () => {
  it('gives every page header a distinct, stable gradient', () => {
    const gradientsByPage = jsxFiles(sourceRoot).flatMap((filePath) => {
      const matches = [...readFileSync(filePath, 'utf8').matchAll(headerPattern)]
      if (!matches.length) return []

      const pageGradients = new Set(matches.map((match) => match[1]))
      expect(pageGradients.size, `${relative(sourceRoot, filePath)} uses multiple header gradients`).toBe(1)
      return [[relative(sourceRoot, filePath), matches[0][1]]]
    })

    expect(gradientsByPage.length).toBeGreaterThan(30)
    expect(new Set(gradientsByPage.map(([, gradient]) => gradient)).size).toBe(gradientsByPage.length)
  })
})
