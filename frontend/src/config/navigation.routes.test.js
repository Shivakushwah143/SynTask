// Phase 7 (spec §11): route-correctness + config-integrity tests for the v3 sidebar.
//
// Every href in the navigation config MUST resolve to a real route registered in
// App.jsx (no 404s, no silent drop of a section item). The route patterns are parsed
// from App.jsx at test time — not copied by hand — so the check cannot drift when
// routes are added or renamed.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { matchPath } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import * as navigationModule from './navigation'
import {
  HR_ITEM_RENAMES,
  HR_ITEM_SKIP,
  SECTIONS,
  crmNavigation,
  metaNavigation,
  navigation,
} from './navigation'
import { HR_MODULES } from './hrModules'

// Vitest runs from the frontend/ directory, so App.jsx is at <cwd>/src/App.jsx.
const APP_JSX_PATH = resolve('src/App.jsx')

// Strip JSX block comments ({/* ... */}) — the MSA placeholder comments contain
// commented-out <Route> tags that must NOT count as real routes. (We deliberately do
// NOT strip `//` line comments: no `//` comment in App.jsx contains a <Route tag, and
// stripping them would risk corrupting string literals that contain `//`, e.g. https://…)
const APP_JSX_SOURCE = readFileSync(APP_JSX_PATH, 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

// ── Tiny JSX-aware scanner for <Route> open tags ─────────────────────────────
// Handles element props that contain JSX with their own < > characters, e.g.
//   <Route path="crm" element={<ProtectedRoute><CRMLayout /></ProtectedRoute>}>
// by tracking {…} expression depth and quoted attribute values; a tag only ends at
// a `>` outside braces/quotes.
function readRouteTagEnd(source, start) {
  let i = start + '<Route'.length
  let braceDepth = 0
  let quote = null
  while (i < source.length) {
    const ch = source[i]
    if (quote) {
      if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
    } else if (ch === '{') {
      braceDepth += 1
    } else if (ch === '}') {
      braceDepth -= 1
    } else if (ch === '>' && braceDepth === 0) {
      return i + 1
    }
    i += 1
  }
  throw new Error(`Unterminated <Route> tag in App.jsx at offset ${start}`)
}

// Returns every absolute route pattern registered in App.jsx (e.g.
// "/crm/leads", "/clients/:clientId/workspace", "/hr/recruitment/jobs").
// Nested relative <Route path="…"> children are joined to their nearest
// non-self-closing parent. Wrapper routes without a path keep the parent prefix.
// Index routes (no path attr) contribute no segment.
export function parseRoutePatterns(source) {
  const patterns = new Set()
  const stack = [] // prefix stack ("" = root)
  let i = 0
  while (i < source.length) {
    const openIdx = source.indexOf('<Route', i)
    const closeIdx = source.indexOf('</Route>', i)
    if (openIdx === -1 && closeIdx === -1) break
    if (closeIdx !== -1 && (openIdx === -1 || closeIdx < openIdx)) {
      stack.pop()
      i = closeIdx + '</Route>'.length
      continue
    }
    const tagEnd = readRouteTagEnd(source, openIdx)
    const tagText = source.slice(openIdx, tagEnd)
    const selfClosing = /\s\/>$/.test(tagText)
    const pathMatch = tagText.match(/path="([^"]*)"/)
    const parent = stack[stack.length - 1] ?? ''
    if (pathMatch) {
      const p = pathMatch[1]
      const full = p.startsWith('/') ? p : parent ? `${parent}/${p}` : `/${p}`
      patterns.add(full)
      if (!selfClosing) stack.push(full)
    } else if (!selfClosing) {
      stack.push(parent) // wrapper route with no path: children inherit the prefix
    }
    i = tagEnd
  }
  return [...patterns]
}

const ROUTE_PATTERNS = parseRoutePatterns(APP_JSX_SOURCE)

// The catch-all /* NotFound route must not satisfy any sidebar href — a href is
// only valid if it matches a real registered page route.
const RESOLVABLE_PATTERNS = ROUTE_PATTERNS.filter((pattern) => pattern !== '/*' && !pattern.endsWith('/*'))

// Every href the sidebar can render for any role: config items + HR items that
// are not skipped (HR_ITEM_SKIP mirrors Sidebar.jsx).
const SIDEBAR_HREFS = [
  ...navigation,
  ...crmNavigation,
  ...metaNavigation,
  ...HR_MODULES.flatMap((mod) => mod.navigation.filter((item) => !HR_ITEM_SKIP.has(item.name))),
].map((item) => item.href)

const pathnameOf = (href) => href.split('?')[0]

describe('sidebar route correctness (Phase 7, spec §11)', () => {
  it('parses the real App.jsx route tree (sanity: key routes present)', () => {
    for (const expected of [
      '/crm/leads',
      '/crm/settings',
      '/crm/settings/meta',
      '/crm/pipeline/:stageKey',
      '/hr/recruitment/jobs',
      '/hr/recruitment/interview-screen',
      '/sales/reports',
      '/super-admin/dashboard',
      '/clients/:clientId/workspace',
      '/projects/:projectId/board',
      '/sections/:sectionKey', // tab sub-nav landing pages (D1)
    ]) {
      expect(ROUTE_PATTERNS).toContain(expected)
    }
  })

  it('every sidebar href resolves to a registered App.jsx route (no 404s)', () => {
    const broken = SIDEBAR_HREFS.filter(
      (href) => !RESOLVABLE_PATTERNS.some((pattern) => matchPath(pattern, pathnameOf(href)) !== null),
    )
    expect(broken).toEqual([])
  })

  it('meta omnichannel panels point at the real CRM settings route', () => {
    for (const item of metaNavigation) {
      expect(pathnameOf(item.href)).toBe('/crm/settings')
      expect(item.href).toContain('meta=')
    }
  })

  it('no sidebar href is duplicated across sections', () => {
    expect(new Set(SIDEBAR_HREFS).size).toBe(SIDEBAR_HREFS.length)
  })
})

describe('sidebar launch kit quick-reference card (Phase 8, spec §13)', () => {
  // Build the same "section → valid item names" map Sidebar.jsx renders: SECTIONS
  // items resolved by name, plus the People HR items (renamed, skipped removed).
  const navByName = new Map([...navigation, ...crmNavigation, ...metaNavigation].map((item) => [item.name, item]))
  const validItemsBySection = new Map(
    SECTIONS.map((section) => {
      const names = new Set(section.items.filter((name) => navByName.has(name)))
      if (section.key === 'people') {
        for (const mod of HR_MODULES) {
          for (const item of mod.navigation) {
            if (HR_ITEM_SKIP.has(item.name)) continue
            names.add(HR_ITEM_RENAMES[item.name] || item.name)
          }
        }
      }
      return [section.label, names]
    }),
  )

  const launchKitPath = resolve('src/pages/hr/recruitment/sidebar-launch-kit.md')
  // Parse ONLY the §3 quick-reference card table — the file also contains a §1
  // go-live checklist table and a §4 metrics table whose columns are not
  // sidebar destinations, so scope the extraction to the card section.
  const kit = readFileSync(launchKitPath, 'utf8')
  const cardSection = kit.slice(kit.indexOf('## 3.'), kit.indexOf('## 4.'))
  const cardRows = cardSection
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith('|'))
    .map((line) => line.split('|').map((cell) => cell.trim()))
    .filter((cells) => cells.length >= 3 && cells[2] !== 'Tell them to go to...' && cells[2] !== '---')

  it('every quick-reference destination is a real sidebar section + item', () => {
    const broken = []
    for (const cells of cardRows) {
      const destination = (cells[2] || '').replace(/\*\*/g, '').trim()
      if (!destination) continue
      const [sectionLabel, itemsPart] = destination.split('→').map((part) => part.trim())
      const validItems = validItemsBySection.get(sectionLabel)
      if (!validItems) {
        broken.push(`${cells[1]}: unknown section "${sectionLabel}"`)
        continue
      }
      if (!itemsPart) continue // section-only destination (e.g. "Home")
      for (const item of itemsPart.split('/').map((part) => part.trim())) {
        if (!validItems.has(item)) {
          broken.push(`${cells[1]}: "${sectionLabel} → ${item}" is not a rendered sidebar item`)
        }
      }
    }
    expect(cardRows.length).toBeGreaterThan(40)
    expect(broken).toEqual([])
  })
})

describe('sidebar config integrity (Phase 7)', () => {
  const itemPool = new Set([...navigation, ...crmNavigation, ...metaNavigation].map((item) => item.name))

  it('every SECTIONS item name resolves to a real nav item (no silent drops)', () => {
    const missing = SECTIONS.flatMap((section) =>
      section.items.filter((name) => !itemPool.has(name)).map((name) => `${section.label} → ${name}`),
    )
    expect(missing).toEqual([])
  })

  it('defines exactly 12 sections with unique keys', () => {
    expect(SECTIONS).toHaveLength(12)
    const keys = SECTIONS.map((section) => section.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('HR rename keys and skip list target real HR module items', () => {
    const hrNames = HR_MODULES.flatMap((mod) => mod.navigation.map((item) => item.name))
    for (const name of Object.keys(HR_ITEM_RENAMES)) {
      expect(hrNames).toContain(name)
    }
    for (const name of HR_ITEM_SKIP) {
      expect(hrNames).toContain(name)
    }
  })

  it('removes the collapsible-groups localStorage key entirely (tab sub-nav Phase D)', () => {
    // The sidebar no longer has collapsible groups, so the expand-state key must not exist
    // (stale localStorage from the old sidebar is simply ignored).
    expect('NAV_GROUPS_OPEN_KEY' in navigationModule).toBe(false)
  })

  it('exposes the shared section-item resolver used by sidebar and tab bar (Phase A)', () => {
    expect(typeof navigationModule.getSectionItems).toBe('function')
    expect(typeof navigationModule.isNavItemActive).toBe('function')
    expect(typeof navigationModule.gateNavItem).toBe('function')
  })
})
