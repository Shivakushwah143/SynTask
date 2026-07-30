const DIGITS_ONLY = /\D/g

export const sanitizeCountryCode = (value = '') => {
  const digits = String(value).replace(DIGITS_ONLY, '').slice(0, 4)
  return digits ? `+${digits}` : ''
}

export const sanitizeLocalPhone = (value = '') => {
  const raw = String(value || '').trim()
  if (!raw) return ''

  const digits = raw.replace(DIGITS_ONLY, '')
  if (!digits) return ''

  // If 11 digits starting with 0 (e.g. 09876543210), strip leading 0
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits.slice(1)
  }

  // If 12 digits starting with country code 91 (e.g. 919876543210), strip 91
  if (digits.length === 12 && digits.startsWith('91')) {
    return digits.slice(2)
  }

  // If 11 digits starting with country code 1 (e.g. 15552345678), strip 1
  if (digits.length === 11 && digits.startsWith('1')) {
    return digits.slice(1)
  }

  // If more than 10 digits, extract the last 10 digits
  if (digits.length > 10) {
    return digits.slice(-10)
  }

  return digits
}

export const parsePhonePaste = (text, availableCountries = ['+91', '+1', '+44', '+61', '+971', '+65', '+49', '+33', '+81', '+86']) => {
  const raw = String(text || '').trim()
  if (!raw) return { countryCode: null, phoneNumber: '' }

  const digits = raw.replace(DIGITS_ONLY, '')
  let matchedCountry = null
  let localDigits = digits

  // Check if raw text starts with +
  if (raw.startsWith('+')) {
    // Find matching country code prefix sorted longest first
    const sorted = [...availableCountries].sort((a, b) => b.length - a.length)
    for (const code of sorted) {
      const codeDigits = code.replace(/\D/g, '')
      if (digits.startsWith(codeDigits)) {
        matchedCountry = code
        localDigits = digits.slice(codeDigits.length)
        break
      }
    }
  }

  return {
    countryCode: matchedCountry,
    phoneNumber: sanitizeLocalPhone(localDigits || digits),
  }
}

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
