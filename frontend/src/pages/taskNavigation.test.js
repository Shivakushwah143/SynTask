import { expect, test } from 'vitest'
import { resolveTaskBackTarget } from './taskNavigation'

test('falls back to tasks when browser history is unavailable', () => {
  expect(resolveTaskBackTarget({ idx: 0 }, '/tasks')).toBe('/tasks')
})

test('uses browser history when a previous entry exists', () => {
  expect(resolveTaskBackTarget({ idx: 2 }, '/tasks')).toBeNull()
})
