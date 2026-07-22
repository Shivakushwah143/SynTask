import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InstagramConnectionPanel, getInstagramConnectionHealth } from './InstagramConnectionPanel'

describe('InstagramConnectionPanel', () => {
  it('reports healthy professional account when messaging scope exists', () => {
    expect(
      getInstagramConnectionHealth({
        instagram_business_account_id: 'ig-professional-1',
        scopes: ['instagram_manage_messages'],
      }),
    ).toEqual({ status: 'healthy', reason: null })
  })

  it('renders external Meta approval gate and account trace', () => {
    render(
      <InstagramConnectionPanel
        connection={{
          instagram_business_account_id: 'ig-professional-1',
          scoped_sender_ids: ['ig-user-1'],
          scopes: ['instagram_manage_messages'],
        }}
      />,
    )

    expect(screen.getByText('Instagram Messaging')).toBeInTheDocument()
    expect(screen.getByText('ig-professional-1')).toBeInTheDocument()
    expect(screen.getByText('External gate: Instagram permissions/App Review required before production usage.')).toBeInTheDocument()
  })
})
