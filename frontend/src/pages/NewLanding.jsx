import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  ArrowRight,
  BarChart3,
  BadgeDollarSign,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Globe,
  Headphones,
  Layers3,
  Mail,
  MapPin,
  Menu,
  MessageSquare,
  Moon,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Users,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import { useTheme } from '../hooks/useTheme'

const navItems = [
  { label: 'Features', href: '#features' },
  { label: 'Solutions', href: '#solutions' },
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

const stats = [
  { value: '500+', label: 'Agencies onboarded' },
  { value: '2.4x', label: 'Faster delivery cycles' },
  { value: '94%', label: 'Renewal rate' },
  { value: '18h', label: 'Saved weekly per team' },
]

const solutions = [
  {
    title: 'Project delivery',
    description: 'Plan campaigns, manage tasks, and keep every client deliverable moving on schedule.',
    image: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1200&h=800&fit=crop',
  },
  {
    title: 'Sales pipeline',
    description: 'Track leads, proposals, and follow-ups in a pipeline built for agency growth.',
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&h=800&fit=crop',
  },
  {
    title: 'Client operations',
    description: 'Centralize support, billing, approvals, and communication without switching tools.',
    image: 'https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=1200&h=800&fit=crop',
  },
]

const workflowSteps = [
  {
    title: 'Set up your agency',
    description: 'Configure services, teams, permissions, and automations in a single workspace.',
    image: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?w=1200&h=800&fit=crop',
  },
  {
    title: 'Add clients and accounts',
    description: 'Create clean client spaces with contacts, deals, tasks, and billing history attached.',
    image: 'https://images.unsplash.com/photo-1521791136064-7986c0212926?w=1200&h=800&fit=crop',
  },
  {
    title: 'Assign work with clarity',
    description: 'Break delivery into milestones, owners, deadlines, and approvals that stay visible to everyone.',
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=800&fit=crop',
  },
  {
    title: 'Track time and budget',
    description: 'Measure hours, retainers, and profitability across every account without spreadsheet chaos.',
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=800&fit=crop',
  },
  {
    title: 'Invoice with confidence',
    description: 'Turn completed work into professional invoices, recurring billing, and clean reporting.',
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&h=800&fit=crop',
  },
]

const features = [
  { icon: Workflow, title: 'Task Management', description: 'Structure work by client, project, and team with clear ownership.' },
  { icon: BarChart3, title: 'CRM Pipeline', description: 'Move every lead through a sales process designed for agencies.' },
  { icon: Headphones, title: 'Support Ticketing', description: 'Handle client requests with SLA-aware ticket queues.' },
  { icon: Clock3, title: 'Time Tracking', description: 'Capture billable and non-billable time with minimal friction.' },
  { icon: BadgeDollarSign, title: 'Invoicing', description: 'Create polished invoices and recurring billing from the same workspace.' },
  { icon: BrainCircuit, title: 'AI Insights', description: 'Spot risk, bottlenecks, and revenue opportunities faster.' },
]

const testimonials = [
  {
    quote: 'SynTask transformed our agency operations. We are 2x more efficient.',
    name: 'Sarah Chen',
    role: 'CEO, DigitalFlow',
    image: 'https://images.unsplash.com/photo-1494790108378-be9c29b29330?w=120&h=120&fit=crop&crop=face',
  },
  {
    quote: 'The all-in-one platform we have been searching for.',
    name: 'Mike Rodriguez',
    role: 'Operations Director, CreativeHub',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=120&h=120&fit=crop&crop=face',
  },
  {
    quote: 'Finally, a tool that understands how agencies work.',
    name: 'Emma Thompson',
    role: 'Managing Partner, GrowthAgency',
    image: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&h=120&fit=crop&crop=face',
  },
]

const pricing = [
  {
    name: 'Starter',
    price: '$29',
    period: '/mo',
    description: 'Best for small teams getting organized.',
    features: ['5 users', 'Task management', 'CRM pipeline', 'Basic reporting'],
    accent: false,
  },
  {
    name: 'Professional',
    price: '$79',
    period: '/mo',
    description: 'The growth plan for scaling agencies.',
    features: ['20 users', 'All features', 'Automation', 'Advanced analytics'],
    accent: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For high-volume teams with dedicated support needs.',
    features: ['Unlimited users', 'Dedicated support', 'Custom onboarding', 'SLA controls'],
    accent: false,
  },
]

const faqs = [
  {
    question: 'Can SynTask replace our existing project, CRM, and billing stack?',
    answer:
      'Yes. SynTask is designed as an agency operating system so you can consolidate project delivery, sales, support, and billing into one workspace.',
  },
  {
    question: 'Is the platform suitable for digital marketing agencies?',
    answer:
      'Yes. The workflows, views, and reporting were built around the day-to-day needs of creative, performance, and growth teams.',
  },
  {
    question: 'Can we onboard our team quickly?',
    answer:
      'Absolutely. Most teams can set up the core workspace, add clients, and start tracking work in a single onboarding cycle.',
  },
  {
    question: 'Do you support recurring billing and invoices?',
    answer:
      'Yes. You can create invoices, manage recurring billing, and keep revenue data connected to the right client and project context.',
  },
]

const industryCards = [
  'Performance Marketing',
  'Creative Studios',
  'SEO Agencies',
  'Brand & Design',
  'Media Buying',
  'Web Development',
]

const compareRows = [
  ['Project delivery', false, true, true],
  ['CRM pipeline', false, true, true],
  ['Support tickets', false, false, true],
  ['Time tracking', false, true, true],
  ['Billing + invoices', false, false, true],
  ['Agency reporting', false, false, true],
]

const sectionVariants = {
  hidden: { opacity: 0, y: 28 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
}

const staggerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.12 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45 } },
}

const themeTheme = {
  surface: 'bg-[var(--color-app-surface)]',
  muted: 'bg-[var(--color-app-surface-muted)]',
  border: 'border-[var(--color-app-border)]',
  text: 'text-[var(--color-app-text)]',
  textSecondary: 'text-[var(--color-app-text-secondary)]',
}

function SectionHeading({ eyebrow, title, description, center = false }) {
  return (
    <div className={center ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'}>
      <motion.p
        variants={itemVariants}
        className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-primary-700"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {eyebrow}
      </motion.p>
      <motion.h2 variants={itemVariants} className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl">
        {title}
      </motion.h2>
      <motion.p variants={itemVariants} className={`mt-5 text-base leading-8 sm:text-lg ${themeTheme.textSecondary}`}>
        {description}
      </motion.p>
    </div>
  )
}

function ImageCard({ image, title, description, badge, className = '' }) {
  return (
    <motion.article
      variants={itemVariants}
      whileHover={{ y: -6 }}
      className={`overflow-hidden rounded-[2rem] border ${themeTheme.border} ${themeTheme.surface} shadow-[0_20px_60px_rgba(15,23,42,0.08)] ${className}`}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img src={image} alt={title} className="h-full w-full object-cover transition duration-700 hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-transparent to-transparent" />
        <div className="absolute left-5 top-5 rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700">
          {badge}
        </div>
      </div>
      <div className="p-6">
        <h3 className="text-xl font-bold text-[var(--color-app-text)]">{title}</h3>
        <p className={`mt-3 text-sm leading-7 ${themeTheme.textSecondary}`}>{description}</p>
        <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary-700">
          Learn more
          <ChevronRight className="h-4 w-4" />
        </div>
      </div>
    </motion.article>
  )
}

function StatCard({ value, label }) {
  return (
    <motion.div
      variants={itemVariants}
      whileHover={{ y: -4 }}
      className={`rounded-[1.75rem] border ${themeTheme.border} ${themeTheme.surface} p-6 shadow-[0_12px_30px_rgba(15,23,42,0.05)]`}
    >
      <div className="text-3xl font-black tracking-tight text-[var(--color-app-text)]">{value}</div>
      <div className={`mt-2 text-sm font-medium ${themeTheme.textSecondary}`}>{label}</div>
    </motion.div>
  )
}

function NewLanding() {
  const { theme, toggleTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [activeStep, setActiveStep] = useState(0)
  const [openFaq, setOpenFaq] = useState(0)

  const currentWorkflow = useMemo(() => workflowSteps[activeStep], [activeStep])

  return (
    <div className={`min-h-screen ${themeTheme.muted} ${themeTheme.text}`}>
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-10%] top-[-10%] h-96 w-96 rounded-full bg-primary-100/70 blur-3xl" />
        <div className="absolute right-[-10%] top-24 h-[28rem] w-[28rem] rounded-full bg-violet-100/70 blur-3xl" />
        <div className="absolute bottom-[-12%] left-1/3 h-[26rem] w-[26rem] rounded-full bg-sky-100/70 blur-3xl" />
      </div>

      <header className="sticky top-0 z-50 border-b border-white/40 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="#top" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-600 text-white shadow-lg shadow-primary-200">
              <Layers3 className="h-6 w-6" />
            </div>
            <div>
              <div className="font-display text-lg font-extrabold tracking-tight">SynTask</div>
              <div className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">Agency OS</div>
            </div>
          </a>

          <nav className="hidden items-center gap-8 lg:flex">
            {navItems.map((item) => (
              <a key={item.href} href={item.href} className="text-sm font-medium text-slate-600 transition hover:text-slate-950">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <button
              type="button"
              onClick={toggleTheme}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-full border ${themeTheme.border} bg-white text-slate-700 transition hover:bg-slate-50`}
              aria-label="Toggle theme"
            >
              {theme === 'dark' ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
            <a
              href="#contact"
              className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 lg:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="border-t border-slate-200 bg-white px-4 py-4 shadow-2xl lg:hidden"
            >
              <div className="mx-auto flex max-w-7xl flex-col gap-3">
                {navItems.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className="rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {item.label}
                  </a>
                ))}
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="mt-2 inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Toggle theme
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main id="top">
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-16 sm:px-6 lg:px-8 lg:pb-28 lg:pt-24">
          <motion.div
            variants={staggerVariants}
            initial="hidden"
            animate="visible"
            className="grid items-center gap-14 lg:grid-cols-[1.1fr_0.9fr]"
          >
            <div>
              <motion.p
                variants={itemVariants}
                className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-primary-700"
              >
                <Zap className="h-3.5 w-3.5" />
                One platform for every agency workflow
              </motion.p>
              <motion.h1 variants={itemVariants} className="font-display max-w-3xl text-5xl font-black leading-[0.95] tracking-tight sm:text-6xl lg:text-7xl">
                The agency operating system you have been waiting for
              </motion.h1>
              <motion.p variants={itemVariants} className={`mt-7 max-w-2xl text-lg leading-8 sm:text-xl ${themeTheme.textSecondary}`}>
                Task management, CRM, support tickets, time tracking, and billing all in one place so your agency can move faster with less chaos.
              </motion.p>

              <motion.div variants={itemVariants} className="mt-10 flex flex-col gap-4 sm:flex-row">
                <a
                  href="#contact"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-primary-600 px-7 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700"
                >
                  Start Free Trial
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#how-it-works"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-7 py-4 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                >
                  <Play className="h-4 w-4" />
                  Watch Demo
                </a>
              </motion.div>

              <motion.div variants={itemVariants} className="mt-10 grid gap-3 sm:grid-cols-3">
                {['Built for digital agencies', 'Lightweight onboarding', 'Fast, polished UI'].map((pill) => (
                  <div
                    key={pill}
                    className="rounded-full border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-600 shadow-sm"
                  >
                    {pill}
                  </div>
                ))}
              </motion.div>
            </div>

            <motion.div variants={itemVariants} className="relative">
              <div className="absolute -left-6 top-8 h-24 w-24 rounded-full bg-primary-100 blur-2xl" />
              <div className="absolute -right-4 bottom-4 h-28 w-28 rounded-full bg-violet-100 blur-2xl" />
              <div className={`relative overflow-hidden rounded-[2.25rem] border ${themeTheme.border} bg-white p-4 shadow-[0_30px_90px_rgba(15,23,42,0.15)]`}>
                <img
                  src="https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=800&fit=crop"
                  alt="Agency dashboard"
                  className="h-[520px] w-full rounded-[1.8rem] object-cover"
                />
                <div className="absolute left-8 top-8 rounded-2xl border border-white/60 bg-white/90 px-4 py-3 shadow-lg backdrop-blur">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Active campaigns</div>
                  <div className="mt-1 text-2xl font-black text-slate-900">128</div>
                </div>
                <div className="absolute bottom-8 left-8 right-8 grid gap-3 sm:grid-cols-3">
                  {[
                    ['Revenue', '$48.2k'],
                    ['Tasks', '312 open'],
                    ['SLA', '98.4%'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/60 bg-white/90 p-4 shadow-lg backdrop-blur">
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <div className={`rounded-[2rem] border ${themeTheme.border} bg-white px-6 py-7 shadow-[0_20px_50px_rgba(15,23,42,0.05)] sm:px-8`}>
              <p className="text-center text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                Trusted by 500+ agencies worldwide
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {['Agency X', 'Digital Co', 'Northstar', 'Creative Lab', 'Studio Flow'].map((name, index) => (
                  <div
                    key={name}
                    className={`flex items-center justify-center rounded-2xl px-4 py-5 text-sm font-bold ${
                      index % 2 === 0 ? 'bg-slate-950 text-white' : 'bg-primary-50 text-primary-800'
                    }`}
                  >
                    {name}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Performance snapshot"
              title="A clearer view of the agency business"
              description="SynTask connects the operational pieces that usually live in separate tools so leaders can manage delivery, sales, and cash flow from one place."
            />
          </motion.div>

          <motion.div
            variants={staggerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4"
          >
            {stats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </motion.div>
        </section>

        <section id="solutions" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Solutions"
              title="One product, three core agency workflows"
              description="From pitches to delivery to billing, every part of the client journey stays connected and visible."
            />
          </motion.div>

          <motion.div
            variants={staggerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mt-10 grid gap-6 lg:grid-cols-3"
          >
            {solutions.map((item) => (
              <ImageCard
                key={item.title}
                image={item.image}
                title={item.title}
                description={item.description}
                badge="Core module"
              />
            ))}
          </motion.div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="How it works"
              title="Designed for fast agency onboarding"
              description="Set up your team, move in your clients, and start operating in a way that feels natural to agencies."
            />
          </motion.div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[0.45fr_0.55fr]">
            <motion.div
              variants={staggerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              className={`rounded-[2rem] border ${themeTheme.border} ${themeTheme.surface} p-4`}
            >
              {workflowSteps.map((step, index) => {
                const active = index === activeStep
                return (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => setActiveStep(index)}
                    className={`mb-3 flex w-full items-start gap-4 rounded-[1.5rem] border p-4 text-left transition ${
                      active
                        ? 'border-primary-200 bg-primary-50 shadow-sm'
                        : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white'
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold ${
                        active ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      0{index + 1}
                    </div>
                    <div>
                      <div className="font-bold text-[var(--color-app-text)]">{step.title}</div>
                      <div className={`mt-1 text-sm leading-6 ${themeTheme.textSecondary}`}>{step.description}</div>
                    </div>
                  </button>
                )
              })}
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div
                key={currentWorkflow.title}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.35 }}
                className={`overflow-hidden rounded-[2rem] border ${themeTheme.border} ${themeTheme.surface} shadow-[0_20px_50px_rgba(15,23,42,0.06)]`}
              >
                <img src={currentWorkflow.image} alt={currentWorkflow.title} className="h-[420px] w-full object-cover" />
                <div className="p-8">
                  <div className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Step {activeStep + 1}</div>
                  <h3 className="mt-3 font-display text-3xl font-black tracking-tight">{currentWorkflow.title}</h3>
                  <p className={`mt-4 max-w-2xl text-base leading-8 ${themeTheme.textSecondary}`}>{currentWorkflow.description}</p>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    {['Clear ownership', 'Automated handoffs', 'Live visibility'].map((label) => (
                      <div
                        key={label}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700"
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Features"
              title="Everything an agency team needs, in one system"
              description="Built to reduce tool sprawl while giving operators, account managers, and leadership the controls they need."
            />
          </motion.div>

          <motion.div
            variants={staggerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3"
          >
            {features.map(({ icon: Icon, title, description }) => (
              <motion.div
                key={title}
                variants={itemVariants}
                whileHover={{ y: -5 }}
                className={`rounded-[1.75rem] border ${themeTheme.border} ${themeTheme.surface} p-6 shadow-[0_18px_40px_rgba(15,23,42,0.05)]`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mt-5 text-xl font-bold">{title}</h3>
                <p className={`mt-3 text-sm leading-7 ${themeTheme.textSecondary}`}>{description}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Case studies"
              title="Real operational lift for growing agencies"
              description="The goal is not just visibility. It is helping agencies ship faster, close cleaner, and keep clients happier."
            />
          </motion.div>

          <motion.div
            variants={staggerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mt-10 grid gap-6 lg:grid-cols-3"
          >
            {[
              {
                title: 'DigitalFlow',
                stat: '42% faster delivery',
                description: 'Used SynTask to reduce handoff friction across creative and media teams.',
                image: 'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=1200&h=800&fit=crop',
              },
              {
                title: 'CreativeHub',
                stat: '31% more qualified deals',
                description: 'Connected CRM and proposal workflows so their sales team never lost momentum.',
                image: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=1200&h=800&fit=crop',
              },
              {
                title: 'GrowthAgency',
                stat: '18 hours saved weekly',
                description: 'Replaced scattered tools with a single operating system for delivery and billing.',
                image: 'https://images.unsplash.com/photo-1516321497487-e288fb19713f?w=1200&h=800&fit=crop',
              },
            ].map((item) => (
              <motion.article
                key={item.title}
                variants={itemVariants}
                whileHover={{ y: -6 }}
                className={`overflow-hidden rounded-[2rem] border ${themeTheme.border} ${themeTheme.surface} shadow-[0_20px_50px_rgba(15,23,42,0.05)]`}
              >
                <img src={item.image} alt={item.title} className="h-56 w-full object-cover" />
                <div className="p-6">
                  <div className="text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">{item.title}</div>
                  <div className="mt-3 text-2xl font-black text-primary-700">{item.stat}</div>
                  <p className={`mt-3 text-sm leading-7 ${themeTheme.textSecondary}`}>{item.description}</p>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Industries"
              title="Built for the way modern agencies sell and deliver"
              description="SynTask fits the cadence of digital teams that need structure, speed, and visibility across multiple clients."
            />
          </motion.div>

          <motion.div
            variants={staggerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {industryCards.map((name, index) => (
              <motion.div
                key={name}
                variants={itemVariants}
                className={`rounded-[1.75rem] border ${themeTheme.border} ${themeTheme.surface} p-6`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-lg font-bold">{name}</div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                    <Globe className="h-5 w-5" />
                  </div>
                </div>
                <p className={`mt-4 text-sm leading-7 ${themeTheme.textSecondary}`}>
                  Tailored workflows, approvals, and reporting for {name.toLowerCase()} teams that need polished delivery.
                </p>
                <div className="mt-5 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-primary-500" style={{ width: `${65 + index * 5}%` }} />
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Team"
              title="Give every role the workspace they need"
              description="Operators, account managers, and leadership each get a clearer path to the information and actions they need."
            />
          </motion.div>

          <motion.div
            variants={staggerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mt-10 grid gap-6 lg:grid-cols-3"
          >
            {[
              {
                name: 'Operations Lead',
                bullets: ['Approvals', 'Capacity planning', 'Billing visibility'],
              },
              {
                name: 'Account Manager',
                bullets: ['Client communication', 'Project status', 'Ticket follow-up'],
              },
              {
                name: 'Agency Founder',
                bullets: ['Revenue trends', 'Delivery health', 'Pipeline forecast'],
              },
            ].map((person) => (
              <motion.div
                key={person.name}
                variants={itemVariants}
                whileHover={{ y: -6 }}
                className={`rounded-[2rem] border ${themeTheme.border} ${themeTheme.surface} p-6`}
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white">
                    <Users className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-xl font-bold">{person.name}</div>
                    <div className={`text-sm ${themeTheme.textSecondary}`}>Role-based workspace</div>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {person.bullets.map((bullet) => (
                    <div key={bullet} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                      <Check className="h-4 w-4 text-emerald-600" />
                      {bullet}
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Why SynTask"
              title="Stop stitching together tools that were never built for agencies"
              description="A focused comparison helps teams understand the difference between generic software and an agency-native operating system."
            />
          </motion.div>

          <div className={`mt-10 overflow-hidden rounded-[2rem] border ${themeTheme.border} ${themeTheme.surface}`}>
            <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50 px-6 py-4 text-sm font-semibold text-slate-600">
              <div>Capability</div>
              <div className="text-center">Spreadsheets</div>
              <div className="text-center">Generic PM tools</div>
              <div className="text-center">SynTask</div>
            </div>
            {compareRows.map(([label, sheets, generic, syntask]) => (
              <div key={label} className="grid grid-cols-4 items-center border-b border-slate-100 px-6 py-4 last:border-b-0">
                <div className="font-medium text-slate-800">{label}</div>
                <div className="flex justify-center">{sheets ? <Check className="h-5 w-5 text-emerald-600" /> : <X className="h-5 w-5 text-rose-400" />}</div>
                <div className="flex justify-center">{generic ? <Check className="h-5 w-5 text-emerald-600" /> : <X className="h-5 w-5 text-rose-400" />}</div>
                <div className="flex justify-center">{syntask ? <Check className="h-5 w-5 text-emerald-600" /> : <X className="h-5 w-5 text-rose-400" />}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Testimonials"
              title="Social proof from agencies that moved faster"
              description="Teams using SynTask report stronger delivery visibility, cleaner handoffs, and a more professional client experience."
            />
          </motion.div>

          <motion.div
            variants={staggerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mt-10 grid gap-6 lg:grid-cols-3"
          >
            {testimonials.map((item) => (
              <motion.article
                key={item.name}
                variants={itemVariants}
                className={`rounded-[2rem] border ${themeTheme.border} ${themeTheme.surface} p-7 shadow-[0_18px_40px_rgba(15,23,42,0.05)]`}
              >
                <div className="flex items-center gap-1 text-amber-400">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <Star key={index} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <p className="mt-5 text-lg leading-8 text-slate-800">“{item.quote}”</p>
                <div className="mt-7 flex items-center gap-4">
                  <img src={item.image} alt={item.name} className="h-14 w-14 rounded-2xl object-cover" />
                  <div>
                    <div className="font-bold text-slate-900">{item.name}</div>
                    <div className={`text-sm ${themeTheme.textSecondary}`}>{item.role}</div>
                  </div>
                </div>
              </motion.article>
            ))}
          </motion.div>
        </section>

        <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Pricing"
              title="Simple pricing for growing agencies"
              description="Choose the plan that fits your team size today and scale into a stronger operating model as you grow."
            />
          </motion.div>

          <motion.div
            variants={staggerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mt-10 grid gap-6 lg:grid-cols-3"
          >
            {pricing.map((tier) => (
              <motion.div
                key={tier.name}
                variants={itemVariants}
                whileHover={{ y: -6 }}
                className={`relative rounded-[2rem] border p-7 shadow-[0_18px_45px_rgba(15,23,42,0.05)] ${
                  tier.accent ? 'border-primary-200 bg-primary-50/50' : `${themeTheme.border} ${themeTheme.surface}`
                }`}
              >
                {tier.accent && (
                  <div className="absolute right-6 top-6 rounded-full bg-primary-600 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-white">
                    Most Popular
                  </div>
                )}
                <div className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">{tier.name}</div>
                <div className="mt-4 flex items-end gap-2">
                  <div className="font-display text-5xl font-black tracking-tight">{tier.price}</div>
                  <div className="pb-1 text-sm font-medium text-slate-500">{tier.period}</div>
                </div>
                <p className={`mt-4 text-sm leading-7 ${themeTheme.textSecondary}`}>{tier.description}</p>
                <div className="mt-6 space-y-3">
                  {tier.features.map((feature) => (
                    <div key={feature} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                      <Check className="h-4 w-4 text-emerald-600" />
                      {feature}
                    </div>
                  ))}
                </div>
                <a
                  href="#contact"
                  className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold ${
                    tier.accent
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : 'bg-slate-950 text-white hover:bg-slate-800'
                  }`}
                >
                  Choose plan
                  <ArrowRight className="h-4 w-4" />
                </a>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section id="faq" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="FAQ"
              title="Answers to common implementation questions"
              description="Most teams want to know how quickly they can replace fragmented workflows and move into a cleaner operating rhythm."
            />
          </motion.div>

          <motion.div
            variants={staggerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.15 }}
            className="mt-10 space-y-4"
          >
            {faqs.map((item, index) => {
              const open = openFaq === index
              return (
                <motion.div
                  key={item.question}
                  variants={itemVariants}
                  className={`overflow-hidden rounded-[1.5rem] border ${themeTheme.border} ${themeTheme.surface}`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(open ? -1 : index)}
                    className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left"
                  >
                    <span className="text-base font-bold text-slate-900">{item.question}</span>
                    <ChevronDown className={`h-5 w-5 text-slate-500 transition ${open ? 'rotate-180' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {open && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25 }}
                        className="overflow-hidden"
                      >
                        <div className={`px-6 pb-6 text-sm leading-7 ${themeTheme.textSecondary}`}>{item.answer}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </motion.div>
        </section>

        <section id="contact" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div
            variants={sectionVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            className={`overflow-hidden rounded-[2.5rem] border ${themeTheme.border} bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]`}
          >
            <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
              <div className="bg-slate-950 p-8 text-white sm:p-12">
                <div className="inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.26em] text-white/80">
                  Let&apos;s talk
                </div>
                <h2 className="mt-6 font-display text-4xl font-black tracking-tight sm:text-5xl">
                  Ready to transform your agency operations?
                </h2>
                <p className="mt-5 max-w-xl text-base leading-8 text-slate-300">
                  Join 500+ agencies already running on SynTask and create a more predictable system for delivery, sales, and client success.
                </p>

                <div className="mt-10 space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                      <Mail className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Email</div>
                      <div className="font-medium">hello@synTask.app</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10">
                      <MapPin className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold uppercase tracking-[0.2em] text-white/60">Office</div>
                      <div className="font-medium">Remote-first, global support</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 sm:p-12">
                <form className="grid gap-5">
                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-700">Full name</span>
                      <input
                        type="text"
                        placeholder="Your name"
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none transition focus:border-primary-400 focus:bg-white"
                      />
                    </label>
                    <label className="grid gap-2">
                      <span className="text-sm font-semibold text-slate-700">Work email</span>
                      <input
                        type="email"
                        placeholder="you@agency.com"
                        className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none transition focus:border-primary-400 focus:bg-white"
                      />
                    </label>
                  </div>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-700">Agency size</span>
                    <input
                      type="text"
                      placeholder="15 team members"
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none transition focus:border-primary-400 focus:bg-white"
                    />
                  </label>
                  <label className="grid gap-2">
                    <span className="text-sm font-semibold text-slate-700">What do you need help with?</span>
                    <textarea
                      rows="5"
                      placeholder="Tell us about your workflows, pain points, or what you want to improve."
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm outline-none transition focus:border-primary-400 focus:bg-white"
                    />
                  </label>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-primary-600 px-6 py-4 text-sm font-semibold text-white shadow-lg shadow-primary-200 transition hover:bg-primary-700"
                  >
                    Start Your Free Trial
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr_0.9fr_0.9fr]">
            <div>
              <a href="#top" className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary-600 text-white">
                  <Layers3 className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-display text-lg font-extrabold">SynTask</div>
                  <div className="text-xs font-medium uppercase tracking-[0.24em] text-slate-500">One platform to run your agency</div>
                </div>
              </a>
              <p className="mt-5 max-w-md text-sm leading-7 text-slate-600">
                Task management, CRM, support, and billing built for agencies that want a cleaner, more reliable operating system.
              </p>
              <div className="mt-6 flex items-center gap-3">
                {[ShieldCheck, Globe, MessageSquare].map((Icon, index) => (
                  <div key={index} className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600">
                    <Icon className="h-4 w-4" />
                  </div>
                ))}
              </div>
            </div>

            {[
              { title: 'Product', links: ['Features', 'Solutions', 'Pricing', 'FAQ'] },
              { title: 'Company', links: ['About', 'Careers', 'Contact', 'Press'] },
              { title: 'Resources', links: ['Blog', 'Help center', 'Guides', 'Templates'] },
            ].map((group) => (
              <div key={group.title}>
                <div className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">{group.title}</div>
                <div className="mt-5 space-y-4">
                  {group.links.map((link) => (
                    <a key={link} href="#top" className="block text-sm font-medium text-slate-600 transition hover:text-slate-950">
                      {link}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 flex flex-col gap-4 border-t border-slate-200 pt-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <div>© 2026  SynTask. All rights reserved.</div>
            <div className="flex items-center gap-5">
              <a href="#top" className="transition hover:text-slate-900">
                Privacy
              </a>
              <a href="#top" className="transition hover:text-slate-900">
                Terms
              </a>
              <a href="#top" className="transition hover:text-slate-900">
                Security
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default NewLanding
