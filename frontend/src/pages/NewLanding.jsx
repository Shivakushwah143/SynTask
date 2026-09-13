import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { PRODUCT_PREVIEW } from '../config/visualAssets';
import { AttendancePreview, ExecutiveAiPreview, PeopleOpsPreview, RecruitmentPreview, RevenuePreview, WorkPreview } from '../components/landing/CapabilityPreviews';

/* ────────────────────────────────────────────────────────────────────────────
   Image metadata — centralized so URLs, alt text and loading strategy stay
   consistent. Product shots use the real SynTask UI (local build assets);
   Unsplash is used only for human/team/business context below the fold.
   ──────────────────────────────────────────────────────────────────────────── */
const IMAGES = {
  productPreview: PRODUCT_PREVIEW,
  teamPhoto: { src: 'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=1200&q=80', alt: 'Business team in a strategy meeting reviewing documents', loading: 'lazy' },
  officeMeeting: { src: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80', alt: 'Team collaborating around a table in a bright modern office', loading: 'lazy' },
  portraitMan1: { src: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80', alt: 'Portrait of Rahul Mehta, CEO of TechNovo Solutions', loading: 'lazy' },
  portraitWoman: { src: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80', alt: 'Portrait of Neha Kapoor, Head of HR at TechNovate', loading: 'lazy' },
  portraitMan2: { src: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=400&q=80', alt: 'Portrait of Arjun Mehta, Delivery Head at PixelCraft', loading: 'lazy' },
};

const NAV_LINKS = [
  { label: 'Product', href: '#platform' },
  { label: 'Live Demo', href: '#demo-preview' },
  { label: 'Executive AI', href: '#executive-ai' },
  { label: 'Company', href: '#built-by' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

/* Six connected capability areas — every card ships with a small UI preview. */
const CAPABILITIES = [
  { label: 'People Operations', title: 'Employees, HR & payroll', desc: 'Employee records, HR documents, leave, appraisal and payroll flows that stay in sync with the work your people do.', chips: ['Employees', 'HR', 'Leave', 'Payroll'], preview: 'people' },
  { label: 'Work Management', title: 'Tasks, projects & sprints', desc: 'Kanban boards, subtasks, timesheets and project delivery your team actually enjoys using.', chips: ['Tasks', 'Projects', 'Sprints', 'Timesheets'], preview: 'work' },
  { label: 'Revenue Operations', title: 'Sales, CRM & clients', desc: 'Leads, pipelines, proposals and client workspaces — from first touch to invoice in one flow.', chips: ['Sales', 'CRM', 'Clients'], preview: 'revenue' },
  { label: 'Smart Attendance', title: 'Biometric attendance with workforce visibility', desc: 'eTimeOffice sync, policy engine, corrections and live monitoring across every shift.', chips: ['Biometric', 'eTimeOffice', 'Live monitor'], preview: 'attendance' },
  { label: 'Recruitment', title: 'Jobs to offers', desc: 'Job posts, candidate pipeline, interviews, offers and a public careers portal.', chips: ['Jobs', 'Candidates', 'Interviews', 'Offers'], preview: 'recruitment' },
  { label: 'Executive AI', title: 'AI over real company data', desc: 'A cross-company agent that answers questions with evidence from your actual operations.', chips: ['Operations Agent', 'Answers', 'Actions'], preview: 'executive' },
];

const CAPABILITY_PREVIEWS = {
  people: PeopleOpsPreview,
  work: WorkPreview,
  revenue: RevenuePreview,
  attendance: AttendancePreview,
  recruitment: RecruitmentPreview,
  executive: ExecutiveAiPreview,
};

/* How modules connect — the story of the page. */
const FLOW = [
  { step: 'People', detail: 'Employees · HR · Payroll' },
  { step: 'Work', detail: 'Tasks · Projects · Timesheets' },
  { step: 'Revenue', detail: 'Sales · CRM · Clients' },
  { step: 'Operations', detail: 'Attendance · Documents' },
  { step: 'Intelligence', detail: 'Executive AI · Agents' },
];

/* Company proof — AlphaNexis agency track record, never SynTask product stats. */
const ALPHANEXIS_PROOF = [
  { v: '8+', l: 'Years of expertise' },
  { v: '100+', l: 'Projects delivered' },
  { v: '30+', l: 'Active clients' },
  { v: '3+', l: 'Countries served' },
  { v: '96%', l: 'Client retention' },
];

const RECOGNITION = ['AWS Partner', 'Google Cloud', 'Microsoft Azure', 'DPIIT Startup India', 'MSME'];

const PLANS = [
  { name: 'Starter', priceMonthly: '₹1,999', priceYearly: '₹1,599', tagline: 'Perfect for small teams getting started.', color: 'text-green-600 dark:text-green-400', border: 'border-green-500', cta: 'border border-green-500 text-green-600 dark:text-green-400 hover:bg-green-50', features: ['Up to 5 Users', 'Sales OS', 'Project OS', 'People OS', 'Basic Reports', 'Email Support'] },
  { name: 'Growth', priceMonthly: '₹4,999', priceYearly: '₹3,999', tagline: 'Ideal for growing agencies & IT companies.', popular: true, color: 'text-blue-700', border: 'border-blue-600', cta: 'bg-blue-600 text-white hover:bg-blue-700', features: ['Up to 20 Users', 'Recruitment OS', 'Finance OS', 'Automation (50 Workflows)', 'Client Portal', 'Priority Support'] },
  { name: 'Business', priceMonthly: '₹9,999', priceYearly: '₹7,999', tagline: 'Advanced features for scaling businesses.', color: 'text-purple-600', border: 'border-purple-500', cta: 'border border-purple-500 text-purple-600 hover:bg-purple-50', features: ['Up to 50 Users', 'AI Workforce (Basic)', 'Advanced Reports & Analytics', 'Automation (Unlimited)', 'Custom Roles & Permissions', 'Phone Support'] },
  { name: 'Enterprise', priceMonthly: 'Custom', priceYearly: 'Custom', tagline: 'For large teams with custom needs & security.', color: 'text-orange-600 dark:text-orange-400', border: 'border-orange-500', cta: 'border border-orange-500 text-orange-600 dark:text-orange-400 hover:bg-orange-50', features: ['Unlimited Users', 'AI Workforce (Advanced)', 'Custom Integrations', 'Dedicated Account Manager', 'SLA & Uptime Guarantee', 'On-premise / Private Cloud'] },
];

const FAQS = [
  { q: 'Is SynTask really an all-in-one platform?', a: 'Yes. Tasks, projects, CRM, sales, HRMS, attendance, payroll, recruitment, meetings, documents and Executive AI all live in one workspace with one login, one data model and one source of truth.' },
  { q: 'How is SynTask different from ClickUp or Monday.com?', a: 'Most tools stop at project management. SynTask also covers client CRM, invoicing, HR, attendance, payroll and recruitment — and connects them with an Executive AI agent that can answer questions across your entire company.' },
  { q: 'Does SynTask offer better pricing than other tools?', a: 'SynTask replaces 6+ separate subscriptions. Agencies and IT companies typically save 50–60% on software costs while consolidating their stack into one platform.' },
  { q: 'Can I migrate my data from other platforms?', a: 'Yes. Our onboarding team helps you import tasks, projects, clients and employee records, and provides full onboarding support during your free trial.' },
  { q: 'Is my data secure?', a: 'SynTask is multi-tenant with role-based access, audit logging and encryption at rest and in transit. Every company\'s data is isolated by tenant.' },
];

const DEMO_TABS = [
  {
    key: 'crm',
    label: 'Client CRM & Pipeline',
    badge: 'Visual Sales Funnel',
    badgeClass: 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300',
    title: 'Track Every Inquiry From Lead to Contract',
    desc: 'Drag and drop leads through stages. SynTask automatically assigns account leads, sends welcome packages, and logs contact history.',
    stats: [
      { label: 'Total Pipeline', value: '₹48,50,000', cls: 'bg-surface-muted' },
      { label: 'Win Rate', value: '68.4%', cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' },
    ],
    rows: [
      { name: 'Apex Tech Solutions', status: 'Proposal Sent', cls: 'bg-emerald-100 text-emerald-700' },
      { name: 'Quantum Leap Labs', status: 'In Negotiation', cls: 'bg-blue-100 text-blue-700' },
      { name: 'Horizon Media Co', status: 'Discovery Call', cls: 'bg-amber-100 text-amber-700' },
    ],
  },
  {
    key: 'ai',
    label: 'AI Automation Teammates',
    badge: '24/7 Digital Workers',
    badgeClass: 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-300',
    title: 'AI Assistant Agents Handling Daily Chores',
    desc: 'Let AI draft progress emails, organize task deadlines, analyze project risk, and notify team members automatically.',
    stats: [
      { label: 'Hours Saved / Month', value: '140+ Hours', cls: 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400' },
      { label: 'Errors Reduced', value: '99.8%', cls: 'bg-orange-50 dark:bg-orange-950/40 text-brand-orange' },
    ],
    rows: [
      { name: 'Invoicing Bot', status: 'Active', detail: 'Sent 12 monthly retainer reminders', cls: 'text-emerald-500' },
      { name: 'Summary Assistant', status: 'Active', detail: 'Generated weekly client status briefs', cls: 'text-emerald-500' },
    ],
  },
  {
    key: 'tasks',
    label: 'Kanban Projects & Tasks',
    badge: 'Visual Deliverables',
    badgeClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300',
    title: 'Clean Kanban Boards Your Team Will Love',
    desc: 'Organize work by status, assign leads, attach files, and track deliverables in real time without messy spreadsheet email threads.',
    stats: [
      { label: 'Active Tasks', value: '128 Deliverables', cls: 'bg-surface-muted' },
      { label: 'On-Time Completion', value: '97.2%', cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' },
    ],
    rows: [
      { name: 'Website UI Redesign', detail: 'Assigned: Sarah M. • Due Tomorrow', cls: 'text-indigo-500' },
      { name: 'API Integration Testing', detail: 'Completed Today', cls: 'text-emerald-500' },
    ],
  },
  {
    key: 'invoices',
    label: '1-Click Billing & GST',
    badge: 'Financial Operations',
    badgeClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300',
    title: 'Automated Tax Invoices & Instant Billing',
    desc: 'Create GST compliant invoices, track paid vs outstanding balances, and send instant PDF invoices directly to clients.',
    stats: [
      { label: 'Collected This Month', value: '₹18,40,000', cls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400' },
      { label: 'Avg Payment Time', value: '2.4 Days', cls: 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400' },
    ],
    rows: [
      { name: 'INV-2026-084', detail: 'Apex Tech • Paid', cls: 'border-l-4 border-emerald-500' },
      { name: 'INV-2026-085', detail: 'Quantum Leap • ₹4,20,000 (Pending)', cls: 'border-l-4 border-amber-500' },
    ],
  },
];

const COMPARISON = [
  { feature: 'AI-Powered Automation', cells: ['Limited', 'Limited', 'Limited', 'Limited', 'Limited'] },
  { feature: 'All-in-One Platform', cells: ['✕', '✕', '✕', '✕', '✕'] },
  { feature: 'Client Management', cells: ['Limited', 'Limited', 'Limited', 'Limited', '✓'] },
  { feature: 'Project Management', cells: ['✓', '✓', 'Limited', 'Limited', 'Limited'] },
  { feature: 'HR & Team Management', cells: ['Limited', 'Limited', 'Limited', '✓', 'Limited'] },
  { feature: 'Finance & Invoicing', cells: ['Limited', 'Limited', '✓', '✓', 'Limited'] },
  { feature: 'AI Workforce (Virtual Employees)', cells: ['✕', '✕', '✕', '✕', '✕'] },
  { feature: 'Ease of Use', cells: ['★★★☆☆', '★★★☆☆', '★★★☆☆', '★★☆☆☆', '★★☆☆☆'] },
  { feature: 'Integrations', cells: ['1000+', '200+', '1500+', '1000+', '3000+'] },
];

const COMPETITORS = ['ClickUp', 'Monday.com', 'HubSpot', 'Zoho One', 'Salesforce'];

function Logo() {
  return (
    <span className="flex items-center gap-2.5" data-purpose="logo">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-orange shadow-sm shadow-orange-500/25">
        <span className="h-4 w-4 rotate-45 rounded-[3px] bg-white" />
      </span>
      <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">SynTask</span>
    </span>
  );
}

export default function NewLanding() {
  const { theme, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('crm');
  const [yearly, setYearly] = useState(false);
  const [openFaq, setOpenFaq] = useState(0);

  const [empCount, setEmpCount] = useState(25);
  const [toolCount, setToolCount] = useState(8);
  const roiSavings = useMemo(
    () => Math.min(empCount * toolCount * 450, 2450000),
    [empCount, toolCount],
  );

  return (
    <>
      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-[#0A0B1A]/90">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link to="/" aria-label="SynTask home">
            <Logo />
          </Link>

          <div className="hidden items-center gap-7 text-sm font-medium text-gray-600 dark:text-gray-300 lg:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="transition-colors hover:text-slate-900 dark:hover:text-white">
                {l.label}
              </a>
            ))}
            <Link to="/careers" className="transition-colors hover:text-slate-900 dark:hover:text-white">Careers</Link>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition-colors hover:bg-gray-50 hover:text-slate-900 dark:border-slate-700 dark:text-gray-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {theme === 'dark' ? (
                <svg className="h-4.5 w-4.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m12.728 12.728l.707.707M12 8a4 4 0 100 8 4 4 0 000-8z" /></svg>
              ) : (
                <svg className="h-4.5 w-4.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
              )}
            </button>
            <Link
              to="/login"
              className="hidden rounded-full border border-gray-200 px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800 sm:inline-block"
            >
              Login
            </Link>
            <Link
              to="/login"
              className="hidden rounded-full bg-brand-orange px-5 py-2 text-sm font-bold text-white shadow-sm shadow-orange-500/25 transition-colors hover:bg-orange-600 sm:inline-block"
            >
              Start Free Demo
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-800 lg:hidden"
            >
              {mobileOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
              )}
            </button>
          </div>
        </nav>

        {mobileOpen && (
          <div className="border-t border-gray-100 bg-white px-4 py-4 dark:border-slate-800 dark:bg-[#0A0B1A] lg:hidden">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-800"
                >
                  {l.label}
                </a>
              ))}
              <Link to="/careers" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-800">Careers</Link>
            </div>
            <div className="mt-3 flex gap-3 border-t border-gray-100 pt-4 dark:border-slate-800">
              <Link to="/login" onClick={() => setMobileOpen(false)} className="flex-1 rounded-full border border-gray-200 py-2.5 text-center text-sm font-semibold text-slate-800 dark:border-slate-700 dark:text-white">Login</Link>
              <Link to="/login" onClick={() => setMobileOpen(false)} className="flex-1 rounded-full bg-brand-orange py-2.5 text-center text-sm font-bold text-white">Start Free Demo</Link>
            </div>
          </div>
        )}
      </header>

      <main className="overflow-x-clip">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative bg-white pt-14 pb-16 dark:bg-[#0A0B1A] lg:pt-20 lg:pb-24">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(229,106,31,0.08),transparent)]" />
          <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div data-purpose="hero-content">
              <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand-orange/30 bg-orange-50/80 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-widest text-brand-orange dark:bg-orange-950/30">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-orange" />
                Built by AlphaNexis
              </span>
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight text-slate-900 dark:text-white sm:text-5xl xl:text-6xl">
                Run your company from <span className="text-brand-orange">one connected workspace.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 dark:text-gray-300 sm:text-lg">
                SynTask connects people, work, customers and company intelligence. Employees and HR, tasks and projects, sales and clients, attendance and payroll — one system, one source of truth, with Executive AI that reasons over real operational data.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link to="/login" className="group inline-flex items-center gap-2 rounded-xl bg-brand-orange px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600">
                  Start Free Demo
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M14 5l7 7m0 0l-7 7m7-7H3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Link>
                <a href="#demo-preview" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-6 py-3.5 text-sm font-semibold text-slate-800 transition-colors hover:bg-gray-50 dark:border-slate-800 dark:text-white dark:hover:bg-slate-800/70">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-100 text-[10px] text-brand-orange dark:bg-orange-950/50">▶</span>
                  Watch 2-Min Tour
                </a>
              </div>
              <ul className="mt-9 flex flex-wrap items-center gap-2">
                {['Employees + HR', 'Tasks + Projects', 'Sales + Clients', 'Attendance + Operations', 'Company Data', 'Executive AI'].map((c) => (
                  <li key={c} className="rounded-full border border-gray-200 bg-gray-50/70 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-800 dark:bg-[#111224]/70 dark:text-gray-200">
                    {c}
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs font-medium text-gray-500 dark:text-gray-400">
                AI-native · Data-driven · Global reach —{' '}
                <span className="font-bold text-slate-700 dark:text-gray-200">one operating workspace for your entire company</span>
              </p>
            </div>

            <div className="relative" data-purpose="hero-image-container">
              <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#111224]">
                <img
                  src={IMAGES.productPreview.src}
                  alt={IMAGES.productPreview.alt}
                  loading={IMAGES.productPreview.loading}
                  width="1200"
                  height="760"
                  className="h-auto w-full object-cover"
                />
              </div>
              <div className="absolute -bottom-4 left-4 hidden items-center gap-3 rounded-xl border border-gray-100 bg-white/95 px-4 py-3 shadow-lg backdrop-blur dark:border-slate-800 dark:bg-[#111224]/95 sm:flex">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40">✓</span>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">One connected workspace</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">HR · Tasks · CRM · Attendance · Executive AI</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust strip — AlphaNexis company proof ────────────────────────── */}
        <section className="border-y border-gray-100 bg-gray-50/50 dark:border-slate-800 dark:bg-[#111224]/50">
          <div className="mx-auto flex max-w-7xl flex-col items-center gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:justify-between">
            <p className="shrink-0 text-sm font-bold uppercase tracking-widest text-slate-900 dark:text-white">
              Built by <span className="text-brand-orange">AlphaNexis</span>
            </p>
            <dl className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {ALPHANEXIS_PROOF.map((s) => (
                <div key={s.l} className="flex items-baseline gap-2">
                  <dt className="sr-only">{s.l}</dt>
                  <dd className="text-xl font-extrabold text-slate-900 dark:text-white">{s.v}</dd>
                  <dd className="text-xs font-medium text-gray-500 dark:text-gray-400">{s.l}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* ── Interactive product demo tabs ────────────────────────────────── */}
        <section id="demo-preview" className="scroll-mt-20 bg-white py-16 dark:bg-[#0A0B1A] lg:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">Explore SynTask in action</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">See how simple business can be</h2>
              <p className="mx-auto mt-3 max-w-2xl text-sm text-gray-500 dark:text-gray-400">Click a tab to preview real workflows — no code required.</p>
            </div>

            <div className="mt-10 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Product previews">
              {DEMO_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`rounded-xl px-4 py-2.5 text-xs font-bold transition-all sm:px-5 sm:py-3 ${
                    activeTab === tab.key
                      ? 'bg-brand-orange text-white shadow-lg shadow-orange-500/20'
                      : 'bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-slate-800/80 dark:text-gray-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-6 rounded-2xl border border-gray-200/80 bg-white p-6 shadow-md dark:border-slate-800 dark:bg-[#0A0B1A] sm:p-8">
              {DEMO_TABS.filter((t) => t.key === activeTab).map((tab) => (
                <div key={tab.key} className="grid items-center gap-6 md:grid-cols-3">
                  <div className="space-y-4 md:col-span-2">
                    <span className={`inline-block rounded-full px-3 py-1 text-[11px] font-semibold ${tab.badgeClass}`}>{tab.badge}</span>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">{tab.title}</h3>
                    <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-300">{tab.desc}</p>
                    <div className="flex flex-wrap gap-3 pt-1">
                      {tab.stats.map((s) => (
                        <div key={s.label} className={`rounded-xl p-3.5 ${s.cls}`}>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{s.label}</p>
                          <p className="text-lg font-bold text-slate-900 dark:text-white">{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-[#111224]">
                    {tab.rows.map((r) => (
                      <div key={r.name} className={`rounded-lg bg-white p-3 shadow-sm dark:bg-slate-800 ${r.cls || ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-bold text-slate-800 dark:text-white">{r.name}</span>
                          {r.status && <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] font-bold ${r.cls || 'bg-gray-100 text-gray-600'}`}>{r.status}</span>}
                        </div>
                        {r.detail && <p className="mt-1 text-[11px] text-gray-500">{r.detail}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Connected operations + capability cards ──────────────────────── */}
        <section id="platform" className="scroll-mt-20 bg-gray-50/50 py-16 dark:bg-[#111224]/50 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">One platform, every department</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">An integrated company operations platform</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                Replace multiple tools and manual work with a single system where tasks, people, clients and money connect.
              </p>
            </div>

            {/* Connected operations — People → Work → Revenue → Operations → Intelligence */}
            <ol className="mt-12 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {FLOW.map((f, i) => (
                <li key={f.step} className="relative rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#0A0B1A]">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-orange/10 text-[11px] font-extrabold text-brand-orange">{i + 1}</span>
                  <p className="mt-2.5 text-sm font-extrabold text-slate-900 dark:text-white">{f.step}</p>
                  <p className="mt-0.5 text-[11px] font-medium leading-relaxed text-gray-500 dark:text-gray-400">{f.detail}</p>
                </li>
              ))}
            </ol>

            {/* Six capability cards, each with a real mini UI preview */}
            <ul className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {CAPABILITIES.map((cap) => {
                const Preview = CAPABILITY_PREVIEWS[cap.preview];
                return (
                  <li key={cap.label} className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-orange/40 hover:shadow-lg dark:border-slate-800 dark:bg-[#0A0B1A]">
                    <div className="flex flex-1 flex-col p-5">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-brand-orange">{cap.label}</span>
                      <h3 className="mt-1.5 text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">{cap.title}</h3>
                      <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{cap.desc}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {cap.chips.map((c) => (
                          <span key={c} className="rounded-full border border-gray-100 bg-gray-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-300">{c}</span>
                        ))}
                      </div>
                    </div>
                    <div className="border-t border-gray-100 bg-gray-50/70 p-4 dark:border-slate-800 dark:bg-[#111224]/70">
                      <Preview />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* ── Comparison ───────────────────────────────────────────────────── */}
        <section id="comparison" className="scroll-mt-20 bg-white py-16 dark:bg-[#0A0B1A] lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">Why businesses choose SynTask</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">Replace multiple tools. Replace manual work.</h2>
            </div>

            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-8 dark:border-slate-800 dark:bg-[#111224]/60">
                <h3 className="mb-6 text-center text-lg font-bold text-slate-900 dark:text-white">The traditional way</h3>
                <ul className="space-y-5">
                  {['10+ different tools & subscriptions', 'Manual follow-ups & updates', 'Scattered data & reports'].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-[11px] font-bold text-red-500">✕</span>
                      <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative rounded-2xl border-2 border-green-500 bg-white p-8 shadow-xl dark:bg-[#0A0B1A]">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-white">VS</span>
                <h3 className="mb-6 text-center text-lg font-bold text-green-600 dark:text-green-400">The SynTask way</h3>
                <ul className="space-y-5">
                  {['One AI-powered business operating system', 'Real-time dashboards & unified data', 'Teams collaborate in one workspace', 'Lower costs. Higher productivity. More growth.'].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-green-100 text-[11px] font-bold text-green-600 dark:bg-green-950/40 dark:text-green-400">✓</span>
                      <span className="text-sm font-semibold text-slate-800 dark:text-white">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col items-center justify-center rounded-2xl border border-gray-100 bg-gray-50/60 p-8 text-center dark:border-slate-800 dark:bg-[#111224]/60">
                <img src={IMAGES.teamPhoto.src} alt={IMAGES.teamPhoto.alt} loading={IMAGES.teamPhoto.loading} width="400" height="300" className="mb-6 h-36 w-full rounded-xl object-cover" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Ready to see the difference?</h3>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Most teams juggle separate tools for sales, projects and people. SynTask connects them in one workspace.</p>
                <div className="mt-6 w-full space-y-3">
                  <Link to="/login" className="block w-full rounded-xl bg-brand-orange py-3 text-center text-sm font-bold text-white transition-colors hover:bg-orange-600">Start Free Trial</Link>
                  <a href="#pricing" className="block w-full rounded-xl border border-gray-200 py-3 text-center text-sm font-bold text-slate-800 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800/70">See Pricing</a>
                </div>
              </div>
            </div>

            {/* Comparison table — scrolls horizontally on small screens */}
            <div className="viewport-scroll-x mt-12 rounded-2xl border border-gray-200 dark:border-slate-700">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 dark:bg-[#111224]">
                    <th className="p-4 text-left font-bold text-gray-700 dark:text-gray-200">Features</th>
                    <th className="bg-brand-orange p-4 text-center font-bold text-white">SynTask</th>
                    {COMPETITORS.map((c) => (
                      <th key={c} className="p-4 text-center text-xs font-bold text-gray-700 dark:text-gray-200">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {COMPARISON.map((row) => (
                    <tr key={row.feature}>
                      <td className="p-4 font-medium text-gray-800 dark:text-gray-200">{row.feature}</td>
                      <td className="bg-orange-50/60 p-4 text-center font-bold text-green-600 dark:bg-orange-950/20 dark:text-green-400">✓</td>
                      {row.cells.map((cell, i) => (
                        <td key={i} className="p-4 text-center text-gray-500 dark:text-gray-400">{cell}</td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="p-4 font-medium text-gray-800 dark:text-gray-200">Starting price</td>
                    <td className="bg-orange-50/60 p-4 text-center font-bold text-slate-900 dark:bg-orange-950/20 dark:text-white">₹149 /user/mo</td>
                    {['$7', '$8', '$20', '$37', '$25'].map((p) => (
                      <td key={p} className="p-4 text-center text-gray-500 dark:text-gray-400">{p} /user/mo</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── Executive AI — Ask your company, not another chatbot ────────── */}
        <section id="executive-ai" className="scroll-mt-20 bg-gray-50/50 py-16 dark:bg-[#111224]/50 lg:py-24">
          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">Executive AI</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                Ask your company, not another chatbot.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-gray-500 dark:text-gray-400 sm:text-base">
                Executive AI connects to your real operational data — HR records, project boards, timesheets, pipeline and payroll — and answers with evidence, not guesses. Ask once, across every module.
              </p>
              <ul className="mt-6 space-y-3">
                {['Answers cite the exact projects, people and deals behind every claim', 'Runs across People, Work, Revenue and Operations in one conversation', 'Flags risks and recommends actions your team can execute directly'].map((item) => (
                  <li key={item} className="flex items-start gap-3 text-sm font-medium text-gray-700 dark:text-gray-200">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-orange text-[10px] font-bold text-white">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/login" className="rounded-xl bg-brand-orange px-6 py-3 text-sm font-bold text-white shadow-lg shadow-orange-500/25 transition-colors hover:bg-orange-600">Talk to Executive AI</Link>
                <a href="#platform" className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-bold text-slate-800 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:text-white dark:hover:bg-slate-800/70">See the connected modules</a>
              </div>
            </div>

            <div className="relative" data-purpose="executive-ai-preview">
              <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-white shadow-2xl dark:border-slate-800 dark:bg-[#0A0B1A]">
                <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5 dark:border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-orange to-amber-500 text-xs font-extrabold text-white">EX</span>
                    <div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">Executive Agent</p>
                      <p className="text-[10px] text-gray-400">Reading live company data</p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Connected
                  </span>
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-orange px-4 py-2.5 text-xs font-medium text-white">
                      What needs attention across the company this week?
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-orange to-amber-500 text-[10px] font-extrabold text-white">EX</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="rounded-2xl rounded-tl-md border border-gray-100 bg-gray-50 p-4 dark:border-slate-800 dark:bg-[#111224]">
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            ['3', 'projects need attention', 'text-orange-600 dark:text-orange-400'],
                            ['2', 'employees overloaded', 'text-amber-600 dark:text-amber-400'],
                            ['₹4.2L', 'pipeline at risk', 'text-rose-600 dark:text-rose-400'],
                          ].map(([v, l, cls]) => (
                            <div key={l} className="rounded-lg bg-white p-2.5 text-center shadow-sm dark:bg-slate-900">
                              <p className={`text-base font-extrabold sm:text-lg ${cls}`}>{v}</p>
                              <p className="text-[10px] font-medium leading-tight text-gray-500 dark:text-gray-400">{l}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 space-y-1.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                          <p className="flex items-center gap-1.5"><span className="text-brand-orange">›</span> Project Atlas slipped 3 days — task board + timesheets</p>
                          <p className="flex items-center gap-1.5"><span className="text-brand-orange">›</span> ₹4.2L deal idle 9 days — CRM pipeline + activity log</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {['Evidence: 6 sources', 'Risks', 'Recommended actions'].map((chip) => (
                          <span key={chip} className="rounded-full border border-gray-100 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-gray-200">{chip}</span>
                        ))}
                      </div>
                      <p className="text-[10px] text-gray-400">Grounded in projects · timesheets · CRM · payroll — not guesswork.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Built by AlphaNexis ──────────────────────────────────────────── */}
        <section id="built-by" className="scroll-mt-20 bg-white py-16 dark:bg-[#0A0B1A] lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">Built by AlphaNexis</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">Built by a team that builds operational systems.</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                AlphaNexis has spent 8+ years engineering CRM systems, project management, sales applications and business automation — including internal operations middleware that connects business data with LLM agents. SynTask is that experience, productized.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-7 dark:border-slate-800 dark:bg-[#111224]/60 sm:p-9">
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-900 dark:text-white">What we build</h3>
                <ul className="mt-5 space-y-3.5">
                  {[
                    ['CRM systems', 'Sales pipelines and client lifecycles for service businesses'],
                    ['Project management', 'Delivery systems for agencies and IT companies'],
                    ['Business automation', 'Workflows that remove manual, repetitive operations work'],
                    ['AI & LLM middleware', 'Connecting real business data with AI agents that act on it'],
                  ].map(([t, d]) => (
                    <li key={t} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-orange text-[10px] font-bold text-white">✓</span>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{t}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{d}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-7 dark:border-slate-800 dark:bg-[#111224]/60 sm:p-9">
                <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-900 dark:text-white">Company recognition</h3>
                <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Recognition earned by AlphaNexis as a software partner and startup — a marker of the standards behind SynTask.</p>
                <ul className="mt-5 flex flex-wrap gap-2.5">
                  {RECOGNITION.map((r) => (
                    <li key={r} className="rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-white">{r}</li>
                  ))}
                </ul>
                <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-gray-200 pt-6 dark:border-slate-800 sm:grid-cols-3">
                  {ALPHANEXIS_PROOF.map((s) => (
                    <div key={s.l}>
                      <dt className="sr-only">{s.l}</dt>
                      <dd className="text-2xl font-extrabold text-slate-900 dark:text-white">{s.v}</dd>
                      <dd className="mt-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">{s.l}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </section>

        {/* ── Security ─────────────────────────────────────────────────────── */}
        <section className="bg-gray-50/50 py-16 dark:bg-[#111224]/50 lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">Enterprise-grade</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">Security & compliance you can trust</h2>
            </div>
            <ul className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { t: 'ISO 27001', s: 'Certified' },
                { t: 'SOC 2', s: 'Compliant' },
                { t: 'GDPR', s: 'Ready' },
                { t: '99.9%', s: 'Uptime SLA' },
                { t: '256-bit', s: 'Encryption' },
                { t: 'Multi-tenant', s: 'Isolation' },
              ].map((b) => (
                <li key={b.t} className="flex flex-col items-center gap-1.5 rounded-2xl border border-gray-100 bg-white p-5 text-center dark:border-slate-800 dark:bg-[#0A0B1A]">
                  <span className="text-sm font-bold text-slate-900 dark:text-white">{b.t}</span>
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{b.s}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Testimonials ─────────────────────────────────────────────────── */}
        <section className="bg-white py-16 dark:bg-[#0A0B1A] lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">Real results</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">What leaders say about SynTask</h2>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {[
                { quote: 'We replaced six separate tools — sales, projects and people finally live on one record set, and the Executive Agent surfaces what actually needs attention.', name: 'Rahul Mehta', role: 'CEO, TechNovo Solutions', img: IMAGES.portraitMan1 },
                { quote: 'From screening to onboarding, recruitment and HR sit on the same records as the rest of the company. No more re-keying data between systems.', name: 'Neha Kapoor', role: 'Head of HR, TechNovate', img: IMAGES.portraitWoman },
                { quote: 'Tasks, timesheets and client pipeline are connected, so projects stay on track and risks surface early. It is like having a co-pilot for delivery.', name: 'Arjun Mehta', role: 'Delivery Head, PixelCraft', img: IMAGES.portraitMan2 },
              ].map((t) => (
                <figure key={t.name} className="flex flex-col rounded-2xl border border-gray-100 bg-gray-50/60 p-7 dark:border-slate-800 dark:bg-[#111224]/60">
                  <span className="text-3xl leading-none text-brand-orange">“</span>
                  <blockquote className="mt-2 flex-1 text-sm italic leading-relaxed text-gray-600 dark:text-gray-300">{t.quote}</blockquote>
                  <figcaption className="mt-6 flex items-center gap-3">
                    <img src={t.img.src} alt={t.img.alt} loading={t.img.loading} width="48" height="48" className="h-12 w-12 rounded-full object-cover" />
                    <div>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{t.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{t.role}</p>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────────────────── */}
        <section id="pricing" className="scroll-mt-20 bg-gray-50/50 py-16 dark:bg-[#111224]/50 lg:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">Simple pricing</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">Choose the plan that fits your team</h2>
              <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">All plans include access to core modules. Upgrade or downgrade at any time.</p>
              <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-gray-200 bg-white p-1.5 dark:border-slate-700 dark:bg-[#0A0B1A]">
                <button
                  type="button"
                  onClick={() => setYearly(false)}
                  aria-pressed={!yearly}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${!yearly ? 'bg-brand-orange text-white' : 'text-gray-600 dark:text-gray-300'}`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setYearly(true)}
                  aria-pressed={yearly}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${yearly ? 'bg-brand-orange text-white' : 'text-gray-600 dark:text-gray-300'}`}
                >
                  Yearly <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700 dark:bg-green-950/50 dark:text-green-400">Save 20%</span>
                </button>
              </div>
            </div>

            <ul className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
              {PLANS.map((plan) => (
                <li
                  key={plan.name}
                  className={`relative flex flex-col rounded-3xl border bg-white p-7 shadow-sm transition-shadow hover:shadow-lg dark:bg-[#0A0B1A] ${plan.popular ? `border-2 ${plan.border} shadow-xl` : 'border-gray-100 dark:border-slate-800'}`}
                >
                  {plan.popular && (
                    <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-blue-900 px-4 py-1 text-[10px] font-bold uppercase tracking-widest text-white">Most Popular</span>
                  )}
                  <h3 className={`text-xl font-bold ${plan.color}`}>{plan.name}</h3>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{plan.tagline}</p>
                  <p className="mt-5 flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{yearly ? plan.priceYearly : plan.priceMonthly}</span>
                    {plan.priceMonthly !== 'Custom' && <span className="text-sm text-gray-400">/month</span>}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{yearly ? 'Billed yearly' : 'Billed monthly'}</p>
                  <Link
                    to="/login"
                    className={`mt-6 rounded-xl py-2.5 text-center text-sm font-bold transition-colors ${plan.cta} ${plan.popular ? 'shadow-lg shadow-blue-200 dark:shadow-blue-950/40' : ''}`}
                  >
                    {plan.name === 'Enterprise' ? 'Contact Sales' : 'Start Free Trial'}
                  </Link>
                  <p className="mt-6 text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
                    {plan.name === 'Growth' ? 'Everything in Starter, plus:' : plan.name === 'Business' ? 'Everything in Growth, plus:' : plan.name === 'Enterprise' ? 'Everything in Business, plus:' : 'Includes:'}
                  </p>
                  <ul className="mt-3 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs font-medium text-gray-600 dark:text-gray-300">
                        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>

            <p className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs font-semibold text-gray-400">
              <span>✓ 14 days free trial</span>
              <span>✓ No credit card required</span>
              <span>✓ Cancel anytime</span>
            </p>
          </div>
        </section>

        {/* ── ROI calculator ───────────────────────────────────────────────── */}
        <section className="bg-white py-16 dark:bg-[#0A0B1A] lg:py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">ROI calculator</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">What could SynTask save you?</h2>
              <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
                Estimate annual savings from replacing scattered tools with one platform — fewer subscriptions, less manual work, faster billing.
              </p>
              <img
                src={IMAGES.officeMeeting.src}
                alt={IMAGES.officeMeeting.alt}
                loading={IMAGES.officeMeeting.loading}
                width="800"
                height="500"
                className="mt-8 hidden h-56 w-full rounded-2xl object-cover shadow-md lg:block"
              />
            </div>
            <div className="rounded-3xl border border-gray-100 bg-gray-50/60 p-7 shadow-sm dark:border-slate-800 dark:bg-[#111224]/60 sm:p-9">
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="employee-slider" className="text-sm font-bold text-slate-900 dark:text-white">Employees</label>
                  <span className="text-sm font-bold text-brand-orange" id="employee-count">{empCount >= 1000 ? '1000+' : empCount}</span>
                </div>
                <input
                  id="employee-slider"
                  type="range"
                  min="1"
                  max="1000"
                  value={empCount}
                  onChange={(e) => setEmpCount(Number(e.target.value))}
                  className="mt-2 w-full cursor-pointer accent-orange-600"
                />
              </div>
              <div className="mt-7">
                <div className="flex items-baseline justify-between">
                  <label htmlFor="tool-slider" className="text-sm font-bold text-slate-900 dark:text-white">Tools replaced</label>
                  <span className="text-sm font-bold text-brand-orange" id="tool-count">{toolCount >= 20 ? '20+' : toolCount}</span>
                </div>
                <input
                  id="tool-slider"
                  type="range"
                  min="1"
                  max="20"
                  value={toolCount}
                  onChange={(e) => setToolCount(Number(e.target.value))}
                  className="mt-2 w-full cursor-pointer accent-orange-600"
                />
              </div>
              <div className="mt-8 rounded-2xl border border-green-200 bg-green-50 p-5 text-center dark:border-green-900/40 dark:bg-green-950/30">
                <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Estimated annual savings</p>
                <p className="mt-1 text-3xl font-extrabold text-green-600 dark:text-green-400" id="roi-savings">
                  ₹{roiSavings.toLocaleString('en-IN')}
                </p>
              </div>
              <Link to="/login" className="mt-6 block rounded-xl bg-brand-orange py-3.5 text-center text-sm font-bold text-white transition-colors hover:bg-orange-600">
                Get your full ROI breakdown
              </Link>
            </div>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-20 bg-gray-50/50 py-16 dark:bg-[#111224]/50 lg:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <div className="text-center">
              <span className="text-xs font-extrabold uppercase tracking-widest text-brand-orange">FAQ</span>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">Frequently asked questions</h2>
            </div>
            <div className="mt-10 space-y-3">
              {FAQS.map((faq, i) => (
                <div key={faq.q} className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-slate-800 dark:bg-[#0A0B1A]">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                    aria-expanded={openFaq === i}
                    className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left"
                  >
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{faq.q}</span>
                    <svg
                      className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${openFaq === i ? 'rotate-45' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 5v14m-7-7h14" />
                    </svg>
                  </button>
                  {openFaq === i && (
                    <p className="border-t border-gray-100 px-6 py-4 text-sm leading-relaxed text-gray-600 dark:border-slate-800 dark:text-gray-300">{faq.a}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA + newsletter ───────────────────────────────────────── */}
        <section className="bg-white py-16 dark:bg-[#0A0B1A] lg:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="relative overflow-hidden rounded-[2rem] bg-slate-900 px-6 py-12 dark:bg-slate-950 sm:px-12 sm:py-16">
              <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-600/10 blur-3xl" />
              <div className="relative z-10 grid items-center gap-10 lg:grid-cols-2">
                <div>
                  <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Stop switching. Start scaling.</h2>
                  <p className="mt-3 max-w-md text-sm leading-relaxed text-gray-400 sm:text-base">
                    Run your company from one connected workspace — people, work, revenue and operations in a single system built by a team that builds operational software.
                  </p>
                  <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-gray-300">
                    <li className="flex items-center gap-1.5"><span className="text-green-500">✓</span> 14 days free trial</li>
                    <li className="flex items-center gap-1.5"><span className="text-green-500">✓</span> No credit card required</li>
                    <li className="flex items-center gap-1.5"><span className="text-green-500">✓</span> Cancel anytime</li>
                  </ul>
                  <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <Link to="/login" className="rounded-xl bg-brand-orange px-8 py-3.5 text-center text-sm font-bold text-white transition-colors hover:bg-orange-600">
                      Start Free Trial
                    </Link>
                    <Link to="/login" className="rounded-xl border border-white/20 px-8 py-3.5 text-center text-sm font-bold text-white transition-colors hover:bg-white/10">
                      Book a Live Demo
                    </Link>
                  </div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-6 sm:p-8">
                  <div className="flex items-center gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-orange-500/20 text-brand-orange">
                      <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-white">Get smarter, weekly</h3>
                      <p className="mt-0.5 text-xs text-gray-400">Insights, product updates and automation tips.</p>
                    </div>
                  </div>
                  <form
                    className="mt-6 flex flex-col gap-3 sm:flex-row"
                    onSubmit={(e) => e.preventDefault()}
                  >
                    <input
                      type="email"
                      required
                      placeholder="Enter your work email"
                      aria-label="Work email"
                      className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                    />
                    <button type="submit" className="shrink-0 rounded-xl bg-brand-orange px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-600">
                      Subscribe
                    </button>
                  </form>
                  <p className="mt-3 text-[11px] text-gray-500">No spam. Unsubscribe anytime.</p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-gray-100 bg-gray-50/60 pb-10 pt-16 dark:border-slate-800 dark:bg-[#111224]/60" data-purpose="site-footer">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 md:grid-cols-6">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-gray-500 dark:text-gray-400">
              The AI business operating system for agencies, IT and service companies — tasks, people, clients and money in one workspace.
            </p>
          </div>
          {[
            { h: 'Platform', links: ['Tasks & Projects', 'CRM & Sales', 'HRMS & People', 'Attendance & Payroll', 'Executive AI'] },
            { h: 'Solutions', links: ['Digital Marketing Agencies', 'Creative Agencies', 'IT Services', 'Software Development', 'Consulting'] },
            { h: 'Company', links: ['About Us', 'Careers', 'Contact', 'Security', 'Sitemap'] },
          ].map((col) => (
            <div key={col.h}>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">{col.h}</h4>
              <ul className="mt-4 space-y-3">
                {col.links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm text-gray-500 transition-colors hover:text-brand-orange dark:text-gray-400">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Get started</h4>
            <ul className="mt-4 space-y-3 text-sm text-gray-500 dark:text-gray-400">
              <li><Link to="/login" className="transition-colors hover:text-brand-orange">Start free demo</Link></li>
              <li><Link to="/careers" className="transition-colors hover:text-brand-orange">Careers</Link></li>
              <li><Link to="/login" className="transition-colors hover:text-brand-orange">Login</Link></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto mt-12 flex max-w-7xl flex-col items-center justify-between gap-4 border-t border-gray-100 px-4 pt-8 dark:border-slate-800 sm:px-6 md:flex-row">
          <p className="text-xs text-gray-400">© {new Date().getFullYear()} SynTask. All rights reserved.</p>
          <div className="flex items-center gap-6 text-xs text-gray-400">
            <a href="#" className="transition-colors hover:text-brand-orange">Privacy Policy</a>
            <a href="#" className="transition-colors hover:text-brand-orange">Terms of Service</a>
            <a href="#" className="transition-colors hover:text-brand-orange">Security</a>
          </div>
        </div>
      </footer>
    </>
  );
}

