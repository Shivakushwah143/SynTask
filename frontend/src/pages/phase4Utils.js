export const asArray = (value, keys = []) => {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key]
  }
  if (Array.isArray(value.items)) return value.items
  if (Array.isArray(value.data)) return value.data
  if (Array.isArray(value.results)) return value.results
  return []
}

export const getId = (item) => item?.id || item?._id

export const formatDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleDateString()
}

export const formatDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

export const formatMoney = (value) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0))

export const toFormData = (data) => {
  const formData = new FormData()
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, value)
    }
  })
  return formData
}

export const sumBy = (items, selector) =>
  items.reduce((total, item) => total + Number(selector(item) || 0), 0)
