export const useDefaultAvatar = (event) => {
  event.currentTarget.onerror = null
  event.currentTarget.src = '/default-avatar.png'
}
