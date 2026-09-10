/* Compact SynTask-style UI previews rendered with JSX/CSS so capability cards
   on the landing page are never icon + text only. Each preview mimics a small
   slice of real product UI (people rows, kanban, pipeline, check-in, candidates,
   AI answer). Decorative: aria-hidden, pointer-events disabled. */

const MONO_COLORS = [
  'from-orange-500 to-amber-500',
  'from-emerald-500 to-teal-500',
  'from-blue-500 to-indigo-500',
  'from-purple-500 to-fuchsia-500',
  'from-rose-500 to-pink-500',
];

function Initials({ name, idx, size = 'h-5 w-5 text-[8px]' }) {
  const initials = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ${MONO_COLORS[idx % MONO_COLORS.length]} ${size}`}>
      {initials}
    </span>
  );
}

/* People Operations — employee rows with avatars + status chips */
export function PeopleOpsPreview() {
  return (
    <div aria-hidden="true" className="space-y-1.5">
      {[['Ananya Rao', 'HR Manager', 'emerald'], ['Vikram Shah', 'On leave', 'amber'], ['Meera Iyer', 'Payroll due', 'blue']].map(([name, tag, tone], i) => (
        <div key={name} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900">
          <Initials name={name} idx={i} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold text-slate-900 dark:text-white">{name}</p>
          </div>
          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${tone === 'emerald' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' : tone === 'amber' ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300'}`}>
            {tag}
          </span>
        </div>
      ))}
    </div>
  );
}

/* Work Management — three mini kanban columns */
export function WorkPreview() {
  const cols = [
    ['Todo', ['Design review', 'API draft'], 'bg-slate-200 dark:bg-slate-700'],
    ['Active', ['Mobile build', 'QA sprint'], 'bg-orange-200 dark:bg-orange-900/60'],
    ['Done', ['Launch v2', 'Docs'], 'bg-emerald-200 dark:bg-emerald-900/50'],
  ];
  return (
    <div aria-hidden="true" className="grid grid-cols-3 gap-1.5">
      {cols.map(([label, tasks, chip]) => (
        <div key={label} className="rounded-lg bg-gray-50 p-1.5 dark:bg-slate-900">
          <span className={`mb-1 block h-1 w-6 rounded-full ${chip}`} />
          <p className="text-[8px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          {tasks.map((t) => (
            <p key={t} className="mt-1 truncate rounded border border-gray-100 bg-white px-1 py-0.5 text-[8px] font-medium text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              {t}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

/* Revenue Operations — pipeline deals with value + stage chips */
export function RevenuePreview() {
  const deals = [
    ['Apex Tech', '₹4,20,000', 'Proposal', 'bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300'],
    ['Horizon Media', '₹1,80,000', 'Negotiation', 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'],
    ['Quantum Labs', '₹6,50,000', 'Won', 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'],
  ];
  return (
    <div aria-hidden="true" className="space-y-1.5">
      {deals.map(([name, value, stage, cls], i) => (
        <div key={name} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-white p-1.5 dark:border-slate-800 dark:bg-slate-900">
          <Initials name={name} idx={i + 1} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10px] font-semibold text-slate-900 dark:text-white">{name}</p>
            <p className="text-[8px] font-medium text-slate-400">{value}</p>
          </div>
          <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold ${cls}`}>{stage}</span>
        </div>
      ))}
    </div>
  );
}

/* Smart Attendance — check-in card */
export function AttendancePreview() {
  return (
    <div aria-hidden="true" className="rounded-lg border border-gray-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2">
        <Initials name="Ravi Menon" idx={2} size="h-6 w-6 text-[9px]" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold text-slate-900 dark:text-white">Ravi Menon</p>
          <p className="text-[8px] text-slate-400">Engineering</p>
        </div>
        <span className="flex items-center gap-1 text-[8px] font-bold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> On time
        </span>
      </div>
      <div className="mt-1.5 flex items-center justify-between rounded-md bg-gray-50 px-2 py-1 text-[8px] font-medium text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        <span>Check-in 9:02 AM</span>
        <span className="font-bold text-slate-700 dark:text-slate-200">● eTimeOffice synced</span>
      </div>
    </div>
  );
}

/* Recruitment — candidate stage funnel */
export function RecruitmentPreview() {
  const stages = [
    ['Applied', '24', 'bg-slate-200 dark:bg-slate-700'],
    ['Interview', '9', 'bg-blue-200 dark:bg-blue-900/60'],
    ['Offer', '3', 'bg-emerald-200 dark:bg-emerald-900/50'],
  ];
  return (
    <div aria-hidden="true" className="space-y-1.5">
      {stages.map(([label, count, chip], i) => (
        <div key={label} className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${chip}`} />
          <div className="flex-1 rounded-md bg-gray-50 px-1.5 py-1 dark:bg-slate-900">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-semibold text-slate-600 dark:text-slate-300">{label}</p>
              <p className="text-[9px] font-bold text-slate-900 dark:text-white">{count}</p>
            </div>
            <div className="mt-0.5 h-0.5 rounded-full bg-slate-200 dark:bg-slate-700">
              <div className={`h-full rounded-full ${chip}`} style={{ width: `${[100, 38, 12][i]}%` }} />
            </div>
          </div>
        </div>
      ))}
      <p className="flex items-center gap-1 text-[8px] font-medium text-slate-400">
        <Initials name="Sana K" idx={4} size="h-3.5 w-3.5 text-[6px]" /> Offer sent — join this week
      </p>
    </div>
  );
}

/* Executive AI — grounded answer with evidence chips */
export function ExecutiveAiPreview() {
  const items = [
    ['3', 'projects need attention', 'text-orange-600 dark:text-orange-400'],
    ['2', 'employees overloaded', 'text-amber-600 dark:text-amber-400'],
    ['₹4.2L', 'pipeline at risk', 'text-rose-600 dark:text-rose-400'],
  ];
  return (
    <div aria-hidden="true" className="rounded-lg border border-gray-100 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[8px] font-bold uppercase tracking-wide text-slate-400">What needs attention today?</p>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {items.map(([v, l, cls]) => (
          <div key={l} className="rounded-md bg-gray-50 p-1.5 text-center dark:bg-slate-950">
            <p className={`text-[11px] font-extrabold ${cls}`}>{v}</p>
            <p className="text-[7px] font-medium leading-tight text-slate-500 dark:text-slate-400">{l}</p>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {['Evidence: 6 sources', 'Risk view', '2 actions'].map((chip) => (
          <span key={chip} className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[7px] font-bold text-orange-600 dark:bg-orange-950/40 dark:text-orange-300">
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}