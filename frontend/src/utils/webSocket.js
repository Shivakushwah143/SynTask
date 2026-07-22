export const closeOpenWebSocket = (ws) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close()
  }
}
