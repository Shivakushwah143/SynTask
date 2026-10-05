import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ContactAttemptDialog } from './ContactAttemptDialog'

describe('ContactAttemptDialog', () => {
  it('renders the four supported contact methods', () => {
    render(
      <ContactAttemptDialog
        open
        lead={{ company_name: 'Acme Corp' }}
        onClose={vi.fn()}
        onRecord={vi.fn()}
      />
    )
    expect(screen.getByText('Call')).toBeTruthy()
    expect(screen.getByText('Email')).toBeTruthy()
    expect(screen.getByText('WhatsApp')).toBeTruthy()
    expect(screen.getByText('Other')).toBeTruthy()
    expect(screen.getByText(/Acme Corp/)).toBeTruthy()
  })

  it('fires onRecord with the selected method and notes', () => {
    const onRecord = vi.fn()
    render(
      <ContactAttemptDialog
        open
        lead={{ company_name: 'Acme Corp' }}
        onClose={vi.fn()}
        onRecord={onRecord}
      />
    )
    fireEvent.click(screen.getByText('Email'))
    fireEvent.change(screen.getByPlaceholderText(/What was discussed/i), {
      target: { value: 'Intro call scheduled' },
    })
    fireEvent.click(screen.getByText('Record contact'))
    expect(onRecord).toHaveBeenCalledWith('email', 'Intro call scheduled')
  })

  it('does not fire onRecord while saving', () => {
    const onRecord = vi.fn()
    render(
      <ContactAttemptDialog
        open
        lead={{ company_name: 'Acme Corp' }}
        onClose={vi.fn()}
        onRecord={onRecord}
        saving
      />
    )
    fireEvent.click(screen.getByText('Record contact'))
    expect(onRecord).not.toHaveBeenCalled()
  })
})
