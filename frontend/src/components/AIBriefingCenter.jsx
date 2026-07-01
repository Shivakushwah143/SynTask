import { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CheckSquare,
  Clock,
  FileText,
  MessageCircle,
  Sparkles,
  Wand2,

  Ticket,
  
  
  Users,
  X,
  Zap,
  TrendingUp,
  Activity,
  Target,
  Cpu,
  Radar,
  Shield,
  Network,
  Scan,
  Binary,
  Globe,
  Menu,
  Keyboard,
  Eye,
  Type,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { aiAPI } from '../api/ai'
import { ROLE, hasCompanyAdminAccess, normalizeRole } from '../utils/roles'
import * as d3 from 'd3'

// ===== CONSTANTS & CONFIGURATIONS =====
const STATUS_TONE = {
  green: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-400 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-400',
  amber: 'border-amber-400/30 bg-amber-500/10 text-amber-400 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-400',
  red: 'border-red-400/30 bg-red-500/10 text-red-400 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-400',
  blue: 'border-blue-400/30 bg-blue-500/10 text-blue-400 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-400',
}

const COMPLETED_STATUSES = ['completed', 'closed', 'resolved']
const PRIORITY_LEVELS = { urgent: 'Critical', critical: 'Critical', high: 'High' }
const STATUS_PRIORITIES = ['high', 'critical', 'urgent']
const COMMAND_ITEMS = [
  { label: 'Prioritize My Day', icon: Sparkles, path: '/ai-prioritization', action: 'prioritize' },
  { label: 'Break Down Tasks', icon: CheckSquare, path: '/tasks' },
  { label: 'Generate Daily Report', icon: FileText, action: 'report' },
  { label: 'Analyze Team Risks', icon: Users, path: '/reports' },
  { label: 'Review Tickets', icon: Ticket, path: '/tickets' },
  { label: 'Ask AI', icon: MessageCircle, path: '/ai-assistant' },
]

const KEYBOARD_SHORTCUTS = [
  { key: '⌘K', description: 'Open command palette' },
  { key: '⌘B', description: 'Toggle briefing' },
  { key: '⌘N', description: 'New task' },
  { key: '⌘R', description: 'Refresh data' },
  { key: '⌘F', description: 'Search' },
  { key: 'Esc', description: 'Close modal' },
]

const FONT_SIZES = { small: '14px', medium: '16px', large: '18px' }

// ===== UTILITY FUNCTIONS =====
const todayKey = () => new Date().toISOString().slice(0, 10)

const isOverdue = (item) => {
  if (!item?.due_date) return false
  const due = new Date(item.due_date)
  const now = new Date()
  return due < now && !COMPLETED_STATUSES.includes(String(item.status || '').toLowerCase())
}

const getPriorityLabel = (item) => {
  const priority = String(item?.priority || 'medium').toLowerCase()
  return PRIORITY_LEVELS[priority] || priority.charAt(0).toUpperCase() + priority.slice(1)
}

const isHighPriority = (task) => 
  STATUS_PRIORITIES.some(p => String(task.priority || '').toLowerCase().includes(p))

const filterActive = (items) => 
  items.filter(item => !COMPLETED_STATUSES.includes(String(item.status || '').toLowerCase()))

const calculateMetrics = (tasks) => ({
  overdue: tasks.filter(isOverdue),
  highPriority: tasks.filter(isHighPriority),
  active: filterActive(tasks),
  estimatedHours: tasks.reduce((sum, task) => sum + Number(task.estimated_hours || 0), 0),
})

// ===== BRIEFING BUILDER =====
const buildBriefing = ({ user, stats, recentTasks, recentTickets }) => {
  const role = normalizeRole(stats?.role || user?.role)
  const name = user?.first_name || 'there'
  const metrics = calculateMetrics(recentTasks)
  const activeTickets = filterActive(recentTickets)
  const hasAdminAccess = hasCompanyAdminAccess(role)

  // Role-based configuration
  const roleConfigs = {
    [ROLE.ADMIN]: () => {
      const activeProjects = stats?.active_projects ?? stats?.total_projects ?? 12
      const activeTasks = stats?.active_tasks || 0
      const openTickets = stats?.open_tickets || stats?.total_tickets || 0
      const atRisk = Math.max(openTickets, metrics.overdue.length, Math.ceil(activeTasks * 0.15))

      return {
        role,
        eyebrow: 'Executive Briefing',
        title: 'Executive briefing',
        subtitle: 'Company operating picture for today',
        metrics: [
          { label: 'Projects', value: activeProjects, caption: 'Active' },
          { label: 'Healthy', value: Math.max(0, activeProjects - atRisk), caption: 'On track' },
          { label: 'At Risk', value: atRisk, caption: 'Needs review' },
          { label: 'Critical Issues', value: Math.min(openTickets + metrics.overdue.length, 9), caption: 'Open' },
        ],
        sections: [
          {
            title: 'Recommendations',
            items: [
              activeTasks ? `Review ${activeTasks} active tasks across delivery` : 'Review company delivery queue',
              openTickets ? `Follow up on ${openTickets} open requests` : 'Check client request health',
            ],
          },
        ],
        risk: metrics.overdue[0]?.title || (openTickets ? `${openTickets} open requests need ownership` : 'No critical risk detected from current dashboard data'),
        primaryAction: { label: 'Open Executive Dashboard', path: '/reports' },
        secondaryAction: { label: 'Review Risks', path: '/tickets' },
      }
    },
    [ROLE.LEAD]: () => {
      const teamTasks = stats?.team_tasks || stats?.total_tasks || recentTasks.length
      const blocked = metrics.overdue.length + activeTickets.length
      return {
        role,
        eyebrow: `Welcome Back ${name}`,
        title: `Welcome back, ${name}`,
        subtitle: 'Team workload and execution signals',
        metrics: [
          { label: 'Team Tasks', value: teamTasks, caption: 'Visible scope' },
          { label: 'Blocked', value: blocked, caption: 'Needs attention' },
          { label: 'My Tasks', value: stats?.my_tasks || 0, caption: 'Personal queue' },
        ],
        sections: [
          {
            title: 'Team Overview',
            items: [
              blocked ? `${blocked} blocked or waiting items` : 'Team workload is clear',
              teamTasks ? `${teamTasks} tasks visible in team scope` : 'No team tasks found',
              metrics.highPriority[0]?.title ? `${metrics.highPriority[0].title} is the highest-priority item` : 'Review assignments before standup',
            ],
          },
          {
            title: 'Recommendations',
            items: [
              blocked ? 'Reassign or unblock one item before noon' : "Confirm today's owner for high-impact work",
              metrics.highPriority[0]?.title ? `Review ${metrics.highPriority[0].title}` : 'Generate team report',
            ],
          },
        ],
        risk: metrics.overdue[0]?.title || activeTickets[0]?.title || 'No major risk detected from current dashboard data',
        primaryAction: { label: 'Open Team Dashboard', path: '/my-team' },
        secondaryAction: { label: 'Generate Report', action: 'report' },
      }
    },
    [ROLE.MANAGER]: () => {
      const teamTasks = stats?.team_tasks || stats?.total_tasks || recentTasks.length
      const blocked = metrics.overdue.length + activeTickets.length
      return {
        role,
        eyebrow: `Welcome Back ${name}`,
        title: `Welcome back, ${name}`,
        subtitle: 'Team workload and execution signals',
        metrics: [
          { label: 'Team Tasks', value: teamTasks, caption: 'Visible scope' },
          { label: 'Blocked', value: blocked, caption: 'Needs attention' },
          { label: 'My Tasks', value: stats?.my_tasks || 0, caption: 'Personal queue' },
        ],
        sections: [
          {
            title: 'Team Overview',
            items: [
              blocked ? `${blocked} blocked or waiting items` : 'Team workload is clear',
              teamTasks ? `${teamTasks} tasks visible in team scope` : 'No team tasks found',
              metrics.highPriority[0]?.title ? `${metrics.highPriority[0].title} is the highest-priority item` : 'Review assignments before standup',
            ],
          },
          {
            title: 'Recommendations',
            items: [
              blocked ? 'Reassign or unblock one item before noon' : "Confirm today's owner for high-impact work",
              metrics.highPriority[0]?.title ? `Review ${metrics.highPriority[0].title}` : 'Generate team report',
            ],
          },
        ],
        risk: metrics.overdue[0]?.title || activeTickets[0]?.title || 'No major risk detected from current dashboard data',
        primaryAction: { label: 'Open Team Dashboard', path: '/my-team' },
        secondaryAction: { label: 'Generate Report', action: 'report' },
      }
    },
    default: () => ({
      role,
      eyebrow: `Good Morning ${name}`,
      title: `Good morning, ${name}`,
      subtitle: 'Your day is ready to start',
      metrics: [
        { label: 'Priorities', value: recentTasks.length || stats?.my_tasks || 0, caption: 'Today' },
        { label: 'Estimated Work', value: metrics.estimatedHours ? `${metrics.estimatedHours.toFixed(1)}h` : '6.5h', caption: 'Planned' },
        { label: 'Requests', value: stats?.my_tickets || activeTickets.length || 0, caption: 'Open' },
      ],
      sections: [
        {
          title: "Today's Priorities",
          items: (recentTasks.length ? recentTasks : [
            { title: 'Review your task queue' },
            { title: 'Update active work' },
            { title: 'Prepare client status' }
          ]).slice(0, 3).map(task => task.title),
        },
      ],
      risk: metrics.overdue[0]?.title ? `${metrics.overdue[0].title} is overdue` : 
            activeTickets[0]?.title ? `${activeTickets[0].title} needs a response` : 
            'No major risk detected from current dashboard data',
      primaryAction: { label: 'Start My Day', path: '/tasks' },
      secondaryAction: { label: 'View Tasks', path: '/tasks' },
    })
  }

  // Get the appropriate builder function
  const builder = roleConfigs[role] || roleConfigs.default
  return builder()
}

// ===== SUGGESTION BUILDER =====
const buildSuggestions = ({ stats, recentTasks, recentTickets }) => {
  const suggestions = []
  const metrics = calculateMetrics(recentTasks)
  const waitingTicket = recentTickets.find(ticket => 
    ['waiting_for_customer', 'open'].includes(String(ticket.status || '').toLowerCase())
  )

  // Suggestion templates
  const suggestionTemplates = [
    {
      condition: (stats?.my_tasks || stats?.team_tasks || stats?.total_tasks || recentTasks.length) === 0,
      tone: 'amber',
      icon: CheckSquare,
      title: 'No assigned task detected',
      detail: 'Create or assign work so today has a clear owner.',
      path: '/tasks',
      actions: ['View', 'Assign'],
    },
    {
      condition: waitingTicket,
      tone: 'red',
      icon: Ticket,
      title: `${waitingTicket?.title || 'Ticket'} is waiting`,
      detail: 'A request needs ownership before it ages further.',
      path: '/tickets',
      actions: ['View', 'Generate Plan'],
    },
    {
      condition: metrics.overdue.length > 0,
      tone: 'red',
      icon: AlertCircle,
      title: `${metrics.overdue[0]?.title} is overdue`,
      detail: `${getPriorityLabel(metrics.overdue[0])} priority task needs action.`,
      path: '/tasks',
      actions: ['View', 'Generate Plan'],
    },
    {
      condition: metrics.highPriority.length > 0 && !metrics.overdue.some(t => t.id === metrics.highPriority[0]?.id),
      tone: 'blue',
      icon: Clock,
      title: `${metrics.highPriority[0]?.title} should be planned`,
      detail: `${getPriorityLabel(metrics.highPriority[0])} priority item in the current queue.`,
      path: '/tasks',
      actions: ['View', 'Generate Plan'],
    },
  ]

  // Process templates
  suggestionTemplates.forEach(template => {
    if (template.condition) {
      suggestions.push({
        tone: template.tone,
        icon: template.icon,
        title: template.title,
        detail: template.detail,
        path: template.path,
        actions: template.actions,
      })
    }
  })

  // Add default suggestion if none were added
  if (suggestions.length === 0) {
    suggestions.push({
      tone: 'green',
      icon: CheckCircle2,
      title: 'Workspace looks stable',
      detail: "Generate a daily report to capture today's operating picture.",
      path: '/reports',
      actions: ['View', 'Generate Plan'],
    })
  }

  return suggestions.slice(0, 4)
}

const commandItems = [
  { label: 'Prioritize My Day', icon: Sparkles, path: '/ai-prioritization', action: 'prioritize' },
  { label: 'Creative Review', icon: Wand2, path: '/creative-director' },
  { label: 'Break Down Tasks', icon: CheckSquare, path: '/ai-hub#breakdown' },
  { label: 'Generate Daily Report', icon: FileText, action: 'report' },
  { label: 'Analyze Team Risks', icon: Users, path: '/reports' },
  { label: 'Review Tickets', icon: Ticket, path: '/tickets' },
  { label: 'Ask AI', icon: MessageCircle, path: '/ai-assistant' },
]

// Particle Effect Component
const ParticleEffect = ({ isActive, onComplete }) => {
  useEffect(() => {
    if (!isActive) return
    
    const particles = Array.from({ length: 50 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vx: (Math.random() - 0.5) * 10,
      vy: (Math.random() - 0.5) * 10,
      size: Math.random() * 6 + 2,
      color: `hsl(${Math.random() * 60 + 180}, 80%, 60%)`,
      life: 1,
    }))

    const canvas = document.createElement('canvas')
    canvas.style.position = 'fixed'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.pointerEvents = 'none'
    canvas.style.zIndex = '9999'
    document.body.appendChild(canvas)
    
    const ctx = canvas.getContext('2d')
    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      let alive = false
      particles.forEach(p => {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.1
        p.life -= 0.015
        
        if (p.life > 0) {
          alive = true
          ctx.globalAlpha = p.life
          ctx.fillStyle = p.color
          ctx.shadowColor = p.color
          ctx.shadowBlur = 20
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2)
          ctx.fill()
        }
      })
      
      if (alive) {
        requestAnimationFrame(animate)
      } else {
        document.body.removeChild(canvas)
        if (onComplete) onComplete()
      }
    }
    
    animate()
    
    return () => {
      if (canvas.parentNode) document.body.removeChild(canvas)
    }
  }, [isActive, onComplete])

  return null
}

// Loading Skeleton Component
const ShimmerSkeleton = ({ className }) => (
  <div className={`relative overflow-hidden ${className}`}>
    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
    <style jsx>{`
      @keyframes shimmer {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      .animate-shimmer {
        animation: shimmer 2s infinite;
      }
    `}</style>
  </div>
)

// Accessibility Menu Component
const AccessibilityMenu = ({ onFontSizeChange, onContrastToggle, isHighContrast, onClose }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-lg p-2 text-slate-600 transition-all hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Accessibility settings"
      >
        <Eye className="h-5 w-5" />
      </button>
      
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Font Size</span>
              <div className="flex gap-1">
                {Object.keys(FONT_SIZES).map(size => (
                  <button
                    key={size}
                    onClick={() => onFontSizeChange(size)}
                    className={`rounded px-2 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 ${
                      size === 'small' ? 'text-xs' : size === 'large' ? 'text-base' : 'text-sm'
                    }`}
                  >
                    {size === 'small' ? 'A-' : size === 'large' ? 'A+' : 'A'}
                  </button>
                ))}
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">High Contrast</span>
              <button
                onClick={onContrastToggle}
                className={`relative h-6 w-12 rounded-full transition-colors ${isHighContrast ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                aria-label="Toggle high contrast mode"
              >
                <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${isHighContrast ? 'translate-x-7' : 'translate-x-1'}`} />
              </button>
            </div>
            
            <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
              <div className="text-xs text-slate-500 dark:text-slate-400">
                <span className="font-mono">⌘K</span> Open command palette
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Keyboard Shortcuts Guide Component
const KeyboardShortcutsGuide = ({ onClose }) => {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-lg p-2 text-slate-600 transition-all hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        aria-label="Keyboard shortcuts"
      >
        <Keyboard className="h-5 w-5" />
      </button>
      
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-800"
        >
          <h3 className="mb-3 text-sm font-bold text-slate-900 dark:text-white">Keyboard Shortcuts</h3>
          <div className="space-y-2">
            {KEYBOARD_SHORTCUTS.map(({ key, description }) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">{description}</span>
                <kbd className="rounded bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        </motion.div>
      )}
    </>
  )
}

// Data Visualization Component
const DataVisualization = ({ data, type = 'bar' }) => {
  const chartRef = useRef(null)

  useEffect(() => {
    if (!chartRef.current || !data || data.length === 0) return

    const width = chartRef.current.clientWidth
    const height = 200
    const margin = { top: 20, right: 20, bottom: 30, left: 40 }

    d3.select(chartRef.current).selectAll('*').remove()

    const svg = d3.select(chartRef.current)
      .append('svg')
      .attr('width', width)
      .attr('height', height)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`)

    const x = d3.scaleBand()
      .domain(data.map(d => d.label))
      .range([0, width - margin.left - margin.right])
      .padding(0.1)

    const y = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.value) * 1.1])
      .range([height - margin.top - margin.bottom, 0])

    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'chart-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%')
    
    gradient.append('stop')
      .attr('offset', '0%')
      .attr('style', 'stop-color: #3b82f6; stop-opacity: 0.8')
    
    gradient.append('stop')
      .attr('offset', '100%')
      .attr('style', 'stop-color: #8b5cf6; stop-opacity: 0.3')

    svg.selectAll('.bar')
      .data(data)
      .enter()
      .append('rect')
      .attr('class', 'bar')
      .attr('x', d => x(d.label))
      .attr('y', height - margin.top - margin.bottom)
      .attr('height', 0)
      .attr('width', x.bandwidth())
      .attr('rx', 4)
      .attr('fill', 'url(#chart-gradient)')
      .transition()
      .duration(800)
      .delay((_, i) => i * 100)
      .attr('y', d => y(d.value))
      .attr('height', d => height - margin.top - margin.bottom - y(d.value))

    svg.selectAll('.label')
      .data(data)
      .enter()
      .append('text')
      .attr('class', 'label')
      .attr('x', d => x(d.label) + x.bandwidth() / 2)
      .attr('y', height - margin.top - margin.bottom - 5)
      .attr('text-anchor', 'middle')
      .style('font-size', '10px')
      .style('fill', '#64748b')
      .style('opacity', 0)
      .text(d => d.value)
      .transition()
      .duration(800)
      .delay((_, i) => i * 100 + 400)
      .style('opacity', 1)
      .attr('y', d => y(d.value) - 5)

  }, [data, type])

  return (
    <div 
      ref={chartRef} 
      className="w-full rounded-lg bg-white/5 p-2 backdrop-blur-sm"
      role="img"
      aria-label={`${type} chart showing ${data.length} data points`}
    />
  )
}

// ===== MAIN COMPONENT =====
export default function AIBriefingCenter({ user, stats, recentTasks = [], recentTickets = [] }) {
  const navigate = useNavigate()
  const [state, setState] = useState({
    isOpen: false,
    isWorking: false,
    showParticles: false,
    isHighContrast: false,
    fontSize: 'medium',
    showKeyboardGuide: false,
    isFullscreen: false,
    touchStartX: 0,
  })

  // Memoized data
  const briefing = useMemo(
    () => buildBriefing({ user, stats, recentTasks, recentTickets }),
    [user, stats, recentTasks, recentTickets]
  )
  
  const suggestions = useMemo(
    () => buildSuggestions({ stats, recentTasks, recentTickets }),
    [stats, recentTasks, recentTickets]
  )
  
  const chartData = useMemo(() => {
    const statusCounts = {}
    recentTasks.forEach(task => {
      const status = task.status || 'unknown'
      statusCounts[status] = (statusCounts[status] || 0) + 1
    })
    return Object.entries(statusCounts).map(([label, value]) => ({ label, value }))
  }, [recentTasks])

  const hasCriticalEvent = useMemo(
    () => suggestions.some(item => item.tone === 'red'),
    [suggestions]
  )

  // Event handlers
  const handleSetState = useCallback((updates) => {
    setState(prev => ({ ...prev, ...updates }))
  }, [])

  const closeBriefing = useCallback(() => {
    handleSetState({ isOpen: false })
  }, [handleSetState])

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      handleSetState({ isFullscreen: true })
    } else {
      document.exitFullscreen()
      handleSetState({ isFullscreen: false })
    }
  }, [handleSetState])

  const handleFontSizeChange = useCallback((size) => {
    handleSetState({ fontSize: size })
    document.documentElement.style.fontSize = FONT_SIZES[size]
  }, [handleSetState])

  const handleContrastToggle = useCallback(() => {
    handleSetState(prev => ({ isHighContrast: !prev.isHighContrast }))
  }, [handleSetState])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const cmdKey = isMac ? e.metaKey : e.ctrlKey
      
      if (cmdKey) {
        switch(e.key.toLowerCase()) {
          case 'k':
            e.preventDefault()
            handleSetState(prev => ({ showKeyboardGuide: !prev.showKeyboardGuide }))
            break
          case 'b':
            e.preventDefault()
            handleSetState(prev => ({ isOpen: !prev.isOpen }))
            break
          case 'n':
            e.preventDefault()
            navigate('/tasks/new')
            break
          case 'r':
            e.preventDefault()
            window.location.reload()
            break
        }
      }
      
      if (e.key === 'Escape') {
        if (state.isOpen) closeBriefing()
        if (state.showKeyboardGuide) handleSetState({ showKeyboardGuide: false })
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.isOpen, state.showKeyboardGuide, navigate, closeBriefing, handleSetState])

  // Touch gestures
  const handleTouchStart = useCallback((e) => {
    handleSetState({ touchStartX: e.touches[0].clientX })
  }, [handleSetState])

  const handleTouchEnd = useCallback((e) => {
    const diff = state.touchStartX - e.changedTouches[0].clientX
    if (Math.abs(diff) > 100 && diff > 0 && state.isOpen) {
      closeBriefing()
    }
  }, [state.touchStartX, state.isOpen, closeBriefing])

  // Auto-show briefing
  useEffect(() => {
    if (!user?.id && !user?.email) return
    const userKey = user?.id || user?.email
    const date = todayKey()
    const dailyKey = `syntask-ai-briefing:${userKey}:${date}`
    const criticalKey = `syntask-ai-critical:${userKey}:${date}`

    const shouldShowDaily = localStorage.getItem(dailyKey) !== 'shown'
    const shouldShowCritical = hasCriticalEvent && sessionStorage.getItem(criticalKey) !== 'shown'

    if (shouldShowDaily || shouldShowCritical) {
      handleSetState({ isOpen: true, showParticles: true })
      localStorage.setItem(dailyKey, 'shown')
      if (shouldShowCritical) sessionStorage.setItem(criticalKey, 'shown')
    }
  }, [hasCriticalEvent, user?.email, user?.id, handleSetState])

  // Action handler
  const runAction = useCallback(async (item) => {
    if (item?.path) {
      navigate(item.path)
      closeBriefing()
      return
    }

    const actionHandlers = {
      report: async () => {
        await aiAPI.generateDailyReport({ limit: 10 })
        toast.success('Daily report generated')
        handleSetState({ showParticles: true })
        navigate('/reports')
        closeBriefing()
      },
      prioritize: async () => {
        await aiAPI.generateTaskPrioritization({ limit: 10, include_completed: false })
        toast.success('Priorities generated')
        handleSetState({ showParticles: true })
        navigate('/ai-prioritization')
        closeBriefing()
      }
    }

    if (item?.action && actionHandlers[item.action]) {
      try {
        handleSetState({ isWorking: true })
        await actionHandlers[item.action]()
      } catch (error) {
        toast.error(error.response?.data?.detail || `Unable to ${item.action}`)
      } finally {
        handleSetState({ isWorking: false })
      }
    }
  }, [navigate, closeBriefing, handleSetState])

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 300,
        damping: 24,
      },
    },
  }

  // Render utility
  const renderMetrics = useCallback(() => (
    briefing.metrics.map((metric, index) => (
      <motion.div
        key={metric.label}
        variants={itemVariants}
        className="group/metric relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/70 p-4 shadow-sm transition-all duration-300 hover:shadow-md dark:border-cyan-500/20 dark:bg-slate-800/40 dark:backdrop-blur-sm dark:hover:border-cyan-400/40 dark:hover:bg-slate-800/60 dark:hover:shadow-[0_0_30px_rgba(6,182,212,0.05)]"
      >
        <div className="absolute right-0 top-0 h-20 w-20 rounded-full bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 transition-opacity duration-300 group-hover/metric:opacity-100 dark:from-cyan-500/10 dark:to-blue-500/10" />
        <div className="relative">
          <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-cyan-400">{metric.label}</div>
          <div className="mt-1.5 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{metric.value}</div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{metric.caption}</div>
        </div>
        <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500 group-hover/metric:w-full dark:from-cyan-400 dark:to-blue-400" />
      </motion.div>
    ))
  ), [briefing.metrics, itemVariants])

  const renderSuggestions = useCallback(() => (
    suggestions.slice(0, 2).map((suggestion, index) => {
      const Icon = suggestion.icon
      return (
        <motion.div
          key={suggestion.title}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.08 }}
          className="group/item relative flex items-start gap-3 overflow-hidden rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200/60 transition-all duration-300 hover:shadow-md hover:ring-blue-200/60 dark:bg-slate-900/50 dark:ring-slate-700/50 dark:backdrop-blur-sm dark:hover:border-cyan-400/30 dark:hover:bg-slate-900/70 dark:hover:shadow-[0_0_20px_rgba(6,182,212,0.05)]"
        >
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${STATUS_TONE[suggestion.tone]} transition-all duration-300 group-hover/item:scale-110 dark:group-hover/item:shadow-[0_0_20px_rgba(6,182,212,0.1)]`}>
            <Icon className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-950 dark:text-white">{suggestion.title}</div>
            <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{suggestion.detail}</div>
          </div>
          <button
            type="button"
            onClick={() => navigate(suggestion.path)}
            className="rounded-lg p-1.5 text-slate-400 transition-all duration-300 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-500 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-400"
            aria-label={`Open ${suggestion.title}`}
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500 group-hover/item:w-full dark:from-cyan-400 dark:to-blue-400" />
        </motion.div>
      )
    })
  ), [suggestions, navigate])

  const renderCommandButtons = useCallback(() => (
    COMMAND_ITEMS.map((item, index) => {
      const Icon = item.icon
      return (
        <motion.button
          key={item.label}
          type="button"
          onClick={() => runAction(item)}
          disabled={state.isWorking}
          variants={itemVariants}
          className="group/btn relative overflow-hidden rounded-xl border border-slate-200/80 bg-white/70 p-3.5 text-left text-sm font-semibold text-slate-800 shadow-sm transition-all duration-300 hover:border-blue-300/60 hover:bg-blue-50/60 hover:shadow-md hover:shadow-blue-100/20 disabled:opacity-60 dark:border-slate-700/50 dark:bg-slate-800/40 dark:text-slate-300 dark:backdrop-blur-sm dark:hover:border-cyan-400/40 dark:hover:bg-slate-800/60 dark:hover:text-white dark:hover:shadow-[0_0_30px_rgba(6,182,212,0.05)]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-indigo-500/0 opacity-0 transition-opacity duration-500 group-hover/btn:from-blue-500/5 group-hover/btn:to-indigo-500/5 group-hover/btn:opacity-100 dark:from-cyan-500/0 dark:to-blue-500/0 dark:group-hover/btn:from-cyan-500/5 dark:group-hover/btn:to-blue-500/5" />
          <div className="relative">
            <div className="rounded-lg bg-gradient-to-br from-blue-500/10 to-indigo-500/10 p-1.5 transition-all duration-300 group-hover/btn:from-blue-500/20 group-hover/btn:to-indigo-500/20 dark:from-cyan-500/10 dark:to-blue-500/10 dark:group-hover/btn:from-cyan-500/20 dark:group-hover/btn:to-blue-500/20 dark:group-hover/btn:shadow-[0_0_20px_rgba(6,182,212,0.1)]">
              <Icon className="h-4 w-4 text-blue-600 transition-transform duration-300 group-hover/btn:scale-110 dark:text-cyan-400" />
            </div>
          </div>
          <span className="relative mt-1.5 text-xs leading-tight">{item.label}</span>
          <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500 group-hover/btn:w-full dark:from-cyan-400 dark:to-blue-400" />
        </motion.button>
      )
    })
  ), [state.isWorking, runAction, itemVariants])

  return (
    <>
      <ParticleEffect 
        isActive={state.showParticles} 
        onComplete={() => handleSetState({ showParticles: false })} 
      />

      <motion.section
        initial="hidden"
        animate="visible"
        variants={containerVariants}
        className={`group relative overflow-hidden rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-white/95 to-slate-50/80 p-6 shadow-lg backdrop-blur-xl transition-all duration-500 hover:shadow-xl dark:border-cyan-500/20 dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-800/90 dark:shadow-[0_0_50px_-12px_rgba(6,182,212,0.15)] dark:hover:shadow-[0_0_80px_-12px_rgba(6,182,212,0.25)] sm:p-7 ${state.isHighContrast ? 'contrast-[1.3]' : ''}`}
        style={{ fontSize: FONT_SIZES[state.fontSize] }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Background layers */}
        <div className="absolute inset-0 overflow-hidden dark:hidden">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f02e_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f02e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,black_70%,transparent_110%)]" />
        </div>
        
        <div className="absolute inset-0 overflow-hidden hidden dark:block">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,black_70%,transparent_110%)]" />
        </div>
        
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl dark:hidden" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-indigo-500/5 blur-3xl dark:hidden" />
        
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-cyan-500/10 blur-3xl animate-pulse hidden dark:block" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl animate-pulse delay-1000 hidden dark:block" />
        <div className="absolute top-1/2 left-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-500/5 blur-3xl hidden dark:block" />
        
        <div className="absolute inset-0 overflow-hidden pointer-events-none hidden dark:block">
          <div className="absolute h-[2px] w-full bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent animate-[scan_3s_linear_infinite] top-0" />
        </div>

        <style jsx>{`
          @keyframes scan {
            0% { top: 0; opacity: 1; }
            100% { top: 100%; opacity: 0; }
          }
        `}</style>

        {/* Header */}
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-blue-700 shadow-sm ring-1 ring-blue-200/50 dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-400 dark:shadow-[0_0_20px_rgba(6,182,212,0.1)] dark:backdrop-blur-sm">
              <Radar className="h-3.5 w-3.5 dark:animate-pulse" />
              AI Briefing Center
              <span className="ml-1 rounded-full bg-blue-600/10 px-2 py-0.5 text-[10px] text-blue-700 dark:bg-cyan-400/20 dark:text-cyan-300 dark:animate-pulse">● LIVE</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl dark:text-white dark:bg-gradient-to-r dark:from-cyan-400 dark:to-blue-400 dark:bg-clip-text dark:text-transparent">
              Operating signals before you ask
            </h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              <span className="text-blue-600 dark:text-cyan-400">◈</span> {briefing.subtitle}. {briefing.risk}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <AccessibilityMenu 
              onFontSizeChange={handleFontSizeChange}
              onContrastToggle={handleContrastToggle}
              isHighContrast={state.isHighContrast}
            />
            <KeyboardShortcutsGuide />
            <button
              onClick={toggleFullscreen}
              className="rounded-lg p-2 text-slate-600 transition-all hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              aria-label="Toggle fullscreen"
            >
              {state.isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
            <button
              type="button"
              onClick={() => handleSetState({ isOpen: true })}
              className="group/btn relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-600/30 active:scale-[0.98] dark:from-cyan-500 dark:to-blue-500 dark:shadow-[0_0_30px_rgba(6,182,212,0.3)] dark:hover:shadow-[0_0_50px_rgba(6,182,212,0.5)]"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover/btn:translate-x-[200%] transition-transform duration-1000" />
              <Bot className="h-4 w-4" />
              Open Briefing
              <ArrowRight className="h-4 w-4 opacity-70 group-hover/btn:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Metrics and Suggestions Grid */}
        <div className="relative mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-3 sm:grid-cols-3">
            {renderMetrics()}
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white/70 p-4 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md dark:border-cyan-500/20 dark:bg-slate-800/40 dark:backdrop-blur-sm dark:hover:border-cyan-400/30">
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-cyan-400">
              <Zap className="h-3.5 w-3.5 dark:animate-pulse" />
              Suggested Actions
            </div>
            <div className="space-y-2.5">
              {renderSuggestions()}
            </div>
          </div>
        </div>

        {/* Data Visualization */}
        {chartData.length > 0 && (
          <div className="relative mt-5">
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-cyan-400">
              <TrendingUp className="h-3.5 w-3.5" />
              Task Distribution
            </div>
            <DataVisualization data={chartData} type="bar" />
          </div>
        )}

        {/* Command Buttons */}
        <div className="relative mt-5 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          {renderCommandButtons()}
        </div>
      </motion.section>

      {/* Modal */}
      <AnimatePresence>
        {state.isOpen ? (
          <motion.div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-3 backdrop-blur-md sm:p-6 dark:bg-black/80 dark:backdrop-blur-xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button type="button" className="absolute inset-0 cursor-default" onClick={closeBriefing} aria-label="Close briefing" />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="AI briefing"
              className="relative max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-2xl dark:border-cyan-500/20 dark:bg-gradient-to-br dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-800/95 dark:shadow-[0_0_80px_-12px_rgba(6,182,212,0.15)]"
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.24, ease: 'easeOut' }}
            >
              <div className="absolute -right-40 -top-40 h-96 w-96 rounded-full bg-cyan-500/5 blur-3xl hidden dark:block" />
              <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-blue-500/5 blur-3xl hidden dark:block" />
              
              <div className="flex max-h-[92vh] flex-col overflow-y-auto">
                <div className="relative flex items-start justify-between gap-4 border-b border-slate-200/80 bg-gradient-to-r from-slate-50/50 to-white/50 p-6 backdrop-blur-sm dark:border-cyan-500/20 dark:bg-gradient-to-r dark:from-slate-900/80 dark:via-slate-900/60 dark:to-slate-800/80 sm:p-7">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/60 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-blue-700 shadow-sm dark:border-cyan-400/30 dark:bg-cyan-500/10 dark:text-cyan-400 dark:shadow-[0_0_20px_rgba(6,182,212,0.1)] dark:backdrop-blur-sm">
                      <Radar className="h-3.5 w-3.5 dark:animate-pulse" />
                      {briefing.eyebrow}
                    </div>
                    <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl dark:text-white dark:bg-gradient-to-r dark:from-cyan-400 dark:to-blue-400 dark:bg-clip-text dark:text-transparent">
                      {briefing.title}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      <span className="text-blue-600 dark:text-cyan-400">◈</span> {briefing.subtitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeBriefing}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition-all duration-300 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700/50 dark:text-slate-400 dark:hover:border-cyan-400/30 dark:hover:bg-cyan-500/10 dark:hover:text-cyan-400"
                    aria-label="Close briefing"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="grid gap-6 p-6 lg:grid-cols-[0.95fr_1.05fr] sm:p-7">
                  <div className="space-y-5">
                    <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                      {briefing.metrics.map((metric, index) => (
                        <motion.div
                          key={metric.label}
                          className="group/metric relative overflow-hidden rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md dark:border-cyan-500/20 dark:bg-slate-800/40 dark:backdrop-blur-sm dark:hover:border-cyan-400/40 dark:hover:bg-slate-800/60 dark:hover:shadow-[0_0_30px_rgba(6,182,212,0.05)]"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.06 }}
                        >
                          <div className="absolute right-0 top-0 h-24 w-24 rounded-full bg-gradient-to-br from-blue-500/5 to-indigo-500/5 opacity-0 transition-opacity duration-300 group-hover/metric:opacity-100 dark:from-cyan-500/5 dark:to-blue-500/5" />
                          <div className="relative">
                            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-cyan-400">{metric.label}</div>
                            <div className="mt-2 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{metric.value}</div>
                            <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">{metric.caption}</div>
                          </div>
                          <div className="absolute bottom-0 left-0 h-[2px] w-0 bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500 group-hover/metric:w-full dark:from-cyan-400 dark:to-blue-400" />
                        </motion.div>
                      ))}
                    </div>
                    <motion.div
                      className="relative overflow-hidden rounded-xl border border-red-200/80 bg-gradient-to-br from-red-50/80 to-rose-50/80 p-5 transition-all duration-300 hover:shadow-md dark:border-red-500/20 dark:from-red-500/5 dark:to-rose-500/5 dark:backdrop-blur-sm dark:hover:border-red-400/30"
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-red-500/5 to-rose-500/5 dark:from-red-500/5 dark:to-rose-500/5" />
                      <div className="relative flex items-start gap-3">
                        <div className="rounded-full bg-red-500/10 p-2 border border-red-200/60 dark:border-red-400/20">
                          <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                        </div>
                        <div>
                          <div className="text-sm font-bold text-red-900 dark:text-red-400">Potential Risk</div>
                          <div className="mt-1 text-sm leading-6 text-red-700 dark:text-red-300/80">{briefing.risk}</div>
                        </div>
                      </div>
                      <div className="absolute bottom-0 left-0 h-[1px] w-full bg-gradient-to-r from-red-400/50 via-transparent to-transparent dark:from-red-400/50" />
                    </motion.div>
                  </div>

                  <div className="space-y-5">
                    {briefing.sections.map((section, index) => (
                      <motion.div
                        key={section.title}
                        className="group rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all duration-300 hover:shadow-md dark:border-cyan-500/20 dark:bg-slate-800/40 dark:backdrop-blur-sm dark:hover:border-cyan-400/30 dark:hover:bg-slate-800/60"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + index * 0.05 }}
                      >
                        <h3 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white">
                          <Target className="h-4 w-4 text-blue-600 dark:text-cyan-400" />
                          {section.title}
                        </h3>
                        <div className="mt-3 space-y-2.5">
                          {section.items.map((item) => (
                            <div key={item} className="flex items-start gap-2.5 text-sm leading-6 text-slate-700 dark:text-slate-300">
                              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-600 dark:text-cyan-400" />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                        <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-500 group-hover:w-full dark:from-cyan-400 dark:to-blue-400" />
                      </motion.div>
                    ))}

                    <motion.div
                      className="relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50/80 to-white p-5 transition-all duration-300 hover:shadow-md dark:border-cyan-500/20 dark:from-cyan-500/5 dark:to-blue-500/5 dark:backdrop-blur-sm dark:hover:border-cyan-400/30"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 }}
                    >
                      <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-blue-500/5 blur-2xl dark:bg-cyan-500/5" />
                      <div className="relative">
                        <div className="flex items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                          <Activity className="h-4 w-4 text-blue-600 dark:text-cyan-400 dark:animate-pulse" />
                          Recommended Action
                        </div>
                        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
                          <button
                            type="button"
                            onClick={() => runAction(briefing.primaryAction)}
                            className="group/action relative inline-flex h-11 items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-600/30 active:scale-[0.98] dark:from-cyan-500 dark:to-blue-500 dark:shadow-[0_0_30px_rgba(6,182,212,0.2)] dark:hover:shadow-[0_0_50px_rgba(6,182,212,0.4)]"
                          >
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover/action:translate-x-[200%] transition-transform duration-1000" />
                            {briefing.primaryAction.label}
                            <ArrowRight className="h-4 w-4 group-hover/action:translate-x-1 transition-transform" />
                          </button>
                          <button
                            type="button"
                            onClick={() => runAction(briefing.secondaryAction)}
                            className="inline-flex h-11 items-center justify-center gap-2.5 rounded-xl border border-slate-300/80 bg-white px-6 text-sm font-semibold text-slate-800 shadow-sm transition-all duration-300 hover:bg-slate-50 hover:shadow-md dark:border-slate-700/50 dark:bg-slate-800/40 dark:text-slate-300 dark:backdrop-blur-sm dark:hover:border-cyan-400/40 dark:hover:bg-slate-800/60 dark:hover:text-white"
                          >
                            {briefing.secondaryAction.label}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  )
}