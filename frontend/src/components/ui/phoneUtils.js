const DIGITS_ONLY = /\D/g

export const sanitizeCountryCode = (value = '') => {
  const digits = String(value).replace(DIGITS_ONLY, '').slice(0, 4)
  return digits ? `+${digits}` : ''
}

export const sanitizeLocalPhone = (value = '') => String(value).replace(DIGITS_ONLY, '').slice(0, 10)

export const sanitizeInternationalPhone = (value = '') => {
  const text = String(value).trim()
  if (!text) return ''
  const hasLeadingPlus = text.startsWith('+')
  const digits = text.replace(DIGITS_ONLY, '')
  if (!digits) return ''
  return `${hasLeadingPlus ? '+' : ''}${digits}`.replace(/^\++/, '+')
}

export const isValidCountryCode = (value) => /^\+\d{1,4}$/.test(String(value || ''))
export const isValidLocalPhone = (value) => /^\d{10}$/.test(String(value || ''))
export const isValidInternationalPhone = (value) => /^\+\d{1,4}\d{10}$/.test(String(value || ''))

export const phoneValidationMessage = (value, required = false) => {
  const clean = sanitizeInternationalPhone(value)
  if (!clean) return required ? 'Phone number is required.' : ''
  if (!clean.startsWith('+')) return 'Phone number must start with a country code, for example +91.'
  if (!isValidInternationalPhone(clean)) return 'Enter country code with + and exactly 10 local digits.'
  return ''
}

export const splitPhoneValue = (value = '') => {
  const clean = sanitizeInternationalPhone(value)
  if (!clean.startsWith('+') || clean.length <= 11) return { country_code: '', phone: clean.replace(DIGITS_ONLY, '') }
  return {
    country_code: `+${clean.slice(1, -10)}`,
    phone: clean.slice(-10),
  }
}
