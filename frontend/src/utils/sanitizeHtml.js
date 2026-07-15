import DOMPurify from 'dompurify'

export const sanitizeHtml = (html) => {
  if (typeof html !== 'string') return ''
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  })
}
