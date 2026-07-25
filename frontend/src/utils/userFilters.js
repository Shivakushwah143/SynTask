export function excludeCurrentUser(list = [], currentUser = null) {
  if (!currentUser || !currentUser.id && !currentUser._id) return list
  const id = String(currentUser.id || currentUser._id)
  return (Array.isArray(list) ? list : []).filter((item) => String(item?.id || item?._id) !== id)
}
