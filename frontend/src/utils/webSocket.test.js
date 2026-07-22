import { describe, expect, it, vi } from 'vitest'
import { closeOpenWebSocket } from './webSocket'

describe('closeOpenWebSocket', () => {
  it('closes an open socket', () => {
    const socket = { readyState: WebSocket.OPEN, close: vi.fn() }
    closeOpenWebSocket(socket)
    expect(socket.close).toHaveBeenCalledOnce()
  })

  it.each([WebSocket.CONNECTING, WebSocket.CLOSING, WebSocket.CLOSED])('does not close socket state %s', (readyState) => {
    const socket = { readyState, close: vi.fn() }
    closeOpenWebSocket(socket)
    expect(socket.close).not.toHaveBeenCalled()
  })
})
