export const getAvatarUrl = (path, version = '') => {
  if (!path) return null
  const basePath = String(path)
  const apiOrigin = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:8000'
  const url = basePath.startsWith('http')
    ? basePath
    : basePath.startsWith('/uploads/avatars/')
      ? `${apiOrigin}/api/v1${basePath}`
      : `${apiOrigin}${basePath}`

  if (!version) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}v=${encodeURIComponent(version)}`
}
