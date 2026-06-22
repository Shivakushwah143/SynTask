import { useState, useEffect, useRef } from 'react'
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
  Workflow,
  X,
  Zap,

  
  Clock,
  CheckCircle,
  Heart,
  Phone,
  FileText,
  Rocket,
  TrendingUp,
  Monitor,
  Factory,
  Scale,
  Hotel,
  HardHat,
  Landmark,
  UtensilsCrossed,
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

const compareRows = [
  ['Project delivery', false, true, true],
  ['CRM pipeline', false, true, true],
  ['Support tickets', false, false, true],
  ['Time tracking', false, true, true],
  ['Billing + invoices', false, false, true],
  ['Agency reporting', false, false, true],
]

// TrustedBy Component Data
const logos = [
  { name: "Accenture", abbr: "AC" },
  { name: "Deloitte", abbr: "DL" },
  { name: "McKinsey", abbr: "MC" },
  { name: "Bosch", abbr: "BS" },
  { name: "Siemens", abbr: "SI" },
  { name: "Honeywell", abbr: "HW" },
  { name: "Infosys", abbr: "IF" },
  { name: "Wipro", abbr: "WP" },
  { name: "Cognizant", abbr: "CG" },
  { name: "HCLTech", abbr: "HC" },
  { name: "Philips", abbr: "PH" },
  { name: "3M", abbr: "3M" },
]

// Statistics Component Data
const statsData = [
  { value: 48, suffix: "h", label: "Average Team Deployment", sublabel: "From kickoff to first commit", icon: Clock, color: "#2563EB" },
  { value: 250, suffix: "+", label: "Projects Delivered", sublabel: "Across 12 industries globally", icon: CheckCircle, color: "#4F46E5" },
  { value: 95, suffix: "%", label: "Client Retention", sublabel: "Long-term partnership model", icon: Heart, color: "#7C3AED" },
  { value: 24, suffix: "/7", label: "Managed Support", sublabel: "Always-on NOC & L1–L3", icon: Headphones, color: "#10B981" },
  { label: "Global Delivery", sublabel: "USA + India Delivery Centers", icon: Globe, color: "#F59E0B", custom: "2 Hubs" },
]

// HowItWorks Component Data
const howItWorksSteps = [
  {
    icon: Phone,
    number: "01",
    title: "Discovery Call",
    description: "We map your business challenges, existing stack, and goals in a focused 60-minute session with our solutions architects.",
    duration: "Day 1",
    color: "#2563EB",
  },
  {
    icon: FileText,
    number: "02",
    title: "Solution Blueprint",
    description: "Our team delivers a detailed technical and operational blueprint: team structure, tech stack, timelines, and ROI projections.",
    duration: "Days 2–3",
    color: "#4F46E5",
  },
  {
    icon: Rocket,
    number: "03",
    title: "Team Deployment",
    description: "Vetted engineers and AI specialists are onboarded to your project. Credentials, repos, and comms channels set up in hours.",
    duration: "Days 3–5",
    color: "#7C3AED",
  },
  {
    icon: Play,
    number: "04",
    title: "Execution & Delivery",
    description: "Sprints begin. Weekly demos, async standups, and full transparency via your preferred project management tools.",
    duration: "Week 2+",
    color: "#0891B2",
  },
  {
    icon: TrendingUp,
    number: "05",
    title: "Optimization & Scale",
    description: "Continuous improvement cycles. We scale teams up or down, introduce AI automation, and optimize for long-term business outcomes.",
    duration: "Ongoing",
    color: "#10B981",
  },
]

// Industries Component Data
const industries = [
  { name: "Information Technology", icon: Monitor, color: "#2563EB", desc: "Digital transformation, product engineering, cloud migration" },
  { name: "Manufacturing", icon: Factory, color: "#4F46E5", desc: "Smart factory, predictive maintenance, QA automation" },
  { name: "Legal", icon: Scale, color: "#7C3AED", desc: "Document automation, compliance, contract intelligence" },
  { name: "Healthcare", icon: Heart, color: "#EF4444", desc: "Patient ops, claims processing, clinical AI" },
  { name: "Hospitality", icon: Hotel, color: "#F59E0B", desc: "Guest experience, booking ops, revenue management" },
  { name: "Construction", icon: HardHat, color: "#EA580C", desc: "Project tracking, safety compliance, BIM integration" },
  { name: "Finance", icon: Landmark, color: "#0891B2", desc: "Risk management, regulatory reporting, fraud detection" },
  { name: "Food & Beverage", icon: UtensilsCrossed, color: "#10B981", desc: "Supply chain, inventory ops, demand forecasting" },
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

// ---- TrustedBy Component ----
function LogoChip({ name, abbr }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 24px",
        background: "white",
        border: "1px solid #E2E8F0",
        borderRadius: 10,
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          background: "linear-gradient(135deg, #1E3A5F, #2563EB)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 11,
          fontWeight: 800,
          color: "white",
          letterSpacing: "0.02em",
        }}
      >
        {abbr}
      </div>
      <span
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          fontWeight: 600,
          color: "#64748B",
          letterSpacing: "-0.01em",
        }}
      >
        {name}
      </span>
    </div>
  );
}

function TrustedBy() {
  const trackRef = useRef(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let pos = 0;
    let rafId;
    const speed = 0.5;

    function tick() {
      pos -= speed;
      const half = track.scrollWidth / 2;
      if (Math.abs(pos) >= half) pos = 0;
      track.style.transform = `translateX(${pos}px)`;
      rafId = requestAnimationFrame(tick);
    }
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const allLogos = [...logos, ...logos];

  return (
    <section style={{ padding: "64px 0", background: "#F8FAFC", borderTop: "1px solid #E2E8F0", borderBottom: "1px solid #E2E8F0" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", paddingBottom: 32, textAlign: "center" }}>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: "#94A3B8",
            letterSpacing: "0.1em",
            textTransform: "uppercase",
          }}
        >
          Trusted by Industry Leaders
        </p>
      </div>

      <div style={{ overflow: "hidden", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 120,
            background: "linear-gradient(to right, #F8FAFC, transparent)",
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: 120,
            background: "linear-gradient(to left, #F8FAFC, transparent)",
            zIndex: 2,
            pointerEvents: "none",
          }}
        />

        <div
          ref={trackRef}
          style={{
            display: "flex",
            gap: 12,
            willChange: "transform",
            width: "max-content",
          }}
        >
          {allLogos.map((logo, i) => (
            <LogoChip key={`${logo.name}-${i}`} name={logo.name} abbr={logo.abbr} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- Statistics Component ----
function useCountUp(target, duration, start) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime = null;
    function tick(ts) {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / (duration * 1000), 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(ease * target));
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration, start]);
  return count;
}

function StatCardWithCount({ stat, inView }) {
  const count = useCountUp(stat.value ?? 0, 1.5, inView);
  const Icon = stat.icon;

  return (
    <div
      style={{
        background: "white",
        border: "1px solid #E2E8F0",
        borderRadius: 16,
        padding: 32,
        position: "relative",
        overflow: "hidden",
        transition: "transform 0.2s, box-shadow 0.2s",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 16px 40px rgba(15,23,42,0.1)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          background: `linear-gradient(90deg, ${stat.color}, ${stat.color}88)`,
        }}
      />

      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: `${stat.color}12`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <Icon size={22} color={stat.color} />
      </div>

      <div
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 44,
          fontWeight: 800,
          color: "#0F172A",
          letterSpacing: "-0.03em",
          lineHeight: 1,
          marginBottom: 8,
        }}
      >
        {stat.custom ? stat.custom : `${count}${stat.suffix}`}
      </div>

      <div
        style={{
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          fontSize: 16,
          fontWeight: 600,
          color: "#0F172A",
          marginBottom: 4,
        }}
      >
        {stat.label}
      </div>
      <div
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: "#94A3B8",
        }}
      >
        {stat.sublabel}
      </div>
    </div>
  );
}

function Statistics() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true); },
      { threshold: 0.2 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <section ref={ref} style={{ padding: "96px 24px", background: "#FAFBFC" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "#2563EB",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Our Track Record
          </p>
          <h2
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "clamp(28px, 4vw, 48px)",
              fontWeight: 800,
              color: "#0F172A",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            Numbers that define our impact
          </h2>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 20,
          }}
        >
          {statsData.map((stat) => (
            <StatCardWithCount key={stat.label} stat={stat} inView={inView} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ---- HowItWorks Component ----
function HowItWorks() {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section style={{ padding: "96px 24px", background: "#F8FAFC" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "#2563EB",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            How It Works
          </p>
          <h2
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "clamp(28px, 4vw, 48px)",
              fontWeight: 800,
              color: "#0F172A",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            From first call to full operation
          </h2>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, color: "#475569", maxWidth: 480, margin: "0 auto" }}>
            A structured process built for enterprise speed and reliability.
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 0,
            marginBottom: 48,
            background: "#E2E8F0",
            borderRadius: 100,
            overflow: "hidden",
            height: 4,
          }}
        >
          <div
            style={{
              height: "100%",
              background: "linear-gradient(90deg, #2563EB, #10B981)",
              borderRadius: 100,
              transition: "width 0.5s ease",
              width: `${((activeStep + 1) / howItWorksSteps.length) * 100}%`,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 40,
            overflowX: "auto",
            paddingBottom: 4,
          }}
        >
          {howItWorksSteps.map((step, i) => (
            <button
              key={step.number}
              onClick={() => setActiveStep(i)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 18px",
                borderRadius: 100,
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "'Inter', sans-serif",
                fontSize: 13,
                fontWeight: 600,
                transition: "all 0.2s",
                background: activeStep === i ? step.color : "white",
                color: activeStep === i ? "white" : "#64748B",
                boxShadow: activeStep === i ? `0 2px 8px ${step.color}30` : "0 0 0 1px #E2E8F0",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  background: activeStep === i ? "rgba(255,255,255,0.25)" : "#F1F5F9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {step.number}
              </span>
              {step.title}
            </button>
          ))}
        </div>

        {(() => {
          const step = howItWorksSteps[activeStep];
          const Icon = step.icon;
          return (
            <div
              key={activeStep}
              style={{
                background: "white",
                border: `1px solid ${step.color}20`,
                borderRadius: 20,
                padding: 48,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 48,
                alignItems: "center",
                animation: "fadeIn 0.3s ease",
              }}
            >
              <div>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    background: `${step.color}10`,
                    border: `1px solid ${step.color}20`,
                    borderRadius: 100,
                    padding: "6px 14px",
                    marginBottom: 20,
                  }}
                >
                  <span style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 600, color: step.color }}>
                    {step.duration}
                  </span>
                </div>
                <h3
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 36,
                    fontWeight: 800,
                    color: "#0F172A",
                    letterSpacing: "-0.02em",
                    marginBottom: 16,
                    lineHeight: 1.2,
                  }}
                >
                  {step.title}
                </h3>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 16,
                    color: "#475569",
                    lineHeight: 1.7,
                    marginBottom: 28,
                  }}
                >
                  {step.description}
                </p>
                <button
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 14,
                    fontWeight: 600,
                    color: step.color,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: 0,
                  }}
                  onClick={() => setActiveStep((activeStep + 1) % howItWorksSteps.length)}
                >
                  {activeStep < howItWorksSteps.length - 1 ? "Next Step" : "Start Over"} <ArrowRight size={14} />
                </button>
              </div>

              <div style={{ display: "flex", justifyContent: "center" }}>
                <div
                  style={{
                    width: 200,
                    height: 200,
                    borderRadius: "50%",
                    background: `linear-gradient(135deg, ${step.color}15, ${step.color}05)`,
                    border: `2px solid ${step.color}20`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      width: 120,
                      height: 120,
                      borderRadius: "50%",
                      background: `linear-gradient(135deg, ${step.color}25, ${step.color}10)`,
                      border: `2px solid ${step.color}30`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 72,
                        height: 72,
                        borderRadius: "50%",
                        background: `linear-gradient(135deg, ${step.color}, ${step.color}CC)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: `0 8px 24px ${step.color}40`,
                      }}
                    >
                      <Icon size={32} color="white" />
                    </div>
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: 12,
                      right: 12,
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                      fontSize: 48,
                      fontWeight: 800,
                      color: `${step.color}15`,
                      letterSpacing: "-0.04em",
                      lineHeight: 1,
                    }}
                  >
                    {step.number}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}

// ---- Industries Component ----
function Industries() {
  const [hovered, setHovered] = useState(null);

  return (
    <section id="industries" style={{ padding: "96px 24px", background: "#F8FAFC" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: "#2563EB",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 12,
            }}
          >
            Industries We Serve
          </p>
          <h2
            style={{
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              fontSize: "clamp(28px, 4vw, 48px)",
              fontWeight: 800,
              color: "#0F172A",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              marginBottom: 16,
            }}
          >
            Built for every vertical
          </h2>
          <p style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, color: "#475569", maxWidth: 480, margin: "0 auto" }}>
            Deep domain expertise across industries that demand reliability, scale, and precision.
          </p>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 16,
          }}
        >
          {industries.map((ind, i) => {
            const Icon = ind.icon;
            const isHovered = hovered === i;
            return (
              <div
                key={ind.name}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  background: isHovered ? "white" : "white",
                  border: `1px solid ${isHovered ? ind.color + "40" : "#E2E8F0"}`,
                  borderRadius: 16,
                  padding: "28px 24px",
                  cursor: "default",
                  transition: "all 0.2s ease",
                  transform: isHovered ? "translateY(-4px)" : "translateY(0)",
                  boxShadow: isHovered ? `0 12px 24px rgba(15,23,42,0.08)` : "none",
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: isHovered ? `linear-gradient(135deg, ${ind.color}, ${ind.color}AA)` : `${ind.color}12`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 16,
                    transition: "all 0.2s",
                  }}
                >
                  <Icon size={22} color={isHovered ? "white" : ind.color} />
                </div>
                <h3
                  style={{
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#0F172A",
                    letterSpacing: "-0.01em",
                    marginBottom: 6,
                  }}
                >
                  {ind.name}
                </h3>
                <p
                  style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: 13,
                    color: "#64748B",
                    lineHeight: 1.5,
                  }}
                >
                  {ind.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---- Main NewLanding Component ----
function NewLanding() {
  const { theme, toggleTheme } = useTheme()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState(0)

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

        {/* TrustedBy Component */}
        <TrustedBy />

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

        {/* Statistics Component */}
        <Statistics />

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

        {/* HowItWorks Component */}
        <HowItWorks />

        <section id="features" className="relative mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
          <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
            <div className="absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-primary-100/70 blur-3xl" />
            <div className="absolute right-0 top-20 h-80 w-80 rounded-full bg-violet-100/60 blur-3xl" />
          </div>

          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Features"
              title="Everything an agency team needs, in one system"
              description="Built to reduce tool sprawl while giving operators, account managers, and leadership the controls they need."
            />
          </motion.div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
            <motion.div
              variants={itemVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              whileHover={{ y: -6 }}
              className={`overflow-hidden rounded-[2.25rem] border ${themeTheme.border} bg-gradient-to-br from-white via-primary-50/60 to-white p-7 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.26em] text-primary-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  Agency control center
                </span>
                <span className="rounded-full bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-700">
                  Live operational visibility
                </span>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
                <div>
                  <h3 className="font-display text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                    Run every client account from one elegant workspace.
                  </h3>
                  <p className={`mt-4 max-w-lg text-base leading-8 ${themeTheme.textSecondary}`}>
                    Keep your team aligned with shared task boards, deal visibility, support queues, and billing context that feels built for agencies.
                  </p>

                  <div className="mt-6 space-y-3">
                    {[
                      'Unified delivery, sales, support, and billing',
                      'Designed for agency owners and operations leads',
                      'Clear ownership across every client workflow',
                    ].map((item) => (
                      <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium text-slate-700">
                        <Check className="h-4 w-4 text-emerald-600" />
                        {item}
                      </div>
                    ))}
                  </div>

                  <div className="mt-7 grid grid-cols-3 gap-3">
                    {[
                      ['58%', 'Less admin'],
                      ['3.2x', 'Faster handoffs'],
                      ['94%', 'Visibility'],
                    ].map(([value, label]) => (
                      <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                        <div className="text-2xl font-black tracking-tight text-slate-950">{value}</div>
                        <div className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute -left-4 -top-4 h-24 w-24 rounded-full bg-primary-200/50 blur-2xl" />
                  <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
                    <img
                      src="https://images.unsplash.com/photo-1552664730-d307ca884978?w=1200&h=800&fit=crop"
                      alt="Agency team working"
                      className="h-[290px] w-full object-cover"
                    />
                    <div className="p-5">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Command view</div>
                          <div className="mt-1 text-lg font-bold text-slate-950">This week at a glance</div>
                        </div>
                        <div className="rounded-full bg-primary-50 px-3 py-1 text-xs font-semibold text-primary-700">Updated now</div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-3">
                        {[
                          ['12', 'Active clients'],
                          ['48', 'Open tasks'],
                          ['$84k', 'Pipeline'],
                        ].map(([value, label]) => (
                          <div key={label} className="rounded-2xl bg-slate-50 px-4 py-4">
                            <div className="text-xl font-black tracking-tight text-slate-950">{value}</div>
                            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={staggerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              className="grid gap-5 sm:grid-cols-2"
            >
              {features.map(({ icon: Icon, title, description }, index) => (
                <motion.div
                  key={title}
                  variants={itemVariants}
                  whileHover={{ y: -6 }}
                  className={`group relative overflow-hidden rounded-[1.9rem] border ${themeTheme.border} ${themeTheme.surface} p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)] ${
                    index === 0 || index === 5 ? 'sm:col-span-2' : ''
                  }`}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 via-violet-500 to-sky-500" />
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 text-primary-700 ring-1 ring-primary-100 transition group-hover:scale-105">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                      0{index + 1}
                    </div>
                  </div>
                  <h3 className="mt-5 text-2xl font-bold tracking-tight text-slate-950">{title}</h3>
                  <p className={`mt-3 max-w-md text-sm leading-7 ${themeTheme.textSecondary}`}>{description}</p>
                  <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-primary-700">
                    Learn more
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
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

        {/* Industries Component */}
        <Industries />

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Team"
              title="Give every role the workspace they need"
              description="Operators, account managers, and leadership each get a clearer path to the information and actions they need."
            />
          </motion.div>

          <div className="mt-10 grid gap-6 lg:grid-cols-[0.85fr_1.15fr]">
            <motion.div
              variants={itemVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              whileHover={{ y: -5 }}
              className={`relative overflow-hidden rounded-[2.25rem] border ${themeTheme.border} bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.2)]`}
            >
              <div className="absolute -right-10 top-8 h-40 w-40 rounded-full bg-primary-500/20 blur-3xl" />
              <div className="absolute -bottom-16 left-0 h-40 w-40 rounded-full bg-violet-500/15 blur-3xl" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-white/80">
                  <ShieldCheck className="h-3.5 w-3.5 text-sky-300" />
                  Role-based control
                </div>
                <h3 className="mt-6 max-w-md font-display text-4xl font-black tracking-tight sm:text-5xl">
                  Every role sees exactly what matters.
                </h3>
                <p className="mt-5 max-w-md text-base leading-8 text-slate-300">
                  The workspace adapts to your team structure so operations, client management, and leadership can move faster without stepping on each other.
                </p>

                <div className="mt-8 grid grid-cols-3 gap-3">
                  {[
                    ['Ops', 'Approvals'],
                    ['AMs', 'Client updates'],
                    ['Leads', 'Forecasts'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">{label}</div>
                      <div className="mt-2 text-sm font-bold text-white">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 space-y-4">
                  {[
                    { label: 'Operations Lead', pct: '92%', tone: 'bg-primary-500' },
                    { label: 'Account Manager', pct: '88%', tone: 'bg-violet-500' },
                    { label: 'Agency Founder', pct: '97%', tone: 'bg-emerald-500' },
                  ].map((row) => (
                    <div key={row.label} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <div className="flex items-center justify-between text-sm font-medium">
                        <span>{row.label}</span>
                        <span className="text-white/70">{row.pct} clarity</span>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full rounded-full ${row.tone}`} style={{ width: row.pct }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={staggerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              className="grid gap-5 sm:grid-cols-2"
            >
              {[
                {
                  name: 'Operations Lead',
                  icon: Workflow,
                  tag: 'Process owner',
                  bullets: ['Approvals', 'Capacity planning', 'Billing visibility'],
                  accent: 'from-primary-500/10 to-primary-50',
                },
                {
                  name: 'Account Manager',
                  icon: MessageSquare,
                  tag: 'Client owner',
                  bullets: ['Client communication', 'Project status', 'Ticket follow-up'],
                  accent: 'from-violet-500/10 to-violet-50',
                },
                {
                  name: 'Agency Founder',
                  icon: BrainCircuit,
                  tag: 'Decision maker',
                  bullets: ['Revenue trends', 'Delivery health', 'Pipeline forecast'],
                  accent: 'from-emerald-500/10 to-emerald-50',
                },
              ].map((person, index) => {
                const Icon = person.icon
                const isWide = index === 2
                return (
                  <motion.div
                    key={person.name}
                    variants={itemVariants}
                    whileHover={{ y: -6 }}
                    className={`relative overflow-hidden rounded-[2rem] border ${themeTheme.border} bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.05)] ${
                      isWide ? 'sm:col-span-2' : ''
                    }`}
                  >
                    <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${person.accent}`} />
                    <div className={`absolute right-0 top-0 h-28 w-28 rounded-full bg-gradient-to-br ${person.accent} blur-2xl`} />
                    <div className="relative">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-lg shadow-slate-200">
                            <Icon className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="text-xl font-black tracking-tight text-slate-950">{person.name}</div>
                            <div className={`text-sm ${themeTheme.textSecondary}`}>{person.tag}</div>
                          </div>
                        </div>
                        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                          Role {index + 1}
                        </div>
                      </div>
                      <div className="mt-6 space-y-3">
                        {person.bullets.map((bullet) => (
                          <div key={bullet} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                            <Check className="h-4 w-4 text-emerald-600" />
                            {bullet}
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </motion.div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <motion.div variants={sectionVariants} initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }}>
            <SectionHeading
              eyebrow="Why SynTask"
              title="Stop stitching together tools that were never built for agencies"
              description="A focused comparison helps teams understand the difference between generic software and an agency-native operating system."
            />
          </motion.div>

          <div className="mt-12 grid gap-6 lg:grid-cols-[0.72fr_1.28fr]">
            <motion.div
              variants={itemVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              className={`relative overflow-hidden rounded-[2.25rem] border ${themeTheme.border} bg-slate-950 p-8 text-white shadow-[0_24px_70px_rgba(15,23,42,0.18)]`}
            >
              <div className="absolute -right-12 top-0 h-40 w-40 rounded-full bg-primary-500/20 blur-3xl" />
              <div className="absolute -bottom-16 left-0 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.28em] text-white/75">
                  <ShieldCheck className="h-3.5 w-3.5 text-sky-300" />
                  Decision guide
                </div>
                <h3 className="mt-6 max-w-sm font-display text-4xl font-black tracking-tight">
                  The difference becomes obvious when the work gets real.
                </h3>
                <p className="mt-5 max-w-md text-base leading-8 text-slate-300">
                  Spreadsheets and generic tools can track tasks. SynTask connects the full agency workflow so leaders can operate with confidence.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                  {[
                    ['Ops', 'Cleaner handoffs'],
                    ['Sales', 'One pipeline'],
                    ['Finance', 'Connected billing'],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">{label}</div>
                      <div className="mt-2 text-sm font-bold text-white">{value}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/55">Best fit</div>
                  <div className="mt-2 text-xl font-black tracking-tight">SynTask for agency operators</div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Designed for teams that want fewer tools, stronger visibility, and a more premium client experience.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={staggerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              className={`overflow-hidden rounded-[2.25rem] border ${themeTheme.border} ${themeTheme.surface} shadow-[0_20px_50px_rgba(15,23,42,0.05)]`}
            >
              <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50/90 px-6 py-4 text-sm font-semibold text-slate-600">
                <div>Capability</div>
                <div className="text-center">Spreadsheets</div>
                <div className="text-center">Generic PM tools</div>
                <div className="text-center">
                  <span className="inline-flex items-center gap-2 rounded-full bg-primary-600 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white">
                    SynTask
                    <Sparkles className="h-3 w-3" />
                  </span>
                </div>
              </div>

              {compareRows.map(([label, sheets, generic, syntask], index) => (
                <div
                  key={label}
                  className={`grid grid-cols-4 items-center border-b border-slate-100 px-6 py-5 last:border-b-0 ${
                    index % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'
                  }`}
                >
                  <div>
                    <div className="text-base font-semibold text-slate-900">{label}</div>
                    <div className="mt-1 text-xs font-medium uppercase tracking-[0.2em] text-slate-400">
                      Agency workflow coverage
                    </div>
                  </div>

                  <div className="flex justify-center">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-500">
                      {sheets ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                    </span>
                  </div>

                  <div className="flex justify-center">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                      {generic ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                    </span>
                  </div>

                  <div className="flex justify-center">
                    <span
                      className={`inline-flex h-11 w-11 items-center justify-center rounded-full shadow-sm ${
                        syntask ? 'bg-emerald-600 text-white shadow-emerald-200' : 'bg-rose-50 text-rose-500'
                      }`}
                    >
                      {syntask ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
                    </span>
                  </div>
                </div>
              ))}

              <div className="grid gap-4 border-t border-slate-200 bg-gradient-to-r from-primary-50 via-white to-violet-50 px-6 py-5 sm:grid-cols-[1fr_auto] sm:items-center">
                <div>
                  <div className="text-sm font-bold text-slate-900">Built to replace patchwork with clarity</div>
                  <div className="mt-1 text-sm text-slate-600">
                    If you want one place for operations, sales, and billing, SynTask is the direct answer.
                  </div>
                </div>
                <a
                  href="#pricing"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  View pricing
                  <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            </motion.div>
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

          <div className="mt-12 grid gap-6">
            <motion.div
              variants={itemVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              whileHover={{ y: -5 }}
              className={`relative overflow-hidden rounded-[2.25rem] border ${themeTheme.border} bg-slate-950 p-8 text-white shadow-[0_26px_70px_rgba(15,23,42,0.18)]`}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.35),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(139,92,246,0.22),transparent_36%)]" />
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-white/75">
                  <Sparkles className="h-3.5 w-3.5 text-sky-300" />
                  Built for agency growth
                </div>
                <h3 className="mt-6 max-w-md font-display text-4xl font-black tracking-tight sm:text-5xl">
                  Pricing that scales with real client work.
                </h3>
                <p className="mt-5 max-w-md text-base leading-8 text-slate-300">
                  Start lean, upgrade when operations grow, and keep the whole agency in one operating system instead of stitching tools together.
                </p>

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {[
                    ['500+', 'Agencies'],
                    ['18h', 'Saved weekly'],
                    ['94%', 'Renewals'],
                  ].map(([value, label]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/6 p-4">
                      <div className="text-2xl font-black tracking-tight text-white">{value}</div>
                      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/55">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 rounded-[1.75rem] border border-white/10 bg-white/5 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.24em] text-white/50">Best fit</div>
                      <div className="mt-1 text-lg font-bold">Professional plan</div>
                    </div>
                    <div className="rounded-full bg-primary-500 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-white">
                      Most Popular
                    </div>
                  </div>
                  <div className="mt-4 flex items-end gap-2">
                    <div className="font-display text-5xl font-black tracking-tight">$79</div>
                    <div className="pb-1 text-sm text-white/65">/mo</div>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-300">
                    Ideal for scaling agencies that need full visibility across delivery, sales, support, and billing.
                  </p>
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={staggerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.15 }}
              className="grid gap-5 lg:grid-cols-3"
            >
              {pricing.map((tier) => {
                const featured = tier.accent
                return (
                  <motion.div
                    key={tier.name}
                    variants={itemVariants}
                    whileHover={{ y: -6 }}
                    className={`relative overflow-hidden rounded-[2rem] border p-7 shadow-[0_18px_45px_rgba(15,23,42,0.05)] ${
                      featured ? 'border-primary-200 bg-gradient-to-br from-primary-50 to-white' : `${themeTheme.border} ${themeTheme.surface}`
                    }`}
                  >
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary-500 via-violet-500 to-sky-500" />
                    {featured && (
                      <div className="absolute right-6 top-6 rounded-full bg-primary-600 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-white">
                        Most Popular
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">{tier.name}</div>
                        <div className="mt-4 flex items-end gap-2">
                          <div className="font-display text-5xl font-black tracking-tight text-slate-950">{tier.price}</div>
                          <div className="pb-1 text-sm font-medium text-slate-500">{tier.period}</div>
                        </div>
                      </div>
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                        <BadgeDollarSign className="h-6 w-6" />
                      </div>
                    </div>

                    <p className={`mt-4 text-sm leading-7 ${themeTheme.textSecondary}`}>{tier.description}</p>

                    <div className="mt-6 space-y-3">
                      {tier.features.map((feature) => (
                        <div key={feature} className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm">
                          <Check className="h-4 w-4 text-emerald-600" />
                          {feature}
                        </div>
                      ))}
                    </div>

                    <a
                      href="#contact"
                      className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                        featured
                          ? 'bg-primary-600 text-white shadow-lg shadow-primary-200 hover:bg-primary-700'
                          : 'bg-slate-950 text-white hover:bg-slate-800'
                      }`}
                    >
                      Choose plan
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </motion.div>
                )
              })}
            </motion.div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              'No setup fees',
              'Cancel anytime',
              'Dedicated onboarding for higher tiers',
            ].map((value) => (
              <div key={value} className={`rounded-[1.5rem] border ${themeTheme.border} ${themeTheme.surface} px-5 py-4 text-sm font-semibold text-slate-700 shadow-sm`}>
                {value}
              </div>
            ))}
          </div>
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
                      rows={5}
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
