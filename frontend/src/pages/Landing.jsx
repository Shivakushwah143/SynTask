// import { Link } from 'react-router-dom'
// import {
//   ArrowRight,
//   BarChart3,
//   CheckCircle2,
//   Gauge,
//   Clock3,
//   FileCheck2,
//   MessageSquareMore,
//   LayoutDashboard,
//   Megaphone,
//   ShieldCheck,
//   Sparkles,
//   Users,
//   Zap,
// } from 'lucide-react'

// const features = [
//   {
//     icon: Clock3,
//     title: 'Campaign time tracking',
//     description: 'Track hours by client, campaign, and deliverable so agency margins stay visible.',
//   },
//   {
//     icon: FileCheck2,
//     title: 'Creative approvals',
//     description: 'Route briefs, captions, assets, and revisions through a clear review flow.',
//   },
//   {
//     icon: LayoutDashboard,
//     title: 'Content and client visibility',
//     description: 'See live status for campaigns, posts, and deliverables in one dashboard.',
//   },
//   {
//     icon: BarChart3,
//     title: 'Agency reporting',
//     description: 'Show clients performance, utilization, and campaign progress with presentation-ready reports.',
//   },
//   {
//     icon: Users,
//     title: 'Team and client roles',
//     description: 'Coordinate strategists, designers, account managers, and client stakeholders without confusion.',
//   },
//   {
//     icon: ShieldCheck,
//     title: 'Controlled access',
//     description: 'Protect client work with role-based permissions and a clear audit history.',
//   },
// ]

// const integrations = ['Slack', 'Figma', 'Google Drive', 'Meta Ads', 'Google Analytics']

// const highlights = [
//   'Built for social media agencies and client services teams',
//   'Campaign, content, and approvals in one place',
//   'Designed to show value to clients faster',
// ]

// const workflowSteps = [
//   {
//     step: '01',
//     title: 'Plan',
//     text: 'Organize campaigns, content calendars, deliverables, and client ownership before work starts.',
//   },
//   {
//     step: '02',
//     title: 'Collaborate',
//     text: 'Briefs, creative assets, and revisions move through team review and client approval.',
//   },
//   {
//     step: '03',
//     title: 'Prove results',
//     text: 'Turn weekly activity into reports that show progress, performance, and delivered value.',
//   },
// ]

// const agencyPillars = [
//   {
//     icon: Megaphone,
//     title: 'Content engine',
//     text: 'Plan social posts, ad creatives, and client deliverables on a shared calendar.',
//   },
//   {
//     icon: MessageSquareMore,
//     title: 'Client approvals',
//     text: 'Keep feedback and sign-off controlled so revisions do not live in scattered chat threads.',
//   },
//   {
//     icon: Users,
//     title: 'Account visibility',
//     text: 'Give account leads and managers a clean view of workload, deadlines, and priorities.',
//   },
//   {
//     icon: Gauge,
//     title: 'Performance reporting',
//     text: 'Package the week\'s work into reports clients can understand quickly.',
//   },
// ]

// const agencyStats = [
//   { label: 'Campaigns managed', value: '120+' },
//   { label: 'Approval steps cut', value: '40%' },
//   { label: 'Client reports', value: 'Weekly' },
//   { label: 'Visibility', value: 'One view' },
// ]

// const pricingPlans = [
//   {
//     name: 'Starter',
//     price: '$18',
//     cadence: 'per user / month',
//     description: 'For small agencies that need a disciplined way to manage content and approvals.',
//     features: ['Campaign calendar', 'Time entry and approvals', 'Basic client reporting'],
//     accent: false,
//   },
//   {
//     name: 'Team',
//     price: '$32',
//     cadence: 'per user / month',
//     description: 'For growing social media teams that need more visibility across accounts.',
//     features: ['Everything in Starter', 'Advanced dashboards', 'Role-based permissions', 'Creative workflow controls'],
//     accent: true,
//   },
//   {
//     name: 'Enterprise',
//     price: 'Custom',
//     cadence: 'pricing',
//     description: 'For multi-client agencies that need governance, rollout support, and scale.',
//     features: ['SSO and admin controls', 'Workflow customization', 'Dedicated onboarding', 'Priority support'],
//     accent: false,
//   },
// ]

// const galleryCards = [
//   {
//     title: 'Agency command center',
//     subtitle: 'Clients, campaigns, and deadlines at a glance',
//     image: '/dashboard-preview.webp',
//     className: 'sm:col-span-2 sm:row-span-2',
//     objectPosition: 'center top',
//   },
//   {
//     title: 'Content calendar',
//     subtitle: 'Plan posts, reels, and launch dates',
//     image: '/dashboard-preview.webp',
//     objectPosition: 'left center',
//   },
//   {
//     title: 'Creative review',
//     subtitle: 'Briefs and revisions ready for sign-off',
//     image: '/dashboard-preview.webp',
//     objectPosition: 'right center',
//   },
//   {
//     title: 'Client reporting',
//     subtitle: 'Translate work into results',
//     image: '/dashboard-preview.webp',
//     objectPosition: 'center bottom',
//   },
//   {
//     title: 'Workflow control',
//     subtitle: 'Protect high-value client work',
//     accent: true,
//   },
// ]

// const Landing = () => {
//   return (
//     <div className="min-h-screen bg-slate-950 text-white">
//       <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
//         <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
//           <div className="flex items-center gap-3">
//             <a href="/logo.svg" target="_blank" rel="noreferrer" aria-label="Open SynTask logo in a new tab">
//               <img src="/logo.svg" alt="SynTask" className="h-10 w-10" />
//             </a>
//             <div>
//               <div className="text-base font-semibold tracking-tight">SynTask</div>
//               <div className="text-xs text-slate-400">Agency operations and delivery</div>
//             </div>
//           </div>

//           <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
//             <a href="#features" className="transition hover:text-white">Features</a>
//             <a href="#integrations" className="transition hover:text-white">Integrations</a>
//             <a href="#workflow" className="transition hover:text-white">Workflow</a>
//             <a href="#pricing" className="transition hover:text-white">Pricing</a>
//             <a href="#about" className="transition hover:text-white">About</a>
//           </nav>

//           <div className="flex items-center gap-3">
//             <Link to="/login" className="hidden rounded-full border border-white/15 px-4 py-2 text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/5 sm:inline-flex">
//               Sign in
//             </Link>
//             <Link to="/admin-request" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:scale-[1.01]">
//               Request access
//               <ArrowRight className="h-4 w-4" />
//             </Link>
//           </div>
//         </div>
//       </header>

//       <main>
//         <section className="relative overflow-hidden">
//           <div className="absolute inset-0">
//             <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-500/20 blur-3xl" />
//             <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-violet-500/20 blur-3xl" />
//             <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl" />
//           </div>

//           <div className="relative mx-auto grid max-w-7xl gap-16 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-28 lg:pt-24">
//             <div className="max-w-2xl">
//               <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200">
//                 <Sparkles className="h-4 w-4 text-cyan-300" />
//                 Built for social media agencies that need control, clarity, and client-ready delivery
//               </div>

//               <h1 className="mt-6 text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
//                 Run your agency&apos;s campaigns, content, approvals, and reporting from one workspace.
//               </h1>

//               <p className="mt-6 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
//                 SynTask gives social media agencies one operating system for briefs, client feedback, scheduling, delivery, and the reporting that proves the work.
//               </p>

//               <ul className="mt-8 space-y-3 text-sm text-slate-200">
//                 {highlights.map((item) => (
//                   <li key={item} className="flex items-center gap-3">
//                     <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-400" />
//                     <span>{item}</span>
//                   </li>
//                 ))}
//               </ul>

//               <div className="mt-10 flex flex-col gap-4 sm:flex-row">
//                 <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-slate-950 transition hover:-translate-y-0.5">
//                   Sign in to SynTask
//                   <ArrowRight className="h-4 w-4" />
//                 </Link>
//                 <a href="#features" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 font-semibold text-white transition hover:border-white/30 hover:bg-white/5">
//                   Explore features
//                 </a>
//               </div>

//               <div className="mt-10 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-3">
//                 {[
//                   { label: 'Accounts', value: 'Multiple clients' },
//                   { label: 'Approval flows', value: 'Creative sign-off' },
//                   { label: 'Reporting', value: 'Client-ready' },
//                 ].map((item) => (
//                   <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
//                     <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{item.label}</div>
//                     <div className="mt-2 text-sm font-semibold text-white">{item.value}</div>
//                   </div>
//                 ))}
//               </div>
//             </div>

//             <div className="relative">
//               <div className="absolute -left-4 top-8 hidden rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-2xl shadow-black/40 lg:block">
//                 <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Status</div>
//                 <div className="mt-1 text-sm font-semibold text-white">Live client approvals</div>
//                 <div className="mt-2 text-sm text-slate-300">Keep every creative request moving without losing the audit trail.</div>
//               </div>

//               <a
//                 href="/dashboard-preview.png"
//                 target="_blank"
//                 rel="noreferrer"
//                 className="block overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900 shadow-2xl shadow-black/40"
//                 aria-label="Open SynTask dashboard preview in a new tab"
//               >
//                 <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
//                   <div>
//                     <div className="text-sm font-semibold text-white">SynTask dashboard</div>
//                     <div className="text-xs text-slate-400">Team visibility at a glance</div>
//                   </div>
//                   <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
//                     Active
//                   </div>
//                 </div>

//                 <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
//                   <div className="space-y-4 border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
//                     <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
//                       <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Productivity</div>
//                       <div className="mt-2 text-3xl font-semibold text-white">Campaign + content</div>
//                       <div className="mt-2 text-sm text-slate-300">Unify creative work with delivery and approvals.</div>
//                     </div>

//                     <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
//                       {[
//                         { label: 'Approvals', value: 'Waiting for client sign-off' },
//                         { label: 'Reporting', value: 'Ready for account review' },
//                         { label: 'Permissions', value: 'Role-based access' },
//                       ].map((item) => (
//                         <div key={item.label} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
//                           <div className="text-xs uppercase tracking-[0.2em] text-slate-500">{item.label}</div>
//                           <div className="mt-2 text-sm font-semibold text-white">{item.value}</div>
//                         </div>
//                       ))}
//                     </div>
//                   </div>

//                   <div className="p-4 sm:p-5">
//                     <a
//                       href="/dashboard-preview.png"
//                       target="_blank"
//                       rel="noreferrer"
//                       className="block h-full w-full"
//                       aria-label="Open SynTask dashboard preview in a new tab"
//                     >
//                       <img
//                         src="/dashboard-preview.png"
//                         alt="SynTask dashboard preview"
//                         className="h-full w-full rounded-[1.5rem] object-cover shadow-xl shadow-black/30"
//                       />
//                     </a>
//                   </div>
//                 </div>
//               </a>

//               <div className="absolute -bottom-5 right-4 hidden rounded-2xl border border-white/10 bg-slate-900/90 p-4 shadow-2xl shadow-black/40 sm:block">
//                 <div className="flex items-center gap-3">
//                   <div className="rounded-full bg-blue-500/20 p-2 text-blue-200">
//                     <Zap className="h-4 w-4" />
//                   </div>
//                   <div>
//                     <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Fast setup</div>
//                     <div className="text-sm font-semibold text-white">Made for enterprise adoption</div>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           </div>
//         </section>

//         <section className="border-y border-white/10 bg-white/5">
//           <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
//             <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-5">
//               {integrations.map((item) => (
//                 <div key={item} className="rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-4 text-sm font-medium text-slate-200">
//                   {item}
//                 </div>
//               ))}
//             </div>
//           </div>
//         </section>

//         <section className="mx-auto max-w-7xl px-4 pb-8 pt-14 sm:px-6 lg:px-8">
//           <div className="mb-8 max-w-2xl">
//             <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Visuals</p>
//             <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
//               Five related visuals make the page feel like a real product launch.
//             </h2>
//             <p className="mt-4 text-base leading-7 text-slate-300">
//               Agencies expect to see the product story in multiple angles, not just a single screenshot. This block acts like a mini case-study strip.
//             </p>
//           </div>

//               <div className="grid gap-4 md:grid-cols-3 md:auto-rows-[180px]">
//             {galleryCards.map((card) => (
//               <div
//                 key={card.title}
//                 className={`relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-900/70 shadow-lg shadow-black/20 ${card.className || ''}`}
//               >
//                 {card.image ? (
//                   <a
//                     href={card.image}
//                     target="_blank"
//                     rel="noreferrer"
//                     className="block h-full w-full"
//                     aria-label={`Open ${card.title} image in a new tab`}
//                   >
//                     <img
//                       src={card.image}
//                       alt={card.title}
//                       className="h-full w-full object-cover"
//                       style={{ objectPosition: card.objectPosition }}
//                     />
//                   </a>
//                 ) : (
//                   <div className="flex h-full flex-col justify-between bg-gradient-to-br from-violet-500/25 via-slate-950 to-blue-500/20 p-5">
//                     <div>
//                       <div className="text-xs uppercase tracking-[0.25em] text-slate-400">Secure</div>
//                       <div className="mt-2 text-2xl font-semibold text-white">Role based access</div>
//                       <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">
//                         Keep permissions scoped so teams only see what they need.
//                       </p>
//                     </div>
//                     <div className="grid grid-cols-2 gap-3">
//                       {['Admin', 'Manager', 'Member', 'Viewer'].map((role) => (
//                         <div key={role} className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100">
//                           {role}
//                         </div>
//                       ))}
//                     </div>
//                   </div>
//                 )}

//                 {card.image && (
//                   <a
//                     href={card.image}
//                     target="_blank"
//                     rel="noreferrer"
//                     className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-slate-950 via-slate-950/85 to-transparent p-4"
//                     aria-label={`Open ${card.title} details in a new tab`}
//                   >
//                     <div className="text-xs uppercase tracking-[0.25em] text-cyan-300/90">Preview</div>
//                     <div className="mt-1 text-lg font-semibold text-white">{card.title}</div>
//                     <div className="text-sm text-slate-300">{card.subtitle}</div>
//                   </a>
//                 )}
//               </div>
//             ))}
//           </div>
//         </section>

//         <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
//           <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
//             <div className="rounded-[1.75rem] border border-white/10 bg-slate-900/80 p-8">
//               <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Agency proof</p>
//               <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
//                 The page should feel built for a serious agency pitch.
//               </h2>
//               <p className="mt-4 text-base leading-7 text-slate-300">
//                 Social media agencies sell outcomes, speed, and trust. This section gives the landing page the extra depth that a million-dollar product usually has.
//               </p>

//               <div className="mt-8 grid grid-cols-2 gap-4">
//                 {agencyStats.map((item) => (
//                   <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
//                     <div className="text-3xl font-semibold text-white">{item.value}</div>
//                     <div className="mt-2 text-sm text-slate-400">{item.label}</div>
//                   </div>
//                 ))}
//               </div>
//             </div>

//             <div className="grid gap-4 sm:grid-cols-2">
//               {agencyPillars.map((item) => {
//                 const Icon = item.icon
//                 return (
//                   <div key={item.title} className="rounded-[1.75rem] border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-black/20">
//                     <div className="inline-flex rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 p-3 text-cyan-200">
//                       <Icon className="h-6 w-6" />
//                     </div>
//                     <h3 className="mt-5 text-xl font-semibold text-white">{item.title}</h3>
//                     <p className="mt-3 text-sm leading-6 text-slate-300">{item.text}</p>
//                   </div>
//                 )
//               })}
//             </div>
//           </div>
//         </section>

//         <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
//           <div className="max-w-2xl">
//             <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Features</p>
//             <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
//               Built around the work a social media agency actually does every day.
//             </h2>
//             <p className="mt-4 text-base leading-7 text-slate-300">
//               The page now speaks to agency buyers: campaign coordination, content calendars, revisions, approvals, client updates, and reporting.
//             </p>
//           </div>

//           <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
//             {features.map((feature) => {
//               const Icon = feature.icon
//               return (
//                 <div key={feature.title} className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-lg shadow-black/20">
//                   <div className="inline-flex rounded-2xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 p-3 text-cyan-200">
//                     <Icon className="h-6 w-6" />
//                   </div>
//                   <h3 className="mt-5 text-xl font-semibold text-white">{feature.title}</h3>
//                   <p className="mt-3 text-sm leading-6 text-slate-300">{feature.description}</p>
//                 </div>
//               )
//             })}
//           </div>
//         </section>

//         <section id="integrations" className="bg-slate-900/80">
//           <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
//             <div>
//               <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-300">Integrations</p>
//               <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
//                 Designed to sit inside the stack agencies already use.
//               </h2>
//               <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
//                 Social media agencies usually juggle chat, files, creative tools, and analytics. SynTask gives you a central layer that connects the work instead of replacing the tools you already trust.
//               </p>
//               <div className="mt-8 grid gap-3 sm:grid-cols-2">
//                 {[
//                   'Slack for fast team communication',
//                   'Figma for creative handoff and reviews',
//                   'Google Drive for shared assets and briefs',
//                   'Meta Ads and analytics for performance context',
//                 ].map((item) => (
//                   <div key={item} className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
//                     {item}
//                   </div>
//                 ))}
//               </div>
//             </div>

//             <div className="grid gap-4 sm:grid-cols-2">
//               {[
//                 { title: 'Briefs', body: 'Keep social campaign briefs, notes, and deliverables tied to the right client.' },
//                 { title: 'Governance', body: 'Use role-based controls to protect client assets and approvals.' },
//                 { title: 'Reporting', body: 'Translate work into client-facing performance and delivery updates.' },
//                 { title: 'Automation', body: 'Reduce repetitive handoffs with clear workflow stages.' },
//               ].map((item) => (
//                 <div key={item.title} className="rounded-3xl border border-white/10 bg-slate-950/60 p-6">
//                   <div className="text-lg font-semibold text-white">{item.title}</div>
//                   <p className="mt-3 text-sm leading-6 text-slate-300">{item.body}</p>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </section>

//         <section id="workflow" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
//           <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
//             <div>
//               <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Workflow</p>
//               <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
//                 A bigger workflow for agencies that manage many clients at once.
//               </h2>
//               <p className="mt-4 max-w-xl text-base leading-7 text-slate-300">
//                 The workflow should feel substantial on the page. This section explains how campaigns move from brief to delivery, then into reporting and renewal conversations.
//               </p>
//             </div>

//             <div className="grid gap-4">
//               {workflowSteps.map((item) => (
//                 <div key={item.step} className="flex gap-4 rounded-3xl border border-white/10 bg-slate-900/70 p-6">
//                   <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-sm font-bold text-slate-950">
//                     {item.step}
//                   </div>
//                   <div>
//                     <div className="text-lg font-semibold text-white">{item.title}</div>
//                     <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         </section>

//         <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
//           <div className="max-w-2xl">
//             <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">Pricing</p>
//             <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
//               Pricing that makes sense for agencies with different client loads.
//             </h2>
//             <p className="mt-4 text-base leading-7 text-slate-300">
//               Larger sections need larger-value messaging. These plans are positioned for boutique agencies, growing teams, and multi-client operations.
//             </p>
//           </div>

//           <div className="mt-10 grid gap-5 lg:grid-cols-3">
//             {pricingPlans.map((plan) => (
//               <div
//                 key={plan.name}
//                 className={`rounded-[1.75rem] border p-6 shadow-lg shadow-black/20 ${
//                   plan.accent
//                     ? 'border-cyan-400/40 bg-gradient-to-b from-cyan-500/15 to-slate-900'
//                     : 'border-white/10 bg-slate-900/70'
//                 }`}
//               >
//                 <div className="flex items-center justify-between gap-4">
//                   <h3 className="text-xl font-semibold text-white">{plan.name}</h3>
//                   {plan.accent && (
//                     <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
//                       Popular
//                     </span>
//                   )}
//                 </div>

//                 <div className="mt-6 flex items-end gap-2">
//                   <div className="text-5xl font-semibold tracking-tight text-white">{plan.price}</div>
//                   <div className="pb-1 text-sm text-slate-400">{plan.cadence}</div>
//                 </div>

//                 <p className="mt-4 text-sm leading-6 text-slate-300">{plan.description}</p>

//                 <ul className="mt-6 space-y-3 text-sm text-slate-200">
//                   {plan.features.map((feature) => (
//                     <li key={feature} className="flex items-start gap-3">
//                       <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
//                       <span>{feature}</span>
//                     </li>
//                   ))}
//                 </ul>

//                 <Link
//                   to="/admin-request"
//                   className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
//                     plan.accent
//                       ? 'bg-white text-slate-950 hover:-translate-y-0.5'
//                       : 'border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10'
//                   }`}
//                 >
//                   Request access
//                   <ArrowRight className="h-4 w-4" />
//                 </Link>
//               </div>
//             ))}
//           </div>
//         </section>

//         <section id="about" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
//           <div className="rounded-[2rem] border border-white/10 bg-gradient-to-r from-violet-600/20 via-slate-900 to-blue-600/20 p-8 sm:p-10 lg:p-12">
//             <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
//               <div>
//                 <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-200">About SynTask</p>
//                 <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
//                   Built for agencies that need to look sharp to clients and stay organized internally.
//                 </h2>
//                 <p className="mt-4 max-w-3xl text-base leading-7 text-slate-200">
//                   SynTask is a social media agency operating layer for campaign delivery, creative approvals, client updates, and reporting. It should feel large, credible, and polished enough for a high-value product pitch.
//                 </p>
//               </div>

//               <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
//                 <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 font-semibold text-slate-950">
//                   Launch app
//                   <ArrowRight className="h-4 w-4" />
//                 </Link>
//                 <Link to="/admin-request" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-6 py-3 font-semibold text-white">
//                   Contact admin
//                 </Link>
//               </div>
//             </div>
//           </div>
//         </section>
//       </main>

//       <footer className="border-t border-white/10 bg-slate-950">
//         <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
//           <div>
//             <div className="flex items-center gap-3">
//               <a href="/logo.svg" target="_blank" rel="noreferrer" aria-label="Open SynTask logo in a new tab">
//                 <img src="/logo.svg" alt="SynTask" className="h-10 w-10" />
//               </a>
//               <div>
//                 <div className="font-semibold text-white">SynTask</div>
//                 <div className="text-sm text-slate-400">Task management and ticketing platform</div>
//               </div>
//             </div>
//             <p className="mt-4 max-w-xl text-sm leading-6 text-slate-400">
//               A refined front door for the product, aligned with the existing purple-blue enterprise theme and ready to expand later.
//             </p>
//           </div>

//           <div className="grid grid-cols-2 gap-4 text-sm text-slate-300 sm:grid-cols-3">
//             <a href="#features" className="transition hover:text-white">Features</a>
//             <a href="#integrations" className="transition hover:text-white">Integrations</a>
//             <a href="#workflow" className="transition hover:text-white">Workflow</a>
//             <Link to="/login" className="transition hover:text-white">Sign in</Link>
//             <Link to="/admin-request" className="transition hover:text-white">Request access</Link>
//             <a href="#about" className="transition hover:text-white">About</a>
//           </div>
//         </div>
//       </footer>
//     </div>
//   )
// }

// export default Landing


import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Gauge,
  Clock3,
  FileCheck2,
  MessageSquareMore,
  LayoutDashboard,
  Megaphone,
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from 'lucide-react'

const features = [
  {
    icon: Clock3,
    title: 'Campaign time tracking',
    description: 'Track hours by client, campaign, and deliverable so agency margins stay visible.',
  },
  {
    icon: FileCheck2,
    title: 'Creative approvals',
    description: 'Route briefs, captions, assets, and revisions through a clear review flow.',
  },
  {
    icon: LayoutDashboard,
    title: 'Content and client visibility',
    description: 'See live status for campaigns, posts, and deliverables in one dashboard.',
  },
  {
    icon: BarChart3,
    title: 'Agency reporting',
    description: 'Show clients performance, utilization, and campaign progress with presentation-ready reports.',
  },
  {
    icon: Users,
    title: 'Team and client roles',
    description: 'Coordinate strategists, designers, account managers, and client stakeholders without confusion.',
  },
  {
    icon: ShieldCheck,
    title: 'Controlled access',
    description: 'Protect client work with role-based permissions and a clear audit history.',
  },
]

const integrations = ['Slack', 'Figma', 'Google Drive', 'Meta Ads', 'Google Analytics']

const highlights = [
  'Built for social media agencies and client services teams',
  'Campaign, content, and approvals in one place',
  'Designed to show value to clients faster',
]

const workflowSteps = [
  {
    step: '01',
    title: 'Plan',
    text: 'Organize campaigns, content calendars, deliverables, and client ownership before work starts.',
  },
  {
    step: '02',
    title: 'Collaborate',
    text: 'Briefs, creative assets, and revisions move through team review and client approval.',
  },
  {
    step: '03',
    title: 'Prove results',
    text: 'Turn weekly activity into reports that show progress, performance, and delivered value.',
  },
]

const agencyPillars = [
  {
    icon: Megaphone,
    title: 'Content engine',
    text: 'Plan social posts, ad creatives, and client deliverables on a shared calendar.',
  },
  {
    icon: MessageSquareMore,
    title: 'Client approvals',
    text: 'Keep feedback and sign-off controlled so revisions do not live in scattered chat threads.',
  },
  {
    icon: Users,
    title: 'Account visibility',
    text: 'Give account leads and managers a clean view of workload, deadlines, and priorities.',
  },
  {
    icon: Gauge,
    title: 'Performance reporting',
    text: 'Package the week\'s work into reports clients can understand quickly.',
  },
]

const agencyStats = [
  { label: 'Campaigns managed', value: '120+' },
  { label: 'Approval steps cut', value: '40%' },
  { label: 'Client reports', value: 'Weekly' },
  { label: 'Visibility', value: 'One view' },
]

const pricingPlans = [
  {
    name: 'Starter',
    price: '$18',
    cadence: 'per user / month',
    description: 'For small agencies that need a disciplined way to manage content and approvals.',
    features: ['Campaign calendar', 'Time entry and approvals', 'Basic client reporting'],
    accent: false,
  },
  {
    name: 'Team',
    price: '$32',
    cadence: 'per user / month',
    description: 'For growing social media teams that need more visibility across accounts.',
    features: ['Everything in Starter', 'Advanced dashboards', 'Role-based permissions', 'Creative workflow controls'],
    accent: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    cadence: 'pricing',
    description: 'For multi-client agencies that need governance, rollout support, and scale.',
    features: ['SSO and admin controls', 'Workflow customization', 'Dedicated onboarding', 'Priority support'],
    accent: false,
  },
]

const galleryCards = [
  {
    title: 'Agency command center',
    subtitle: 'Clients, campaigns, and deadlines at a glance',
    image: '/dashboard-preview.webp',
    className: 'sm:col-span-2 sm:row-span-2',
    objectPosition: 'center top',
  },
  {
    title: 'Content calendar',
    subtitle: 'Plan posts, reels, and launch dates',
    image: '/dashboard-preview.webp',
    objectPosition: 'left center',
  },
  {
    title: 'Creative review',
    subtitle: 'Briefs and revisions ready for sign-off',
    image: '/dashboard-preview.webp',
    objectPosition: 'right center',
  },
  {
    title: 'Client reporting',
    subtitle: 'Translate work into results',
    image: '/dashboard-preview.webp',
    objectPosition: 'center bottom',
  },
  {
    title: 'Workflow control',
    subtitle: 'Protect high-value client work',
    accent: true,
  },
]

const Landing = () => {
  return (
    <div className="min-h-screen bg-white text-gray-900">
      {/* Header - Light variant */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <a href="/logo.svg" target="_blank" rel="noreferrer" aria-label="Open SynTask logo in a new tab">
              <img src="/logo.svg" alt="SynTask" className="h-10 w-10" />
            </a>
            <div>
              <div className="text-base font-semibold tracking-tight text-gray-900">SynTask</div>
              <div className="text-xs text-gray-500">Agency operations and delivery</div>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm text-gray-600 md:flex">
            <a href="#features" className="transition hover:text-gray-900">Features</a>
            <a href="#integrations" className="transition hover:text-gray-900">Integrations</a>
            <a href="#workflow" className="transition hover:text-gray-900">Workflow</a>
            <a href="#pricing" className="transition hover:text-gray-900">Pricing</a>
            <a href="#about" className="transition hover:text-gray-900">About</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link to="/login" className="hidden rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-400 hover:bg-gray-50 sm:inline-flex">
              Sign in
            </Link>
            <Link to="/admin-request" className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:scale-[1.01]">
              Request access
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero - Light background with subtle glowing accents */}
        <section className="relative overflow-hidden bg-white">
          <div className="absolute inset-0">
            <div className="absolute left-1/2 top-0 h-96 w-96 -translate-x-1/2 rounded-full bg-blue-200/40 blur-3xl" />
            <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-violet-200/40 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-cyan-200/30 blur-3xl" />
          </div>

          <div className="relative mx-auto grid max-w-7xl gap-16 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:pb-28 lg:pt-24">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white/80 px-4 py-2 text-sm text-gray-700 shadow-sm">
                <Sparkles className="h-4 w-4 text-violet-600" />
                Built for social media agencies that need control, clarity, and client-ready delivery
              </div>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
                Run your agency&apos;s campaigns, content, approvals, and reporting from one workspace.
              </h1>

              <p className="mt-6 max-w-xl text-base leading-7 text-gray-600 sm:text-lg">
                SynTask gives social media agencies one operating system for briefs, client feedback, scheduling, delivery, and the reporting that proves the work.
              </p>

              <ul className="mt-8 space-y-3 text-sm text-gray-700">
                {highlights.map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-gray-800">
                  Sign in to SynTask
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a href="#features" className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 px-6 py-3 font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50">
                  Explore features
                </a>
              </div>

              <div className="mt-10 grid max-w-xl grid-cols-2 gap-4 sm:grid-cols-3">
                {[
                  { label: 'Accounts', value: 'Multiple clients' },
                  { label: 'Approval flows', value: 'Creative sign-off' },
                  { label: 'Reporting', value: 'Client-ready' },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-gray-200 bg-white/60 p-4 shadow-sm">
                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">{item.label}</div>
                    <div className="mt-2 text-sm font-semibold text-gray-900">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-4 top-8 hidden rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-lg shadow-gray-200/50 backdrop-blur-sm lg:block">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Status</div>
                <div className="mt-1 text-sm font-semibold text-gray-900">Live client approvals</div>
                <div className="mt-2 text-sm text-gray-600">Keep every creative request moving without losing the audit trail.</div>
              </div>

              <a
                href="/dashboard-preview.png"
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-2xl shadow-gray-300/30"
                aria-label="Open SynTask dashboard preview in a new tab"
              >
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">SynTask dashboard</div>
                    <div className="text-xs text-gray-500">Team visibility at a glance</div>
                  </div>
                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                    Active
                  </div>
                </div>

                <div className="grid gap-0 lg:grid-cols-[0.95fr_1.05fr]">
                  <div className="space-y-4 border-b border-gray-200 p-5 lg:border-b-0 lg:border-r">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Productivity</div>
                      <div className="mt-2 text-3xl font-semibold text-gray-900">Campaign + content</div>
                      <div className="mt-2 text-sm text-gray-600">Unify creative work with delivery and approvals.</div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                      {[
                        { label: 'Approvals', value: 'Waiting for client sign-off' },
                        { label: 'Reporting', value: 'Ready for account review' },
                        { label: 'Permissions', value: 'Role-based access' },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-gray-200 bg-white/70 p-4">
                          <div className="text-xs uppercase tracking-[0.2em] text-gray-500">{item.label}</div>
                          <div className="mt-2 text-sm font-semibold text-gray-900">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    <a
                      href="/dashboard-preview.png"
                      target="_blank"
                      rel="noreferrer"
                      className="block h-full w-full"
                      aria-label="Open SynTask dashboard preview in a new tab"
                    >
                      <img
                        src="/dashboard-preview.png"
                        alt="SynTask dashboard preview"
                        className="h-full w-full rounded-[1.5rem] object-cover shadow-xl shadow-gray-300/30"
                      />
                    </a>
                  </div>
                </div>
              </a>

              <div className="absolute -bottom-5 right-4 hidden rounded-2xl border border-gray-200 bg-white/90 p-4 shadow-lg shadow-gray-200/50 backdrop-blur-sm sm:block">
                <div className="flex items-center gap-3">
                  <div className="rounded-full bg-blue-100 p-2 text-blue-700">
                    <Zap className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-[0.2em] text-gray-500">Fast setup</div>
                    <div className="text-sm font-semibold text-gray-900">Made for enterprise adoption</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Integrations bar - light */}
        <section className="border-y border-gray-200 bg-gray-50/80">
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 gap-4 text-center sm:grid-cols-5">
              {integrations.map((item) => (
                <div key={item} className="rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm font-medium text-gray-700 shadow-sm">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Gallery / Visuals - light cards */}
        <section className="mx-auto max-w-7xl px-4 pb-8 pt-14 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">Visuals</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              Five related visuals make the page feel like a real product launch.
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Agencies expect to see the product story in multiple angles, not just a single screenshot. This block acts like a mini case-study strip.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3 md:auto-rows-[180px]">
            {galleryCards.map((card) => (
              <div
                key={card.title}
                className={`relative overflow-hidden rounded-[1.75rem] border border-gray-200 bg-white shadow-lg shadow-gray-200/50 ${card.className || ''}`}
              >
                {card.image ? (
                  <a
                    href={card.image}
                    target="_blank"
                    rel="noreferrer"
                    className="block h-full w-full"
                    aria-label={`Open ${card.title} image in a new tab`}
                  >
                    <img
                      src={card.image}
                      alt={card.title}
                      className="h-full w-full object-cover"
                      style={{ objectPosition: card.objectPosition }}
                    />
                  </a>
                ) : (
                  <div className="flex h-full flex-col justify-between bg-gradient-to-br from-violet-100 via-white to-blue-100 p-5">
                    <div>
                      <div className="text-xs uppercase tracking-[0.25em] text-gray-500">Secure</div>
                      <div className="mt-2 text-2xl font-semibold text-gray-900">Role based access</div>
                      <p className="mt-3 max-w-sm text-sm leading-6 text-gray-600">
                        Keep permissions scoped so teams only see what they need.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {['Admin', 'Manager', 'Member', 'Viewer'].map((role) => (
                        <div key={role} className="rounded-2xl border border-gray-200 bg-white/80 px-3 py-2 text-sm text-gray-800">
                          {role}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {card.image && (
                  <a
                    href={card.image}
                    target="_blank"
                    rel="noreferrer"
                    className="absolute inset-x-0 bottom-0 block bg-gradient-to-t from-white via-white/85 to-transparent p-4"
                    aria-label={`Open ${card.title} details in a new tab`}
                  >
                    <div className="text-xs uppercase tracking-[0.25em] text-violet-600">Preview</div>
                    <div className="mt-1 text-lg font-semibold text-gray-900">{card.title}</div>
                    <div className="text-sm text-gray-600">{card.subtitle}</div>
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Agency proof section - light */}
        <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <div className="rounded-[1.75rem] border border-gray-200 bg-white p-8 shadow-lg">
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">Agency proof</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
                The page should feel built for a serious agency pitch.
              </h2>
              <p className="mt-4 text-base leading-7 text-gray-600">
                Social media agencies sell outcomes, speed, and trust. This section gives the landing page the extra depth that a million-dollar product usually has.
              </p>

              <div className="mt-8 grid grid-cols-2 gap-4">
                {agencyStats.map((item) => (
                  <div key={item.label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
                    <div className="text-3xl font-semibold text-gray-900">{item.value}</div>
                    <div className="mt-2 text-sm text-gray-500">{item.label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {agencyPillars.map((item) => {
                const Icon = item.icon
                return (
                  <div key={item.title} className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-lg shadow-gray-200/50">
                    <div className="inline-flex rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 p-3 text-violet-700">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-gray-900">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-gray-600">{item.text}</p>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        {/* Features - light cards */}
        <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">Features</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              Built around the work a social media agency actually does every day.
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              The page now speaks to agency buyers: campaign coordination, content calendars, revisions, approvals, client updates, and reporting.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {features.map((feature) => {
              const Icon = feature.icon
              return (
                <div key={feature.title} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-lg shadow-gray-200/50">
                  <div className="inline-flex rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 p-3 text-violet-700">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="mt-5 text-xl font-semibold text-gray-900">{feature.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-600">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* Integrations section - light */}
        <section id="integrations" className="bg-gray-50/80">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.92fr_1.08fr] lg:px-8">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">Integrations</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
                Designed to sit inside the stack agencies already use.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-gray-600">
                Social media agencies usually juggle chat, files, creative tools, and analytics. SynTask gives you a central layer that connects the work instead of replacing the tools you already trust.
              </p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {[
                  'Slack for fast team communication',
                  'Figma for creative handoff and reviews',
                  'Google Drive for shared assets and briefs',
                  'Meta Ads and analytics for performance context',
                ].map((item) => (
                  <div key={item} className="rounded-2xl border border-gray-200 bg-white/70 p-4 text-sm text-gray-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { title: 'Briefs', body: 'Keep social campaign briefs, notes, and deliverables tied to the right client.' },
                { title: 'Governance', body: 'Use role-based controls to protect client assets and approvals.' },
                { title: 'Reporting', body: 'Translate work into client-facing performance and delivery updates.' },
                { title: 'Automation', body: 'Reduce repetitive handoffs with clear workflow stages.' },
              ].map((item) => (
                <div key={item.title} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="text-lg font-semibold text-gray-900">{item.title}</div>
                  <p className="mt-3 text-sm leading-6 text-gray-600">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Workflow - light */}
        <section id="workflow" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">Workflow</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
                A bigger workflow for agencies that manage many clients at once.
              </h2>
              <p className="mt-4 max-w-xl text-base leading-7 text-gray-600">
                The workflow should feel substantial on the page. This section explains how campaigns move from brief to delivery, then into reporting and renewal conversations.
              </p>
            </div>

            <div className="grid gap-4">
              {workflowSteps.map((item) => (
                <div key={item.step} className="flex gap-4 rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-900 text-sm font-bold text-white">
                    {item.step}
                  </div>
                  <div>
                    <div className="text-lg font-semibold text-gray-900">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-gray-600">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing - light */}
        <section id="pricing" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-600">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
              Pricing that makes sense for agencies with different client loads.
            </h2>
            <p className="mt-4 text-base leading-7 text-gray-600">
              Larger sections need larger-value messaging. These plans are positioned for boutique agencies, growing teams, and multi-client operations.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {pricingPlans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-[1.75rem] border p-6 shadow-lg shadow-gray-200/50 ${
                  plan.accent
                    ? 'border-violet-400/40 bg-gradient-to-b from-violet-50 to-white'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <h3 className="text-xl font-semibold text-gray-900">{plan.name}</h3>
                  {plan.accent && (
                    <span className="rounded-full border border-violet-300 bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-800">
                      Popular
                    </span>
                  )}
                </div>

                <div className="mt-6 flex items-end gap-2">
                  <div className="text-5xl font-semibold tracking-tight text-gray-900">{plan.price}</div>
                  <div className="pb-1 text-sm text-gray-500">{plan.cadence}</div>
                </div>

                <p className="mt-4 text-sm leading-6 text-gray-600">{plan.description}</p>

                <ul className="mt-6 space-y-3 text-sm text-gray-700">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-500" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link
                  to="/admin-request"
                  className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition ${
                    plan.accent
                      ? 'bg-gray-900 text-white hover:-translate-y-0.5 hover:bg-gray-800'
                      : 'border border-gray-300 bg-white text-gray-700 hover:border-gray-400 hover:bg-gray-50'
                  }`}
                >
                  Request access
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* About / CTA - light */}
        <section id="about" className="mx-auto max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] border border-gray-200 bg-gradient-to-r from-violet-100 via-white to-blue-100 p-8 sm:p-10 lg:p-12">
            <div className="grid gap-10 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-700">About SynTask</p>
                <h2 className="mt-3 text-3xl font-semibold tracking-tight text-gray-900 sm:text-4xl">
                  Built for agencies that need to look sharp to clients and stay organized internally.
                </h2>
                <p className="mt-4 max-w-3xl text-base leading-7 text-gray-700">
                  SynTask is a social media agency operating layer for campaign delivery, creative approvals, client updates, and reporting. It should feel large, credible, and polished enough for a high-value product pitch.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row lg:flex-col">
                <Link to="/login" className="inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-6 py-3 font-semibold text-white hover:bg-gray-800">
                  Launch app
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/admin-request" className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-300 px-6 py-3 font-semibold text-gray-700 hover:border-gray-400 hover:bg-gray-50">
                  Contact admin
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer - light */}
      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8">
          <div>
            <div className="flex items-center gap-3">
              <a href="/logo.svg" target="_blank" rel="noreferrer" aria-label="Open SynTask logo in a new tab">
                <img src="/logo.svg" alt="SynTask" className="h-10 w-10" />
              </a>
              <div>
                <div className="font-semibold text-gray-900">SynTask</div>
                <div className="text-sm text-gray-500">Task management and ticketing platform</div>
              </div>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-gray-500">
              A refined front door for the product, aligned with the existing purple-blue enterprise theme and ready to expand later.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 sm:grid-cols-3">
            <a href="#features" className="transition hover:text-gray-900">Features</a>
            <a href="#integrations" className="transition hover:text-gray-900">Integrations</a>
            <a href="#workflow" className="transition hover:text-gray-900">Workflow</a>
            <Link to="/login" className="transition hover:text-gray-900">Sign in</Link>
            <Link to="/admin-request" className="transition hover:text-gray-900">Request access</Link>
            <a href="#about" className="transition hover:text-gray-900">About</a>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing