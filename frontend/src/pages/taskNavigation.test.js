import { expect, test } from 'vitest'
import { buildTaskShareUrl, resolveTaskBackTarget, resolveTaskCloseFallback } from './taskNavigation'

test('falls back to tasks when browser history is unavailable', () => {
  expect(resolveTaskBackTarget({ idx: 0 }, '/tasks')).toBe('/tasks')
})

test('uses browser history when a previous entry exists', () => {
  expect(resolveTaskBackTarget({ idx: 2 }, '/tasks')).toBeNull()
})

test('falls back to project board when task has project context', () => {
  expect(resolveTaskCloseFallback('PROJ-106')).toBe('/projects/PROJ-106/board')
})

test('falls back to tasks when task has no project context', () => {
  expect(resolveTaskCloseFallback()).toBe('/tasks')
})

test('builds share url from current route', () => {
  expect(buildTaskShareUrl('https://app.example.com/projects/PROJ-106/tasks/t1?tab=comments')).toBe('https://app.example.com/projects/PROJ-106/tasks/t1')
})
