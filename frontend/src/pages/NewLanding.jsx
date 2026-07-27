import { useState, useEffect, useRef } from 'react'
import { Link, Routes, Route, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Code,
  DollarSign,
  FileText,
  Globe,
  Layers,
  LayoutDashboard,
  Mail,
  Menu,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  Sun,
  TrendingUp,
  Users,
  X,
  Zap,
} from 'lucide-react'

// ============================================
// THEME CONTEXT
// ============================================
const useTheme = () => {
  const [theme, setTheme] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('theme') || 'light'
    }
    return 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return { theme, toggleTheme }
}

// ============================================
// NAVBAR
// ============================================
const Navbar = () => {
  const { theme, toggleTheme } = useTheme()
  const location = useLocation()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [solutionsOpen, setSolutionsOpen] = useState(false)
  const [companyOpen, setCompanyOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const navLinks = [
    { label: 'Features', href: '/#features' },
    {
      label: 'Solutions',
      href: '#',
      dropdown: true,
      items: [
        'Digital Marketing Agencies',
        'Creative Agencies',
        'IT Services Companies',
        'Software Development Companies',
        'Product Engineering Companies',
      ],
    },
    { label: 'AI Workforce', href: '/ai-workforce' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'Resources', href: '/resources' },
    {
      label: 'Company',
      href: '#',
      dropdown: true,
      items: ['About Us', 'Careers', 'Partners', 'Contact Us'],
    },
  ]

  const isActive = (path) => {
    if (path.startsWith('/#')) return location.pathname === '/' && location.hash === path.slice(1)
    if (path === '/') return location.pathname === '/'
    return location.pathname === path
  }

  return (
    <nav className={`sticky top-0 z-50 border-b border-gray-200 bg-white/80 backdrop-blur-xl transition-shadow dark:border-gray-800 dark:bg-gray-900/80 ${
      scrolled ? 'shadow-lg' : ''
    }`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="text-base font-extrabold leading-none text-gray-900 dark:text-white">SynTask</div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Agency OS</div>
          </div>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden items-center gap-6 md:flex">
          {navLinks.map((link) => (
            <div key={link.label} className="relative group">
              {link.dropdown ? (
                <div
                  className="relative"
                  onMouseEnter={() => {
                    if (link.label === 'Solutions') setSolutionsOpen(true)
                    if (link.label === 'Company') setCompanyOpen(true)
                  }}
                  onMouseLeave={() => {
                    if (link.label === 'Solutions') setSolutionsOpen(false)
                    if (link.label === 'Company') setCompanyOpen(false)
                  }}
                >
                  <button
                    className={`flex items-center gap-1 text-sm font-medium transition-colors ${
                      location.pathname === '/' && link.label === 'Solutions'
                        ? 'text-orange-500 dark:text-orange-400'
                        : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                    }`}
                  >
                    {link.label}
                    <ChevronDown className="h-3 w-3" />
                  </button>
                  <AnimatePresence>
                    {(link.label === 'Solutions' ? solutionsOpen : companyOpen) && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="absolute left-0 mt-2 w-56 rounded-xl border border-gray-200 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-900"
                      >
                        {link.items.map((item) => (
                          <a
                            key={item}
                            href="#"
                            className="block rounded-lg px-4 py-2 text-sm text-gray-700 transition hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            {item}
                          </a>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <Link
                  to={link.href}
                  className={`relative text-sm font-medium transition-colors ${
                    isActive(link.href)
                      ? 'text-orange-500 dark:text-orange-400'
                      : 'text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white'
                  }`}
                >
                  {link.label}
                  {isActive(link.href) && (
                    <motion.div
                      layoutId="nav-underline"
                      className="absolute -bottom-[1px] left-0 right-0 h-0.5 bg-orange-500"
                    />
                  )}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          <button className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <Search className="h-5 w-5" />
          </button>
          <button
            onClick={toggleTheme}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <Link
            to="/login"
            className="hidden text-sm font-medium text-gray-600 transition hover:text-gray-900 dark:text-gray-300 dark:hover:text-white sm:inline"
          >
            Login
          </Link>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="border-t border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 md:hidden"
          >
            <div className="space-y-1 px-4 py-3">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  to={link.href}
                  className={`block py-2 text-sm font-medium ${
                    isActive(link.href)
                      ? 'text-orange-500 dark:text-orange-400'
                      : 'text-gray-600 dark:text-gray-300'
                  }`}
                  onClick={() => setIsMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                to="/login"
                className="block py-2 text-sm font-medium text-gray-600 dark:text-gray-300"
                onClick={() => setIsMenuOpen(false)}
              >
                Login
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}

// ============================================
// FOOTER
// ============================================
const Footer = () => {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubscribe = (e) => {
    e.preventDefault()
    if (email) {
      setSubscribed(true)
      setEmail('')
      setTimeout(() => setSubscribed(false), 3000)
    }
  }

  const footerSections = [
    {
      title: 'Product',
      links: ['Features', 'AI Workforce', 'Integrations', "What's New", 'Roadmap'],
    },
    {
      title: 'Solutions',
      links: [
        'Digital Marketing Agencies',
        'Creative Agencies',
        'IT Services Companies',
        'Software Development Companies',
        'Product Engineering Companies',
      ],
    },
    {
      title: 'Resources',
      links: ['Blog', 'Guides & Ebooks', 'Templates', 'Case Studies', 'Help Center'],
    },
    {
      title: 'Company',
      links: ['About Us', 'Careers', 'Partners', 'Contact Us'],
    },
  ]

  return (
    <footer className="bg-navy-dark text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-6">
          {/* Brand */}
          <div className="lg:col-span-1">
            <Link to="/" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500">
                <Layers className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="text-base font-extrabold leading-none">SynTask</div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Agency OS</div>
              </div>
            </Link>
            <p className="mt-4 text-sm text-gray-400">
              The AI Business Operating System built exclusively for agencies & IT companies.
            </p>
            <div className="mt-4 flex gap-3">
              {['LinkedIn', 'Twitter', 'YouTube', 'Facebook', 'Instagram'].map((social) => (
                <button key={social} className="text-gray-400 transition hover:text-white">
                  <span className="sr-only">{social}</span>
                  <div className="h-5 w-5 rounded bg-gray-700/50" />
                </button>
              ))}
            </div>
          </div>

          {/* Links */}
          {footerSections.map((section) => (
            <div key={section.title}>
              <h4 className="text-sm font-semibold text-white">{section.title}</h4>
              <ul className="mt-3 space-y-2">
                {section.links.map((link) => (
                  <li key={link}>
                    <a href="#" className="text-sm text-gray-400 transition hover:text-white">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter */}
          <div className="lg:col-span-1">
            <h4 className="text-sm font-semibold text-white">Stay Updated</h4>
            <p className="mt-2 text-sm text-gray-400">
              Get tips, updates & offers straight to your inbox.
            </p>
            <form onSubmit={handleSubscribe} className="mt-3 flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="flex-1 rounded-full border border-gray-700 bg-gray-800/50 px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none"
                required
              />
              <button
                type="submit"
                className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Send
              </button>
            </form>
            {subscribed && (
              <p className="mt-2 text-sm text-green-400">Subscribed successfully!</p>
            )}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 border-t border-gray-800 pt-8 text-sm text-gray-400">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p>© 2026 SynTask. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="transition hover:text-white">Privacy Policy</a>
              <a href="#" className="transition hover:text-white">Terms of Service</a>
              <a href="#" className="transition hover:text-white">Security</a>
              <a href="#" className="transition hover:text-white">Sitemap</a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ============================================
// SECTION HEADER COMPONENT
// ============================================
const SectionHeader = ({ eyebrow, title, subtitle, orangeText }) => {
  if (!orangeText) {
    return (
      <div className="mx-auto max-w-3xl text-center">
        {eyebrow && (
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">
            {eyebrow}
          </p>
        )}
        <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">{subtitle}</p>
        )}
      </div>
    )
  }

  const parts = title.split(orangeText)
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl lg:text-5xl">
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && <span className="text-orange-500">{orangeText}</span>}
          </span>
        ))}
      </h2>
      {subtitle && (
        <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">{subtitle}</p>
      )}
    </div>
  )
}

// ============================================
// TESTIMONIALS CAROUSEL (Shared Component)
// ============================================
const TestimonialsCarousel = ({ testimonials }) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    if (isPaused) return
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % testimonials.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [isPaused, testimonials.length])

  const next = () => setCurrentIndex((prev) => (prev + 1) % testimonials.length)
  const prev = () => setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length)

  return (
    <div className="relative" onMouseEnter={() => setIsPaused(true)} onMouseLeave={() => setIsPaused(false)}>
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-700 dark:bg-gray-800">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentIndex}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5 }}
            className="text-center"
          >
            <div className="mb-4 flex justify-center text-orange-400">⭐⭐⭐⭐⭐</div>
            <p className="text-lg text-gray-700 dark:text-gray-200">"{testimonials[currentIndex].quote}"</p>
            <div className="mt-4">
              <p className="font-semibold text-gray-900 dark:text-white">{testimonials[currentIndex].name}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">{testimonials[currentIndex].title}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      <button
        onClick={prev}
        className="absolute left-0 top-1/2 -translate-x-4 -translate-y-1/2 rounded-full bg-white p-2 shadow-lg dark:bg-gray-800"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <button
        onClick={next}
        className="absolute right-0 top-1/2 translate-x-4 -translate-y-1/2 rounded-full bg-white p-2 shadow-lg dark:bg-gray-800"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
      <div className="mt-4 flex justify-center gap-2">
        {testimonials.map((_, index) => (
          <button
            key={index}
            onClick={() => setCurrentIndex(index)}
            className={`h-2 w-2 rounded-full transition ${
              index === currentIndex ? 'bg-orange-500 w-4' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

// ============================================
// PAGE 1: HOMEPAGE
// ============================================
const HomePage = () => {
  const painPoints = [
    { icon: '🔄', title: 'Too Many Tools', desc: 'Switching between 10+ apps wastes time and money.' },
    { icon: '📊', title: 'Scattered Data', desc: 'Information is everywhere and nothing is in sync.' },
    { icon: '⚙️', title: 'Manual Work', desc: 'Repetitive tasks slow down your team and growth.' },
    { icon: '👁', title: 'No Real-Time Visibility', desc: "You can't track what's happening in your business right now." },
    { icon: '⏰', title: 'Missed Deadlines', desc: 'Important tasks slip through the cracks.' },
    { icon: '📈', title: 'Unpredictable Growth', desc: 'Without a system, scaling becomes messy & risky.' },
  ]

  const modules = [
    {
      title: 'Sales OS',
      color: 'green',
      icon: '📈',
      features: ['CRM, Leads & Pipeline', 'Client Management', 'WhatsApp & Email', 'Sales Reports'],
    },
    {
      title: 'Project OS',
      color: 'blue',
      icon: '📋',
      features: ['Projects & Tasks', 'Milestones', 'Timesheets', 'Calendar, Approvals'],
    },
    {
      title: 'People OS',
      color: 'purple',
      icon: '👥',
      features: ['HR Management', 'Attendance', 'Leave & Holidays', 'Performance, Employee Portal'],
    },
    {
      title: 'Recruitment OS',
      color: 'orange',
      icon: '🎯',
      features: ['ATS, Candidates', 'Interview Scheduling', 'Resume Parsing', 'Offer & Onboarding'],
    },
    {
      title: 'Finance OS',
      color: 'teal',
      icon: '💰',
      features: ['Invoices, Estimates', 'Payments, Expenses', 'Financial Reports'],
    },
    {
      title: 'AI OS',
      color: 'pink',
      icon: '🤖',
      features: ['AI Sales Assistant', 'AI Recruiter', 'AI Project Manager', 'AI Marketing Assistant', 'AI Business Analyst'],
    },
  ]

  const colorMap = {
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    teal: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
    pink: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
  }

  const testimonials = [
    {
      quote:
        "SynTask replaced 8+ tools for our agency. We save 25+ hours every week and our team is 3x more productive now.",
      name: 'Rohit Sharma',
      title: 'CEO BrandBoost Digital',
    },
    {
      quote:
        'The AI assistant is a game changer. From proposals to follow-ups, everything is faster and smarter.',
      name: 'Neha Kapoor',
      title: 'COO KreativeWorx',
    },
    {
      quote:
        'Finally, a platform that understands agencies. Project delivery, HR, billing – everything in one place!',
      name: 'Vikram Patel',
      title: 'CTO WebVertex Technologies',
    },
  ]

  const stats = [
    { value: '500+', label: 'Companies Trust Us' },
    { value: '98%', label: 'Customer Satisfaction' },
    { value: '3X', label: 'Increase in Productivity' },
    { value: '60%', label: 'Reduction in Tool Cost' },
    { value: '24/7', label: 'AI Assistant Support' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* HERO */}
      <section className="relative overflow-hidden bg-white dark:bg-gray-900">
        <div className="absolute inset-0">
          <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-orange-200/30 blur-3xl dark:bg-orange-900/20" />
          <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-blue-200/20 blur-3xl dark:bg-blue-900/10" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:grid lg:grid-cols-2 lg:gap-12 lg:py-24">
          {/* Left Column */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm text-orange-700 dark:border-orange-800/50 dark:bg-orange-900/30 dark:text-orange-300">
              <span className="text-orange-500">✦</span>
              ONE PLATFORM. ZERO CHAOS.
            </div>

            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-5xl lg:text-6xl">
              The Agency
              <br />
              Operating System
              <br />
              You've Been
              <br />
              <span className="text-orange-500">Waiting For.</span>
            </h1>

            <p className="mt-6 text-lg text-gray-600 dark:text-gray-300">
              Run your entire agency from one intelligent platform. Manage clients, projects, teams,
              finances & more – all in one place.
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
              >
                Start Free Trial
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/stories"
                className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Book a Demo
                <Calendar className="h-4 w-4" />
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-6 text-sm text-gray-500 dark:text-gray-400">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                14 Days Free Trial
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                No Credit Card
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Cancel Anytime
              </span>
            </div>

            <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
              Trusted by 500+ agencies & service companies worldwide
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              {['Digital Uprising', 'Pixel Perfect', 'Brandshark', 'DesignLab', 'Codecrate'].map((brand) => (
                <span
                  key={brand}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 dark:border-gray-700 dark:text-gray-300"
                >
                  {brand}
                </span>
              ))}
            </div>
          </motion.div>

          {/* Right Column - Dashboard Mockup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-10 lg:mt-0"
          >
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
              {/* Dashboard Header */}
              <div className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">Welcome back, Ankit 👋</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Here's what's happening with your agency today.
                    </p>
                  </div>
                  <Settings className="h-5 w-5 text-gray-400" />
                </div>
              </div>

              {/* Stats Pills */}
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                {[
                  { label: 'Revenue', value: '$128,430', change: '+28.1%' },
                  { label: 'Projects', value: '28', change: '+32%' },
                  { label: 'Clients', value: '64', change: '+14%' },
                  { label: 'Team Members', value: '48', change: '+6%' },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl bg-gray-50 p-3 dark:bg-gray-700/50">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
                    <p className="text-lg font-bold text-gray-900 dark:text-white">{stat.value}</p>
                    <p className="text-xs text-green-500">{stat.change}</p>
                  </div>
                ))}
              </div>

              {/* Charts */}
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Project Progress</p>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="relative h-20 w-20">
                      <div className="absolute inset-0 rounded-full border-4 border-orange-500" style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }} />
                      <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-900 dark:text-white">75%</div>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <div>In Progress: 5</div>
                      <div>Pending: 2</div>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Revenue Overview</p>
                  <div className="mt-2 flex h-16 items-end gap-1">
                    {[40, 60, 45, 70, 55, 80, 65].map((height, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded bg-orange-400"
                        style={{ height: `${height}%` }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Assistant */}
              <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                <div className="flex items-center gap-3 rounded-xl bg-orange-50 p-3 dark:bg-orange-900/20">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white">
                    <MessageSquare className="h-4 w-4" />
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Good morning, Ankit 👋 You have 3 tasks, 2 meetings and 1 project deadline today.
                    Ask me anything...
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className="bg-gray-50 py-20 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Stop Juggling Multiple Tools"
            title="We built SynTask to eliminate these everyday struggles."
          />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {painPoints.map((point, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-start gap-4">
                  <span className="text-2xl">{point.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{point.title}</h3>
                      <span className="text-xs text-red-500">✗</span>
                    </div>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{point.desc}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Solution Banner */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 rounded-2xl border border-green-200 bg-green-50 p-6 dark:border-green-800/50 dark:bg-green-900/20"
          >
            <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-500 text-white">
                  <Layers className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    SynTask is <span className="text-orange-500">the Solution</span>
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    One AI-powered platform to manage everything, automate workflows, bring your team & data together and help you grow predictably.
                  </p>
                </div>
              </div>
              <Link
                to="/ai-workforce"
                className="whitespace-nowrap text-sm font-semibold text-orange-500 transition hover:text-orange-600"
              >
                See How It Works →
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ALL-IN-ONE OS */}
      <section className="py-20 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="All-in-One AI Business OS"
            title="All-in-One AI Business Operating System"
            orangeText="AI Business"
            subtitle="Everything you need. Nothing you don't."
          />

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((module, index) => (
              <motion.div
                key={module.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className={`inline-flex rounded-xl ${colorMap[module.color]} p-3`}>
                  <span className="text-2xl">{module.icon}</span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{module.title}</h3>
                <ul className="mt-3 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                  {module.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <a href="#" className="mt-4 inline-block text-sm font-semibold text-orange-500 transition hover:text-orange-600">
                  Learn more →
                </a>
              </motion.div>
            ))}
          </div>

          {/* Capability Pillars */}
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: '🤖', title: 'AI-Powered Automation', desc: 'Save hours every day with smart automations.' },
              { icon: '📊', title: 'Real-Time Insights', desc: 'Make faster decisions with live dashboards.' },
              { icon: '🔒', title: 'Secure & Reliable', desc: 'Enterprise-grade security for your data.' },
              { icon: '📈', title: 'Scalable for Growth', desc: 'From 5 to 500+ team members – we grow with you.' },
            ].map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-gray-200 bg-white p-6 text-center dark:border-gray-700 dark:bg-gray-800"
              >
                <span className="text-3xl">{item.icon}</span>
                <h4 className="mt-3 font-semibold text-gray-900 dark:text-white">{item.title}</h4>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="bg-gray-50 py-20 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">Testimonials</p>
              <h2 className="mt-3 text-3xl font-bold text-gray-900 dark:text-white">
                Loved by Agencies.
                <br />
                Trusted by Leaders.
              </h2>
              <p className="mt-4 text-gray-600 dark:text-gray-400">
                Real results from real companies.
              </p>
              <Link
                to="/stories"
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-orange-500 transition hover:text-orange-600"
              >
                View All Stories →
              </Link>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((testimonial, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                  viewport={{ once: true }}
                  className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                >
                  <div className="flex text-orange-400">
                    {'⭐'.repeat(5)}
                  </div>
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">"{testimonial.quote}"</p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                      {testimonial.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{testimonial.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{testimonial.title}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* STATS BAR */}
      <section className="bg-navy-dark py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 text-center sm:grid-cols-5">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                viewport={{ once: true }}
              >
                <div className="text-2xl font-bold text-orange-500 sm:text-3xl">{stat.value}</div>
                <div className="mt-1 text-xs text-gray-400 sm:text-sm">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ROI COMPARISON */}
      <section className="py-20 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
                More Productivity.
                <br />
                More Profits.
              </h2>
              <p className="mt-4 text-gray-600 dark:text-gray-400">
                Here's how SynTask creates impact for your business.
              </p>
              <Link
                to="/compare"
                className="mt-4 inline-flex items-center gap-2 rounded-full border border-orange-500 px-6 py-2.5 font-semibold text-orange-500 transition hover:bg-orange-50 dark:hover:bg-orange-900/20"
              >
                Calculate Your ROI →
              </Link>
            </div>

            <div className="grid gap-6 sm:grid-cols-3">
              {/* Before */}
              <div className="rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-800/50 dark:bg-red-900/20">
                <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">Before SynTask</h4>
                <ul className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {['10+ Disconnected Tools', 'Manual Work & Errors', 'No Real-Time Visibility', 'Missed Deadlines', 'High Operational Costs'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="text-red-500">✗</span> {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 text-center text-xs font-semibold uppercase text-red-500">CHAOS & COMPLEXITY</div>
              </div>

              {/* With SynTask */}
              <div className="rounded-2xl border-2 border-green-500 bg-green-50 p-6 dark:border-green-400/50 dark:bg-green-900/20">
                <h4 className="text-sm font-semibold text-green-600 dark:text-green-400">With SynTask</h4>
                <ul className="mt-3 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                  {['One Unified Platform', 'Automated Workflows', 'Real-Time Insights', 'On-Time Delivery', 'Lower Costs, Higher Profits'].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" /> {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-4 text-center text-xs font-semibold uppercase text-green-500">CLARITY & GROWTH</div>
              </div>

              {/* Savings */}
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-6 text-center dark:border-orange-800/50 dark:bg-orange-900/20">
                <div className="text-3xl font-bold text-orange-500">$8,200+</div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Typical Monthly Savings</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">By consolidating tools, automating work & improving efficiency.</p>
                <div className="mt-4 rounded-lg bg-white/60 p-3 dark:bg-gray-800/60">
                  <p className="text-lg font-bold text-orange-500">ROI in 90 Days: 312%</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="relative overflow-hidden bg-navy-dark py-20">
        <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-orange-500/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="text-6xl mb-6">🤖</div>
          <h2 className="text-3xl font-bold text-white sm:text-4xl lg:text-5xl">
            Ready to Transform Your Agency?
          </h2>
          <p className="mt-4 text-lg text-gray-300">
            Join thousands of agencies already running smarter with SynTask.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/stories"
              className="inline-flex items-center gap-2 rounded-full border border-gray-600 px-6 py-3 font-semibold text-gray-300 transition hover:border-gray-400 hover:bg-white/5"
            >
              Book a Demo
              <Calendar className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            <span>✓ 14 Days Free Trial</span>
            <span>✓ No Setup Fees</span>
            <span>✓ Cancel Anytime</span>
            <span>✓ Dedicated Onboarding</span>
          </div>
        </div>
      </section>
    </motion.div>
  )
}

// ============================================
// PAGE 2: CUSTOMER STORIES
// ============================================
const CustomerStoriesPage = () => {
  const stories = [
    {
      company: 'WebClue',
      type: 'Digital Marketing Agency',
      badge: '25+ Clients',
      quote: 'SynTask helped us automate reporting and increase our productivity by 45%.',
      challenge: 'Using 8+ tools for project management, reporting, client communication and time tracking.',
      solution: 'Replaced all tools with SynTask\'s unified platform and automated workflows.',
      results: ['45% increase in team productivity', '60% less time on reporting', '25% more projects delivered'],
      stats: ['45% Productivity Increase', '60% Time Saved', '25% More Projects'],
    },
    {
      company: 'Teqnovate',
      type: 'IT Services Company',
      badge: '120+ Employees',
      quote: 'Our support tickets, SLAs and client communication are now 100% streamlined.',
      challenge: 'Scattered communication, missed SLAs and no visibility into ticket resolution.',
      solution: 'Implemented SynTask for ticketing, knowledge base, SLA management and automation.',
      results: ['90% faster response time', '35% more ticket resolution', '100% SLA compliance'],
      stats: ['90% Faster Response', '35% More Resolutions', '100% SLA Compliance'],
    },
    {
      company: 'PixelCraft',
      type: 'Software Development Company',
      badge: '50+ Projects',
      quote: 'From requirements to deployment, everything lives in SynTask. Total visibility, zero chaos.',
      challenge: 'No clear visibility, constant context switching and project delays.',
      solution: 'Used SynTask for projects, tasks, time tracking, collaboration and client portal.',
      results: ['60% faster delivery', '100% on-time releases', 'Better client satisfaction'],
      stats: ['60% Faster Delivery', '100% On-time Releases', '98% Client Satisfaction'],
    },
  ]

  const storyTestimonials = [
    {
      quote: 'SynTask is the backbone of our operations. Everything is organized, automated and easy to track. Our team can\'t imagine working without it.',
      name: 'Aarav Mehta',
      title: 'CEO WebClue',
    },
    {
      quote: 'The automation and AI features in SynTask helped us save hours every day. It\'s like having an extra team that never sleeps.',
      name: 'Neha Kapoor',
      title: 'Operations Head Teqnovate',
    },
    {
      quote: 'Finally, a platform built for service companies. SynTask gives us complete visibility and helps us deliver projects on time, every time.',
      name: 'Rohit Sharma',
      title: 'CTO PixelCraft',
    },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* Hero */}
      <section className="bg-white py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">⭐ Customer Stories</p>
          <h1 className="mt-3 text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl">
            Real Stories. <span className="text-orange-500">Real Results.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-gray-600 dark:text-gray-300">
            See how agencies and IT companies are using SynTask to streamline operations, delight clients and grow their business.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-8">
            <div><span className="text-2xl font-bold text-orange-500">4.9/5</span> <span className="text-sm text-gray-500 dark:text-gray-400">Average Rating</span></div>
            <div><span className="text-2xl font-bold text-orange-500">500+</span> <span className="text-sm text-gray-500 dark:text-gray-400">Happy Customers</span></div>
            <div><span className="text-2xl font-bold text-orange-500">25+</span> <span className="text-sm text-gray-500 dark:text-gray-400">Countries</span></div>
            <div><span className="text-2xl font-bold text-orange-500">98%</span> <span className="text-sm text-gray-500 dark:text-gray-400">Customer Satisfaction</span></div>
          </div>
        </div>
      </section>

      {/* Stories Grid */}
      <section className="bg-gray-50 py-16 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-8 lg:grid-cols-3">
            {stories.map((story, index) => (
              <motion.div
                key={story.company}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{story.company}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{story.type}</p>
                  </div>
                  <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                    {story.badge}
                  </span>
                </div>
                <p className="mt-4 text-sm italic text-gray-600 dark:text-gray-300">"{story.quote}"</p>
                <div className="mt-4 space-y-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                  <div>
                    <span className="text-xs font-semibold uppercase text-orange-500">Challenge</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{story.challenge}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase text-green-500">Solution</span>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{story.solution}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase text-blue-500">Results</span>
                    <ul className="mt-1 space-y-1 text-sm text-gray-600 dark:text-gray-400">
                      {story.results.map((result) => (
                        <li key={result} className="flex items-center gap-2">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {result}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                  {story.stats.map((stat) => (
                    <span key={stat} className="rounded-full bg-orange-50 px-3 py-1 text-xs font-medium text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                      {stat}
                    </span>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Impact Bar */}
      <section className="bg-navy-dark py-12">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <h3 className="text-xl font-bold text-white">Businesses love the way SynTask works for them.</h3>
          <p className="text-sm text-gray-400">Numbers that speak for themselves.</p>
          <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { value: '₹200Cr+', label: 'Revenue Managed' },
              { value: '10M+', label: 'Tasks Automated' },
              { value: '1M+', label: 'Time Saved (Hours)' },
              { value: '500K+', label: 'Projects Completed' },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-2xl font-bold text-orange-500 sm:text-3xl">{item.value}</div>
                <div className="mt-1 text-xs text-gray-400 sm:text-sm">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Trusted Industries */}
      <section className="py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <SectionHeader
            title="Trusted Across Industries"
            subtitle="From startup agencies to enterprise teams, SynTask adapts to the way you work."
          />
          <div className="mt-8 flex flex-wrap justify-center gap-6">
            {['📢 Digital Marketing Agencies', '✏️ Creative Agencies', '💻 IT Services Companies', '</> Software Development Companies', '🚀 Product Engineering Companies'].map((industry) => (
              <span key={industry} className="rounded-full border border-gray-200 px-4 py-2 text-sm font-medium dark:border-gray-700 dark:text-gray-300">
                {industry}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Carousel */}
      <section className="bg-gray-50 py-16 dark:bg-gray-800/50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="Testimonials"
            title="Loved by Teams, Recommended by Leaders"
          />
          <div className="mt-10">
            <TestimonialsCarousel testimonials={storyTestimonials} />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-navy-dark py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="text-4xl mb-4">🚀</div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">
            Your Success Story Could Be Next.
          </h2>
          <p className="mt-2 text-gray-400">
            Join 500+ companies that trust SynTask to run their business better.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link to="/pricing" className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-2.5 font-semibold text-white transition hover:bg-orange-600">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/compare" className="inline-flex items-center gap-2 rounded-full border border-gray-600 px-6 py-2.5 font-semibold text-gray-300 transition hover:border-gray-400 hover:bg-white/5">
              Book a Live Demo <Calendar className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-gray-400">
            <span>✓ 14 Days Free Trial</span>
            <span>✓ No Credit Card Required</span>
            <span>✓ Cancel Anytime</span>
            <span>✓ Full Onboarding Support</span>
          </div>
        </div>
      </section>
    </motion.div>
  )
}

// ============================================
// PAGE 3: AI WORKFORCE
// ============================================
const AIWorkforcePage = () => {
  const aiEmployees = [
    {
      role: 'AI Sales Manager',
      color: 'orange',
      icon: '📈',
      capabilities: ['Lead qualification', 'Follow-ups & nurturing', 'Proposals & quotations', 'Deal tracking & insights'],
    },
    {
      role: 'AI HR Manager',
      color: 'purple',
      icon: '👥',
      capabilities: ['Resume screening', 'Interview scheduling', 'JD & offer letters', 'Employee support'],
    },
    {
      role: 'AI Project Manager',
      color: 'blue',
      icon: '📋',
      capabilities: ['Task planning', 'Progress tracking', 'Risk & issue detection', 'Timeline management'],
    },
    {
      role: 'AI Marketing Assistant',
      color: 'green',
      icon: '📢',
      capabilities: ['Content creation', 'Social media posts', 'Ad copy & creatives', 'Campaign ideas'],
    },
    {
      role: 'AI Operations Manager',
      color: 'teal',
      icon: '⚙️',
      capabilities: ['Workflow optimization', 'Process automation', 'Bottleneck detection', 'Performance reports'],
    },
    {
      role: 'AI Business Analyst',
      color: 'pink',
      icon: '📊',
      capabilities: ['Data analysis', 'Business insights', 'Reports & dashboards', 'Forecasting & trends'],
    },
  ]

  const colorMap = {
    orange: 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400',
    purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400',
    blue: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
    green: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400',
    teal: 'bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400',
    pink: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30 dark:text-pink-400',
  }

  const steps = [
    { icon: '👤+', title: 'Choose Your AI Employee', desc: 'Pick the AI role you want to add to your team.' },
    { icon: '🧠', title: 'Train with Your Data', desc: 'Our AI learns your processes, tools and company knowledge.' },
    { icon: '🚀', title: 'Delegate & Automate', desc: 'Assign tasks and watch your AI employee get to work.' },
    { icon: '📈', title: 'Track & Improve', desc: 'Monitor performance, gain insights and scale your AI team.' },
  ]

  const leaderTestimonials = [
    {
      quote: 'Our AI Sales Manager increased our qualified leads by 3X. It never sleeps, never forgets, and never misses a follow-up.',
      name: 'Rohit Sharma',
      title: 'CEO GrowthHackers Marketing',
    },
    {
      quote: 'AI HR Manager reduced our hiring time by 60%. From screening to scheduling, everything is now effortless.',
      name: 'Neha Kapoor',
      title: 'Head of HR TechNovate',
    },
    {
      quote: 'AI Project Manager keeps our projects on track, risks under control, and clients always happy. It\'s like having a co-pilot.',
      name: 'Arjun Mehta',
      title: 'Delivery Head PixelCraft',
    },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* Hero */}
      <section className="bg-white py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:grid lg:grid-cols-2 lg:gap-12 lg:px-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm text-orange-700 dark:border-orange-800/50 dark:bg-orange-900/30 dark:text-orange-300">
              <span className="text-orange-500">✦</span> AI WORKFORCE
            </div>
            <h1 className="mt-6 text-4xl font-extrabold text-gray-900 dark:text-white sm:text-5xl lg:text-6xl">
              Meet Your AI Workforce.
              <br />
              They Work <span className="text-orange-500">24/7.</span>
              <br />
              You Grow.
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
              SynTask's AI employees handle the work that slows you down, so your team can focus on what truly matters.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> AI employees for every department</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Trained on best practices & your data</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Always-on. Always-learning. Always-delivering.</li>
            </ul>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link to="/pricing" className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600">
                Start Free Trial <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/stories" className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition hover:border-gray-400 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">
                Book a Demo <Calendar className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="mt-10 lg:mt-0">
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800">
              <div className="border-b border-gray-200 p-4 dark:border-gray-700">
                <h3 className="font-semibold text-gray-900 dark:text-white">AI Workforce — Your AI team is ready to work</h3>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                {aiEmployees.slice(0, 6).map((employee) => (
                  <div key={employee.role} className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{employee.role}</span>
                      <span className="text-xs text-green-500">● Online</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-200 p-4 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Today's Impact</h4>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div><span className="font-bold text-gray-900 dark:text-white">1,243</span> Tasks Completed</div>
                  <div><span className="font-bold text-gray-900 dark:text-white">185h</span> Hours Saved</div>
                  <div><span className="font-bold text-gray-900 dark:text-white">92%</span> Projects Progress</div>
                  <div><span className="font-bold text-gray-900 dark:text-white">₹4.2L</span> Cost Saved</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* AI Employee Cards */}
      <section className="bg-gray-50 py-16 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            title="An AI Employee for Every Function"
            subtitle="Delegate repetitive work, automate complex processes, and achieve more with your AI team."
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {aiEmployees.map((employee, index) => (
              <motion.div
                key={employee.role}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className={`inline-flex rounded-xl ${colorMap[employee.color]} p-3`}>
                  <span className="text-2xl">{employee.icon}</span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">{employee.role}</h3>
                <ul className="mt-3 space-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                  {employee.capabilities.map((cap) => (
                    <li key={cap} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {cap}
                    </li>
                  ))}
                </ul>
                <a href="#" className={`mt-4 inline-block text-sm font-semibold text-${employee.color}-500 transition hover:text-${employee.color}-600`}>
                  Explore →
                </a>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            title="Onboard. Train. Delegate. Scale."
          />
          <div className="relative mt-10">
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <motion.div
                  key={step.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.08 }}
                  viewport={{ once: true }}
                  className="text-center"
                >
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 text-2xl dark:bg-orange-900/30">
                    {step.icon}
                  </div>
                  <h4 className="mt-4 font-semibold text-gray-900 dark:text-white">{step.title}</h4>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{step.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Impact Stats */}
      <section className="bg-navy-dark py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 text-center sm:grid-cols-4">
            {[
              { value: '10M+', label: 'Tasks Automated' },
              { value: '1M+', label: 'Hours Saved' },
              { value: '₹200Cr+', label: 'Revenue Impacted' },
              { value: '500+', label: 'Businesses Trust Us' },
            ].map((stat) => (
              <div key={stat.label}>
                <div className="text-2xl font-bold text-orange-500 sm:text-3xl">{stat.value}</div>
                <div className="mt-1 text-xs text-gray-400 sm:text-sm">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Leader Testimonials */}
      <section className="bg-gray-50 py-16 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <SectionHeader
            eyebrow="What Leaders Say"
            title="What Leaders Say About Our AI Workforce"
          />
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {leaderTestimonials.map((testimonial, index) => (
              <motion.div
                key={testimonial.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="flex text-orange-400">⭐⭐⭐⭐⭐</div>
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">"{testimonial.quote}"</p>
                <div className="mt-4">
                  <p className="font-semibold text-gray-900 dark:text-white">{testimonial.name}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{testimonial.title}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-navy-dark py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="text-6xl mb-4">🤖</div>
          <h2 className="text-3xl font-bold text-white">Build Your AI Workforce Today</h2>
          <p className="mt-2 text-gray-400">Start with one AI employee. Scale to an entire AI-powered organization.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link to="/pricing" className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/stories" className="inline-flex items-center gap-2 rounded-full border border-gray-600 px-6 py-3 font-semibold text-gray-300 transition hover:border-gray-400 hover:bg-white/5">
              Book a Demo <Calendar className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-gray-400">
            <span>✓ 14 Days Free Trial</span>
            <span>✓ No Credit Card Required</span>
            <span>✓ Cancel Anytime</span>
            <span>✓ Full Onboarding Support</span>
          </div>
        </div>
      </section>
    </motion.div>
  )
}

// ============================================
// PAGE 4: COMPARE
// ============================================
const ComparePage = () => {
  const [activeCompetitor, setActiveCompetitor] = useState('SynTask')
  const competitors = ['SynTask', 'ClickUp', 'Monday.com', 'HubSpot', 'Zoho One', 'Salesforce']

  const comparisonData = {
    'AI-Powered Automation': ['✅', 'Limited', 'Limited', 'Limited', 'Limited', 'Limited'],
    'All-in-One Platform': ['✅', '✗', '✗', '✗', '✗', '✅'],
    'Client Management': ['✅', 'Limited', 'Limited', 'Limited', 'Limited', '✅'],
    'Project Management': ['✅', '✅', '✅', 'Limited', 'Limited', 'Limited'],
    'HR & Team Management': ['✅', 'Limited', 'Limited', 'Limited', '✅', 'Limited'],
    'Finance & Invoicing': ['✅', 'Limited', 'Limited', '✅', '✅', 'Limited'],
    'AI Workforce (Virtual Employees)': ['✅', '✗', '✗', '✗', '✗', '✗'],
    'Ease of Use': ['⭐⭐⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐', '⭐⭐⭐', '⭐⭐⭐'],
    'Integrations': ['500+', '1000+', '200+', '1500+', '1000+', '3000+'],
    'Starting Price': ['₹149/user/mo', '$7/user/mo', '$8/user/mo', '$20/user/mo', '$37/user/mo', '$25/user/mo'],
    'Best For': ['Service Companies Agencies, IT Teams', 'Teams of all sizes', 'Project-focused teams', 'Marketing & Sales Teams', 'Businesses of all sizes', 'Large Enterprises'],
  }

  const faqs = [
    'Is SynTask really an all-in-one platform?',
    'How is SynTask different from ClickUp or Monday.com?',
    'Does SynTask offer better pricing than other tools?',
    'Can I migrate my data from other platforms?',
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* Hero */}
      <section className="bg-white py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:grid lg:grid-cols-2 lg:gap-12 lg:px-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-sm text-orange-700 dark:border-orange-800/50 dark:bg-orange-900/30 dark:text-orange-300">
              <span className="text-orange-500">✦</span> COMPARE SYNTASK
            </div>
            <h1 className="mt-6 text-4xl font-extrabold text-gray-900 dark:text-white sm:text-5xl lg:text-6xl">
              SynTask vs The Rest.
              <br />
              See the <span className="text-orange-500">Clear Difference.</span>
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
              SynTask brings all your work, teams and clients together in one AI-powered platform. See how we compare with other popular tools.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm dark:bg-gray-800">👥 One Platform</span>
              <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm dark:bg-gray-800">🤖 AI-Powered</span>
              <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm dark:bg-gray-800">⚡ End-to-End Automation</span>
              <span className="rounded-full bg-gray-100 px-3 py-1.5 text-sm dark:bg-gray-800">💰 Lower Cost</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="mt-10 lg:mt-0">
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-white">All Your Work. One AI-Powered Platform.</h3>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tasks Completed</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">1,243 ↑10%</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Hours Saved</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">185h ↑26%</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Projects in Progress</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">56 ↑12%</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-700/50">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Team Productivity</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">92% ↑14%</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Competitor Toggle */}
      <section className="bg-gray-50 py-8 dark:bg-gray-800/50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-center gap-2">
            {competitors.map((comp) => (
              <button
                key={comp}
                onClick={() => setActiveCompetitor(comp)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  comp === activeCompetitor
                    ? 'bg-orange-500 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {comp}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Table */}
      <section className="py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="p-3 text-left font-semibold text-gray-900 dark:text-white">Features</th>
                  {competitors.map((comp) => (
                    <th
                      key={comp}
                      className={`p-3 text-center font-semibold ${
                        comp === 'SynTask' ? 'bg-orange-500 text-white' : 'text-gray-900 dark:text-white'
                      }`}
                    >
                      {comp}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(comparisonData).map(([feature, values]) => (
                  <tr key={feature} className="border-b border-gray-200 dark:border-gray-700">
                    <td className="p-3 font-medium text-gray-900 dark:text-white">{feature}</td>
                    {values.map((value, i) => (
                      <td key={i} className="p-3 text-center">
                        {value === '✅' ? (
                          <span className="text-green-500">✅</span>
                        ) : value === '✗' ? (
                          <span className="text-gray-400">✗</span>
                        ) : value === 'Limited' ? (
                          <span className="text-gray-400">Limited</span>
                        ) : (
                          <span className="text-gray-700 dark:text-gray-300">{value}</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Savings Banner */}
      <section className="bg-gray-50 py-12 dark:bg-gray-800/50">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-green-200 bg-green-50 p-8 dark:border-green-800/50 dark:bg-green-900/20">
            <div className="text-4xl mb-3">💰</div>
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">
              Companies save up to 60% on software costs by switching to SynTask.
            </h3>
            <p className="mt-2 text-gray-600 dark:text-gray-400">One platform. More productivity. Lower cost. Higher growth.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-6 text-sm">
              <span className="font-bold text-orange-500">60% Cost Savings</span>
              <span className="font-bold text-orange-500">3X More Productive</span>
              <span className="font-bold text-orange-500">100% Work in One Place</span>
            </div>
          </div>
        </div>
      </section>

      {/* Real Results */}
      <section className="py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400">
                <Layers className="h-6 w-6" />
              </div>
              <div>
                <p className="font-bold text-gray-900 dark:text-white">TechNovo Solutions</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Replaced 6 tools with SynTask</p>
              </div>
            </div>
            <p className="mt-4 text-gray-600 dark:text-gray-300">
              "We replaced 6 different tools with SynTask and saved over ₹18 Lakhs annually. Our team is 3X more productive now."
              <br />
              <span className="font-semibold text-gray-900 dark:text-white">— Rahul Mehta, CEO TechNovo Solutions</span>
            </p>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div><span className="text-xl font-bold text-orange-500">₹18L+</span><p className="text-xs text-gray-500">Annual Savings</p></div>
              <div><span className="text-xl font-bold text-orange-500">120+</span><p className="text-xs text-gray-500">Hours Saved/Month</p></div>
              <div><span className="text-xl font-bold text-orange-500">3X</span><p className="text-xs text-gray-500">Productivity Improvement</p></div>
              <div><span className="text-xl font-bold text-orange-500">98%</span><p className="text-xs text-gray-500">Client Satisfaction</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-gray-50 py-16 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:grid lg:grid-cols-2 lg:gap-12 lg:px-8">
          <div>
            <SectionHeader
              title="Frequently Compared. Clearly Answered."
            />
            <div className="mt-6 space-y-3">
              {faqs.map((faq, index) => (
                <div key={index} className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <button className="flex w-full items-center justify-between text-left">
                    <span className="font-medium text-gray-900 dark:text-white">{faq}</span>
                    <Plus className="h-4 w-4 text-gray-500" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-10 lg:mt-0">
            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-8 dark:border-orange-800/50 dark:bg-orange-900/20">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Still comparing?</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-400">
                Book a personalized demo and see why 500+ businesses switched to SynTask.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to="/stories" className="rounded-full bg-orange-500 px-6 py-2.5 font-semibold text-white transition hover:bg-orange-600">
                  Book a Demo
                </Link>
                <Link to="/contact" className="rounded-full border border-orange-500 px-6 py-2.5 font-semibold text-orange-500 transition hover:bg-orange-50 dark:hover:bg-orange-900/20">
                  Talk to Sales
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-navy-dark py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="text-4xl mb-4">🚀</div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Stop Switching. Start Scaling.</h2>
          <p className="mt-2 text-gray-400">Join 500+ service companies using SynTask to automate operations, deliver better and grow faster.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-gray-400">
            <span>✓ 14 Days Free Trial</span>
            <span>✓ No Credit Card Required</span>
            <span>✓ Cancel Anytime</span>
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link to="/pricing" className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-2.5 font-semibold text-white transition hover:bg-orange-600">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/stories" className="inline-flex items-center gap-2 rounded-full border border-gray-600 px-6 py-2.5 font-semibold text-gray-300 transition hover:border-gray-400 hover:bg-white/5">
              Book a Live Demo <Calendar className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </motion.div>
  )
}

// ============================================
// PAGE 5: PRICING
// ============================================
const PricingPage = () => {
  const [billingCycle, setBillingCycle] = useState('monthly')
  const [employees, setEmployees] = useState(25)
  const [tools, setTools] = useState(8)

  const plans = [
    {
      name: 'Starter',
      price: '₹1,999',
      accent: false,
      color: 'green',
      description: 'Perfect for small teams getting started.',
      features: ['Up to 5 Users', 'Sales OS', 'Project OS', 'People OS', 'Basic Reports', 'Email Support'],
      buttonText: 'Start Free Trial',
      buttonColor: 'green',
    },
    {
      name: 'Growth',
      price: '₹4,999',
      accent: true,
      color: 'blue',
      description: 'Ideal for growing agencies & IT companies.',
      features: ['Up to 20 Users', 'Recruitment OS', 'Finance OS', 'Automation (50 Workflows)', 'Client Portal', 'Priority Support'],
      buttonText: 'Start Free Trial',
      buttonColor: 'blue',
      popular: true,
    },
    {
      name: 'Business',
      price: '₹9,999',
      accent: false,
      color: 'purple',
      description: 'Advanced features for scaling businesses.',
      features: ['Up to 50 Users', 'AI Workforce (Basic)', 'Advanced Reports & Analytics', 'Automation (Unlimited)', 'Custom Roles & Permissions', 'Phone Support'],
      buttonText: 'Start Free Trial',
      buttonColor: 'purple',
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      accent: false,
      color: 'orange',
      description: 'For large teams with custom needs & security.',
      features: ['Unlimited Users', 'AI Workforce (Advanced)', 'Custom Integrations', 'Dedicated Account Manager', 'SLA & Uptime Guarantee', 'On-premise / Private Cloud'],
      buttonText: 'Contact Sales',
      buttonColor: 'orange',
    },
  ]

  const yearlyPrice = (monthlyPrice) => {
    const num = parseInt(monthlyPrice.replace(/[₹,]/g, ''))
    return `₹${(num * 10).toLocaleString()}`
  }

  const savings = employees * tools * 500
  const formattedSavings = `₹${savings.toLocaleString()}`

  const planFeatures = [
    { feature: 'Users', starter: 'Up to 5', growth: 'Up to 20', business: 'Up to 50', enterprise: 'Unlimited' },
    { feature: 'All Core Modules', starter: '✅', growth: '✅', business: '✅', enterprise: '✅' },
    { feature: 'AI Assistant', starter: 'Basic', growth: 'Basic', business: 'Advanced', enterprise: 'Advanced' },
    { feature: 'Automation', starter: '10 Workflows', growth: '50 Workflows', business: 'Unlimited', enterprise: 'Unlimited' },
    { feature: 'Storage', starter: '10 GB', growth: '50 GB', business: '200 GB', enterprise: 'Custom' },
    { feature: 'Client Portal', starter: '✅', growth: '✅', business: '✅', enterprise: '✅' },
    { feature: 'Custom Reports', starter: '—', growth: '✅', business: '✅', enterprise: '✅' },
    { feature: 'Priority Support', starter: '—', growth: '✅', business: '✅', enterprise: '24/7 Dedicated' },
    { feature: 'SLA Uptime', starter: '—', growth: '99%', business: '99.9%', enterprise: '99.99%' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* Hero */}
      <section className="bg-white py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">✦ SIMPLE PRICING. POWERFUL VALUE.</p>
          <h1 className="mt-3 text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl">
            Choose the Plan That <span className="text-orange-500">Transforms</span> Your Business
          </h1>
          <p className="mt-4 text-gray-600 dark:text-gray-300">
            All plans include access to core modules. Upgrade or downgrade at any time.
          </p>
          <div className="mt-6 flex items-center justify-center gap-4">
            <span className={`text-sm ${billingCycle === 'monthly' ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500'}`}>
              Billed Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className={`relative h-6 w-12 rounded-full transition ${
                billingCycle === 'yearly' ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${
                  billingCycle === 'yearly' ? 'left-6' : 'left-0.5'
                }`}
              />
            </button>
            <span className={`text-sm ${billingCycle === 'yearly' ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-500'}`}>
              Billed Yearly <span className="text-orange-500">Save up to 20%</span>
            </span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="bg-gray-50 py-12 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-4">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                viewport={{ once: true }}
                className={`relative rounded-2xl border p-6 shadow-sm ${
                  plan.accent
                    ? 'border-blue-200 bg-white dark:border-blue-800/50 dark:bg-gray-800'
                    : 'border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-500 px-4 py-1 text-xs font-semibold text-white">
                    MOST POPULAR
                  </div>
                )}
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-gray-900 dark:text-white">
                    {billingCycle === 'yearly' && plan.price !== 'Custom' ? yearlyPrice(plan.price) : plan.price}
                  </span>
                  {plan.price !== 'Custom' && (
                    <span className="text-sm text-gray-500">/{billingCycle === 'yearly' ? 'year' : 'month'}</span>
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">{plan.description}</p>
                <ul className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  to={plan.name === 'Enterprise' ? '/contact' : '/pricing'}
                  className={`mt-6 inline-flex w-full items-center justify-center rounded-full px-6 py-2.5 font-semibold transition ${
                    plan.accent
                      ? 'bg-blue-500 text-white hover:bg-blue-600'
                      : `border border-${plan.color}-500 text-${plan.color}-500 hover:bg-${plan.color}-50 dark:hover:bg-${plan.color}-900/20`
                  }`}
                >
                  {plan.buttonText}
                </Link>
              </motion.div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <span>🛡 14 Days Free Trial</span>
            <span>• No Credit Card Required</span>
            <span>• Cancel Anytime</span>
          </div>
        </div>
      </section>

      {/* Compare Plans + ROI */}
      <section className="py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:grid lg:grid-cols-3 lg:gap-8 lg:px-8">
          <div className="lg:col-span-2">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Compare Plans</h3>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="p-3 text-left font-semibold text-gray-900 dark:text-white">Features</th>
                    <th className="p-3 text-center font-semibold text-gray-900 dark:text-white">Starter</th>
                    <th className="p-3 text-center font-semibold text-blue-500">Growth</th>
                    <th className="p-3 text-center font-semibold text-gray-900 dark:text-white">Business</th>
                    <th className="p-3 text-center font-semibold text-gray-900 dark:text-white">Enterprise</th>
                  </tr>
                </thead>
                <tbody>
                  {planFeatures.map((row) => (
                    <tr key={row.feature} className="border-b border-gray-200 dark:border-gray-700">
                      <td className="p-3 font-medium text-gray-900 dark:text-white">{row.feature}</td>
                      <td className="p-3 text-center text-gray-600 dark:text-gray-400">{row.starter}</td>
                      <td className="p-3 text-center text-gray-600 dark:text-gray-400">{row.growth}</td>
                      <td className="p-3 text-center text-gray-600 dark:text-gray-400">{row.business}</td>
                      <td className="p-3 text-center text-gray-600 dark:text-gray-400">{row.enterprise}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ROI Calculator */}
          <div className="mt-10 lg:mt-0">
            <div className="sticky top-24 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h4 className="text-lg font-bold text-gray-900 dark:text-white">📊 Calculate Your ROI</h4>
              <div className="mt-4">
                <label className="text-sm text-gray-600 dark:text-gray-400">How many employees do you have?</label>
                <input
                  type="range"
                  min="1"
                  max="1000"
                  value={employees}
                  onChange={(e) => setEmployees(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{employees}</span>
              </div>
              <div className="mt-4">
                <label className="text-sm text-gray-600 dark:text-gray-400">How many tools are you using today?</label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={tools}
                  onChange={(e) => setTools(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-sm font-semibold text-gray-900 dark:text-white">{tools}</span>
              </div>
              <div className="mt-4 rounded-lg bg-orange-50 p-4 dark:bg-orange-900/20">
                <p className="text-sm text-gray-600 dark:text-gray-400">You can save up to</p>
                <p className="text-2xl font-bold text-orange-500">{formattedSavings}/year</p>
                <p className="text-xs text-gray-500">with SynTask</p>
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-400">
                <p>▾ Can I change my plan later?</p>
                <p>▾ Is my data secure with SynTask?</p>
                <p>▾ Do you offer onboarding support?</p>
                <p>▾ What if I exceed my user limit?</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trusted By */}
      <section className="bg-gray-50 py-12 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">Trusted by 500+ Companies Worldwide</p>
          <div className="mt-4 flex flex-wrap justify-center gap-4">
            {['WebClue Digital Agency', 'Teqnovate IT Services', 'PixelCraft Software Co.', 'GrowthHackers Marketing Agency', 'NextGen Solutions', 'InnoApps Technologies'].map((company) => (
              <span key={company} className="rounded-full border border-gray-200 px-4 py-2 text-sm dark:border-gray-700 dark:text-gray-300">
                {company}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-navy-dark py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="text-4xl mb-4">🚀</div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Ready to Transform Your Business?</h2>
          <p className="mt-2 text-gray-400">Join hundreds of agencies & IT companies already growing with SynTask.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-4">
            <Link to="/pricing" className="inline-flex items-center gap-2 rounded-full bg-orange-500 px-6 py-2.5 font-semibold text-white transition hover:bg-orange-600">
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/stories" className="inline-flex items-center gap-2 rounded-full border border-gray-600 px-6 py-2.5 font-semibold text-gray-300 transition hover:border-gray-400 hover:bg-white/5">
              Book a Live Demo <Calendar className="h-4 w-4" />
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-gray-400">
            <span>✓ 14 Days Free Trial</span>
            <span>✓ No Credit Card</span>
            <span>✓ Cancel Anytime</span>
            <span>✓ Full Onboarding Support</span>
          </div>
        </div>
      </section>
    </motion.div>
  )
}

// ============================================
// PAGE 6: RESOURCES
// ============================================
const ResourcesPage = () => {
  const [activeTab, setActiveTab] = useState('All Resources (120+)')
  const tabs = ['All Resources (120+)', 'Guides & Ebooks (24)', 'Templates (18)', 'Playbooks (16)', 'Case Studies (20)', 'Webinars (12)', 'Product Updates (10)']

  const featuredArticles = [
    {
      title: 'How to Run Your Agency Like a Well-Oiled Machine',
      category: 'Operations',
      badge: 'FEATURED',
      badgeColor: 'orange',
      image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&h=300&fit=crop',
      excerpt: 'Discover the exact framework top agencies use to streamline operations...',
      date: 'May 20, 2024',
      readTime: '8 min read',
      author: 'Ankit Sen',
    },
    {
      title: '10 Ways to Improve Team Productivity with AI',
      category: 'Productivity',
      badge: 'GUIDE',
      badgeColor: 'green',
      image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=600&h=300&fit=crop',
      excerpt: 'Practical strategies to leverage AI and automation to get more done...',
      date: 'May 15, 2024',
      readTime: '6 min read',
      author: 'Neha Kapoor',
    },
    {
      title: 'How WebClue Increased Productivity by 45% with SynTask',
      category: 'Growth',
      badge: 'CASE STUDY',
      badgeColor: 'purple',
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=600&h=300&fit=crop',
      excerpt: 'See how a digital marketing agency scaled to 25+ clients without increasing headcount.',
      date: 'May 10, 2024',
      readTime: '5 min read',
      author: 'Aarav Mehta',
    },
  ]

  const resources = [
    { icon: '📄', title: 'Agency Operations Playbook', desc: 'Step-by-step guide to build scalable operations for your agency.', format: 'PDF Guide • 24 Pages' },
    { icon: '📊', title: 'Project Management Template', desc: 'Ready-to-use project plan template to manage tasks, timelines and deliverables.', format: 'Excel Sheet • Customizable' },
    { icon: '✅', title: 'Client Onboarding Checklist', desc: 'Complete checklist to onboard clients professionally and efficiently.', format: 'Checklist • 15 Steps' },
    { icon: '📁', title: 'SOP Template Bundle', desc: '50+ SOP templates for HR, finance, projects, sales and more.', format: 'ZIP File • 50+ Templates' },
    { icon: '📈', title: 'KPI Dashboard Template', desc: 'Track the right metrics and grow your business with data.', format: 'Google Sheets • Real-time' },
    { icon: '🤖', title: 'AI Prompts for Agencies', desc: '100+ ready-to-use AI prompts for marketing, sales, HR and operations.', format: 'Document • 100+ Prompts' },
  ]

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}>
      {/* Hero */}
      <section className="bg-white py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:grid lg:grid-cols-2 lg:gap-12 lg:px-8">
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }}>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-500">🏠 RESOURCES THAT HELP YOU GROW</p>
            <h1 className="mt-3 text-4xl font-bold text-gray-900 dark:text-white sm:text-5xl">
              Learn. Implement. <span className="text-orange-500">Grow.</span>
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">
              Everything for Service Companies. Guides, templates, playbooks and insights to help you streamline operations, improve productivity and scale your business with SynTask.
            </p>
            <div className="mt-6 flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="What do you want to learn today?"
                className="flex-1 bg-transparent outline-none text-gray-900 dark:text-white placeholder-gray-500"
              />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, delay: 0.2 }} className="mt-10 lg:mt-0">
            <div className="relative h-64 rounded-2xl bg-gradient-to-br from-orange-100 to-orange-200 p-8 dark:from-orange-900/30 dark:to-orange-800/20">
              <div className="absolute bottom-4 right-4 space-y-2">
                <div className="rounded-lg bg-white/80 p-3 shadow-lg dark:bg-gray-800/80">📄 Templates</div>
                <div className="rounded-lg bg-white/80 p-3 shadow-lg dark:bg-gray-800/80">📚 Guides</div>
                <div className="rounded-lg bg-white/80 p-3 shadow-lg dark:bg-gray-800/80">📖 Playbooks</div>
                <div className="rounded-lg bg-white/80 p-3 shadow-lg dark:bg-gray-800/80">📋 Case Studies</div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Category Tabs */}
      <section className="bg-gray-50 py-6 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                  tab === activeTab
                    ? 'bg-orange-500 text-white'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Articles */}
      <section className="py-16 dark:bg-gray-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Featured Articles</h2>
            <a href="#" className="text-sm font-semibold text-orange-500 transition hover:text-orange-600">View all articles →</a>
          </div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {featuredArticles.map((article, index) => (
              <motion.div
                key={article.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 }}
                viewport={{ once: true }}
                className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
              >
                <img src={article.image} alt={article.title} className="h-48 w-full object-cover" />
                <div className="p-4">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full bg-${article.badgeColor}-100 px-3 py-1 text-xs font-semibold text-${article.badgeColor}-600 dark:bg-${article.badgeColor}-900/30 dark:text-${article.badgeColor}-400`}>
                      {article.badge}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">{article.category}</span>
                  </div>
                  <h3 className="mt-2 font-semibold text-gray-900 dark:text-white">{article.title}</h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{article.excerpt}</p>
                  <div className="mt-3 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span>{article.date}</span>
                    <span>•</span>
                    <span>{article.readTime}</span>
                    <span>•</span>
                    <span>By {article.author}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Resource Library */}
      <section className="bg-gray-50 py-16 dark:bg-gray-800/50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Explore Our Resource Library</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {resources.map((resource, index) => (
              <motion.div
                key={resource.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                viewport={{ once: true }}
                className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="text-3xl">{resource.icon}</div>
                <h4 className="mt-3 font-semibold text-gray-900 dark:text-white">{resource.title}</h4>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{resource.desc}</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500 dark:text-gray-400">{resource.format}</span>
                  <a href="#" className="text-sm font-semibold text-orange-500 transition hover:text-orange-600">Download →</a>
                </div>
              </motion.div>
            ))}
          </div>
          <div className="mt-8 text-center">
            <button className="rounded-full border border-orange-500 px-8 py-2.5 font-semibold text-orange-500 transition hover:bg-orange-50 dark:hover:bg-orange-900/20">
              View All Resources →
            </button>
          </div>
        </div>
      </section>

      {/* Newsletter CTA */}
      <section className="bg-navy-dark py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <div className="text-4xl mb-4">✉️</div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Stay Ahead with Actionable Insights</h2>
          <p className="mt-2 text-gray-400">Join 5,000+ agency owners and operators who get our best content straight to their inbox.</p>
          <form className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <input
              type="email"
              placeholder="Enter your work email"
              className="rounded-full border border-gray-700 bg-gray-800/50 px-6 py-3 text-white placeholder-gray-500 focus:border-orange-500 focus:outline-none sm:w-80"
              required
            />
            <button type="submit" className="rounded-full bg-orange-500 px-6 py-3 font-semibold text-white transition hover:bg-orange-600">
              Subscribe
            </button>
          </form>
          <div className="mt-4 flex flex-wrap justify-center gap-4 text-xs text-gray-400">
            <span>✓ No spam</span>
            <span>✓ Unsubscribe anytime</span>
            <span>✓ Weekly insights</span>
          </div>
        </div>
      </section>
    </motion.div>
  )
}

// ============================================
// MAIN APP WITH ROUTING
// ============================================
const NewLanding = () => {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/stories" element={<CustomerStoriesPage />} />
        <Route path="/ai-workforce" element={<AIWorkforcePage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/login" element={<div className="py-20 text-center text-gray-900 dark:text-white">Login Page</div>} />
      </Routes>
      <Footer />
    </div>
  )
}

export default NewLanding