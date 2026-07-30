export function excludeCurrentUser(list = [], currentUser = null) {
  if (!currentUser || !currentUser.id && !currentUser._id) return list
  const id = String(currentUser.id || currentUser._id)
  return (Array.isArray(list) ? list : []).filter((item) => String(item?.id || item?._id) !== id)
}

export function isAssignableActiveUser(user = null) {
  if (!user) return false
  const status = String(user.status || '').trim().toLowerCase()
  const isActive = user.isActive !== false && user.is_active !== false
  const isDeleted = user.deleted === true || user.is_deleted === true || user.deleted_at
  return status === 'active' && isActive && !isDeleted
}
