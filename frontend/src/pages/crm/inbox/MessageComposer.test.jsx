import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MessageComposer, getMetaComposerRestriction } from './MessageComposer'

describe('Meta inbox composer restrictions', () => {
  it('blocks Instagram composer without a customer-initiated thread', () => {
    expect(
      getMetaComposerRestriction({
        channel: 'instagram',
        lastCustomerMessageAt: null,
        recipientOptedOut: false,
        now: new Date('2026-07-22T00:00:00Z'),
      }),
    ).toEqual('Instagram replies require an existing customer-initiated conversation.')
  })

  it('blocks Messenger composer outside the standard reply window', () => {
    expect(
      getMetaComposerRestriction({
        channel: 'messenger',
        lastCustomerMessageAt: '2026-07-20T22:00:00Z',
        recipientOptedOut: false,
        now: new Date('2026-07-22T00:00:00Z'),
      }),
    ).toEqual('Messenger replies are outside the standard customer messaging window.')
  })

  it('renders disabled composer with policy reason', () => {
    render(
      <MessageComposer
        channel="messenger"
        lastCustomerMessageAt="2026-07-20T22:00:00Z"
        now={new Date('2026-07-22T00:00:00Z')}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reply unavailable' })).toBeDisabled()
    expect(screen.getByText('Messenger replies are outside the standard customer messaging window.')).toBeInTheDocument()
  })
})
