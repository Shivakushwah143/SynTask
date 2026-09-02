import { describe, expect, it } from 'vitest'

import { onboardingBlockerDestination } from './clientOnboardingNavigation'

describe('client onboarding blocker navigation', () => {
  it.each([
    ['payment_terms', 'commercial'],
    ['primary_contact', 'contacts'],
    ['requirements', 'requirements'],
    ['documents', 'documents'],
    ['brand_assets', 'assets-access'],
    ['required_access', 'assets-access'],
    ['project_created', 'project-team'],
    ['team_assigned', 'project-team'],
    ['kickoff_meeting', 'kickoff'],
    ['start_readiness', 'project-team'],
  ])('opens %s in the correct secondary tab', (_key, tab) => {
    expect(onboardingBlockerDestination({ tab })).toBe(tab)
  })

  it('falls back to overview for malformed blocker payloads', () => {
    expect(onboardingBlockerDestination(null)).toBe('overview')
  })
})
