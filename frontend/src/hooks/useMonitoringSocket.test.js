import { describe, expect, it, vi } from 'vitest'
import { sendWhenSocketOpen } from './useMonitoringSocket'

describe('sendWhenSocketOpen', () => {
  it('sends after an existing connecting socket opens', async () => {
    const send = vi.fn()
    const socket = {
      readyState: WebSocket.CONNECTING,
      addEventListener: vi.fn((event, callback) => {
        if (event === 'open') setTimeout(() => {
          socket.readyState = WebSocket.OPEN
          callback()
        }, 0)
      }),
      removeEventListener: vi.fn(),
      send,
    }
    const socketRef = { current: socket }

    const sent = await sendWhenSocketOpen(socketRef, vi.fn(), () => ({ type: 'start_work' }), { timeoutMs: 100 })

    expect(sent).toBe(true)
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'start_work' }))
  })

  it('connects and sends when no socket exists yet', async () => {
    const send = vi.fn()
    const socketRef = { current: null }
    const socket = {
      readyState: WebSocket.CONNECTING,
      addEventListener: vi.fn((event, callback) => {
        if (event === 'open') setTimeout(() => {
          socket.readyState = WebSocket.OPEN
          callback()
        }, 0)
      }),
      removeEventListener: vi.fn(),
      send,
    }
    const connectSocket = vi.fn(() => {
      socketRef.current = socket
    })

    const sent = await sendWhenSocketOpen(socketRef, connectSocket, () => ({ type: 'start_work' }), { timeoutMs: 100 })

    expect(sent).toBe(true)
    expect(connectSocket).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: 'start_work' }))
  })

  it('returns false when a connecting socket never opens', async () => {
    const socket = {
      readyState: WebSocket.CONNECTING,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      send: vi.fn(),
    }
    const socketRef = { current: socket }

    const sent = await sendWhenSocketOpen(socketRef, vi.fn(), () => ({ type: 'start_work' }), { timeoutMs: 1 })

    expect(sent).toBe(false)
    expect(socket.send).not.toHaveBeenCalled()
  })
})
