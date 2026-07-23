import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessengerConnectionPanel, getMessengerConnectionHealth } from './MessengerConnectionPanel'

describe('MessengerConnectionPanel', () => {
  it('reports degraded page connection when pages_messaging scope is missing', () => {
    expect(
      getMessengerConnectionHealth({
        messenger_page_id: 'page-1',
        scopes: [],
      }),
    ).toEqual({ status: 'degraded', reason: 'Missing pages_messaging scope.' })
  })

  it('renders external Meta approval gate and page trace', () => {
    render(
      <MessengerConnectionPanel
        connection={{
          messenger_page_id: 'page-1',
          scoped_sender_ids: ['psid-1'],
          scopes: ['pages_messaging'],
        }}
      />,
    )

    expect(screen.getByText('Messenger')).toBeInTheDocument()
    expect(screen.getByText('page-1')).toBeInTheDocument()
    expect(screen.getByText('External gate: Messenger permissions/App Review required before production usage.')).toBeInTheDocument()
  })
})
