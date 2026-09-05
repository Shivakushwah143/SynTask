import { describe, expect, it } from 'vitest'
import { useDefaultAvatar } from './avatar'

describe('useDefaultAvatar', () => {
  it('replaces a broken image once with the default avatar', () => {
    const target = { src: '/uploads/avatars/missing.png', onerror: () => {} }
    useDefaultAvatar({ currentTarget: target })
    expect(target.src).toBe('/default-avatar.svg')
    expect(target.onerror).toBeNull()
  })
})
