import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetaAttribution } from './MetaAttribution'

describe('MetaAttribution', () => {
  it('renders Meta Lead Ads attribution without exposing actions', () => {
    render(<MetaAttribution lead={{
      source: 'meta_lead_ads',
      meta_lead_id: 'lead-1',
      meta_campaign_id: 'campaign-1',
      meta_adset_id: 'adset-1',
      meta_ad_id: 'ad-1',
      meta_form_id: 'form-1',
    }} />)

    expect(screen.getByText('Meta Lead Ads')).toBeInTheDocument()
    expect(screen.getByText('campaign-1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /send/i })).not.toBeInTheDocument()
  })

  it('renders nothing for non-Meta leads', () => {
    const { container } = render(<MetaAttribution lead={{ source: 'referral' }} />)
    expect(container).toBeEmptyDOMElement()
  })
})
