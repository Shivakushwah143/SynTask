const DEFAULT_TITLE = 'SynTask'
const DEFAULT_DESCRIPTION = 'SynTask task management and AI operations platform.'

const ROUTE_META = [
  { pattern: /^\/$/, title: 'SynTask', description: DEFAULT_DESCRIPTION },
  { pattern: /^\/login\/?$/, title: 'Login | SynTask', description: 'Sign in to SynTask.' },
  { pattern: /^\/dashboard\/?$/, title: 'Dashboard | SynTask', description: 'Overview of your work, priorities, and team activity.' },
  { pattern: /^\/tasks(\/.*)?$/, title: 'Tasks | SynTask', description: 'Track and manage tasks across your company.' },
  { pattern: /^\/projects(\/.*)?$/, title: 'Projects | SynTask', description: 'Plan and coordinate project work.' },
  { pattern: /^\/tickets(\/.*)?$/, title: 'Tickets | SynTask', description: 'Handle support and operational tickets.' },
  { pattern: /^\/chat(\/.*)?$/, title: 'AI Chat | SynTask', description: 'Ask questions and get help from your AI assistant.' },
  { pattern: /^\/ai-hub\/?$/, title: 'AI Hub | SynTask', description: 'Access AI planning and assistance tools.' },
  { pattern: /^\/creative-director\/?$/, title: 'Creative Director | SynTask', description: 'Review creative work and manage feedback.' },
  { pattern: /^\/reports(\/.*)?$/, title: 'Reports | SynTask', description: 'Review operational reports and insights.' },
  { pattern: /^\/meetings(\/.*)?$/, title: 'Meetings | SynTask', description: 'Schedule and manage meetings.' },
  { pattern: /^\/crm(\/.*)?$/, title: 'CRM | SynTask', description: 'Manage CRM workspace, customer relationships, and future sales workflows.' },
  { pattern: /^\/sales(\/.*)?$/, title: 'Sales | SynTask', description: 'Manage sales contacts, prospects, and pipeline.' },
]

const getOrigin = () => {
  if (typeof window === 'undefined') return 'https://task.synzent.ai'
  return window.location.origin
}

export function getSeoMeta(pathname = '/') {
  const matchedEntry = ROUTE_META.find((entry) => entry.pattern.test(pathname))
  const canonical = `${getOrigin()}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '') || '/'}`
  return {
    title: matchedEntry?.title || DEFAULT_TITLE,
    description: matchedEntry?.description || DEFAULT_DESCRIPTION,
    canonical,
    robots: pathname === '/' ? 'index,follow' : 'noindex,nofollow',
  }
}

export function applySeoMeta(meta) {
  if (typeof document === 'undefined') return

  document.title = meta.title

  const tags = [
    ['meta[name="description"]', 'content', meta.description],
    ['meta[name="robots"]', 'content', meta.robots],
    ['meta[property="og:title"]', 'content', meta.title],
    ['meta[property="og:description"]', 'content', meta.description],
    ['meta[property="og:url"]', 'content', meta.canonical],
    ['meta[name="twitter:title"]', 'content', meta.title],
    ['meta[name="twitter:description"]', 'content', meta.description],
    ['link[rel="canonical"]', 'href', meta.canonical],
  ]

  for (const [selector, attribute, value] of tags) {
    let element = document.head.querySelector(selector)
    if (!element) {
      element = document.createElement(selector.startsWith('link') ? 'link' : 'meta')
      const [tagName] = selector.split('[')
      if (tagName === 'link') {
        element.setAttribute('rel', 'canonical')
      }
      document.head.appendChild(element)
    }
    element.setAttribute(attribute, value)
  }
}
