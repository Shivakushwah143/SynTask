import React from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  Hash,
  Info,
  Layers,
  ListChecks,
  ShieldAlert,
  UserSquare2,
} from 'lucide-react'
import { Badge } from '../ui'

/**
 * AnswerBlocks — renderers for the structured answer-block contract the
 * Executive/HR agents emit (see backend/app/agents/answer_blocks.py).
 *
 * Block types:
 *   count   → headline KPI card
 *   summary → label/value fact grid
 *   list    → flat record/name list
 *   table   → real table (never raw Markdown pipes)
 *   detail  → single entity field view
 *   risk    → prioritized risk cards with severity badges
 *
 * Content safety: ObjectId-looking values and empty internal ids are hidden
 * unless `showIds` is set, matching the backend redaction rules.
 */

const OBJECT_ID_RE = /\b[0-9a-f]{24}\b/g
const stripIds = (value) => (typeof value === 'string' ? value.replace(OBJECT_ID_RE, '') : value)

/** Friendly human labels for internal tool names (never shown raw). */
export const TOOL_LABELS = {
  get_company_summary: 'Company records',
  get_company_attention_summary: 'Attention items',
  list_overdue_tasks: 'Overdue tasks',
  list_tasks: 'Tasks',
  get_user_tasks: 'Assigned tasks',
  get_user_task_activity: 'Task activity',
  get_task_detail: 'Task details',
  search_projects: 'Projects',
  get_project_360: 'Project records',
  get_project_risks: 'Project risks',
  search_clients: 'Clients',
  get_client_360: 'Client records',
  get_client_risks: 'Client risks',
  search_employees: 'Employees',
  get_employee_360: 'Employee records',
  get_team_workload: 'Team workload',
  search_leads: 'Sales leads',
  get_lead_360: 'Lead records',
  get_sales_summary: 'Sales summary',
  get_followup_risks: 'Follow-up risks',
  get_finance_summary: 'Finance summary',
  list_invoices: 'Invoices',
  get_invoice_detail: 'Invoice details',
  get_overdue_invoices: 'Overdue invoices',
  get_meeting_summary: 'Meetings',
  get_meeting_detail: 'Meeting details',
  search_candidates: 'Candidates',
  get_candidate_360: 'Candidate records',
  search_jobs: 'Job openings',
  get_job_360: 'Job records',
  list_crm_deals: 'CRM deals',
  get_crm_deal_360: 'CRM deal records',
  list_sprints: 'Sprints',
  list_epics: 'Epics',
}

export const friendlyToolLabel = (toolName) => {
  if (!toolName) return 'Company data'
  return TOOL_LABELS[toolName] || String(toolName)
    .replace(/^(get_|list_|search_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

const BLOCK_ICONS = {
  count: Hash,
  summary: BarChart3,
  list: ListChecks,
  table: ClipboardList,
  detail: UserSquare2,
  risk: ShieldAlert,
}

/** Severity → Badge colorKey mapping for risk blocks. */
export const severityColorKey = (priority) => {
  const value = String(priority || 'info').toLowerCase()
  if (value.includes('critical') || value === 'high') return 'critical'
  if (value === 'medium' || value === 'warning') return 'medium'
  if (value === 'low' || value === 'healthy' || value === 'ok') return 'low'
  if (value === 'info' || value === 'none') return 'draft'
  return value
}

const BlockShell = ({ type, title, icon, children }) => {
  const Icon = icon || BLOCK_ICONS[type] || Info
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-950/70">
      <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-gray-800/80">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary-50 text-primary-600 dark:bg-primary-950/50 dark:text-primary-300">
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
          {stripIds(title) || 'Result'}
        </span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

const CountBlock = ({ block }) => (
  <BlockShell type="count" title={block.title}>
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="text-4xl font-semibold tracking-tight text-gray-950 dark:text-gray-50" data-testid="block-count-value">
          {block.value ?? 0}
        </div>
        {block.subtitle ? (
          <div className="mt-1.5 truncate text-sm text-gray-500 dark:text-gray-400" data-testid="block-count-subtitle">{stripIds(block.subtitle)}</div>
        ) : null}
      </div>
      <CheckCircle2 className="h-6 w-6 shrink-0 text-primary-400 dark:text-primary-500" aria-hidden="true" />
    </div>
  </BlockShell>
)

const SummaryBlock = ({ block }) => (
  <BlockShell type="summary" title={block.title}>
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {(block.facts || []).map((fact, index) => (
        <div key={`fact-${index}`} className="rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-900/60" data-testid="block-summary-fact">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">
            {stripIds(fact.label || '')}
          </dt>
          <dd className="mt-1 text-lg font-semibold text-gray-900 dark:text-gray-100">{stripIds(fact.value)}</dd>
        </div>
      ))}
    </dl>
  </BlockShell>
)

const renderListItem = (item, index) => {
  if (item && typeof item === 'object') {
    const entries = Object.entries(item).filter(([key, value]) => value !== '' && value !== null && value !== undefined)
    return (
      <div key={`list-item-${index}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-xl bg-gray-50 px-3 py-2 dark:bg-gray-900/60" data-testid="block-list-item">
        {entries.map(([label, value]) => (
          <React.Fragment key={label}>
            {label && <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">{stripIds(label)}</span>}
            <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{stripIds(String(value))}</span>
          </React.Fragment>
        ))}
      </div>
    )
  }
  return (
    <div key={`list-item-${index}`} className="rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-800 dark:bg-gray-900/60 dark:text-gray-100" data-testid="block-list-item">
      {stripIds(String(item))}
    </div>
  )
}

const ListBlock = ({ block }) => (
  <BlockShell type="list" title={block.title}>
    {block.items?.length ? (
      <ul className="space-y-1.5">
        {(block.items || []).map((item, index) => renderListItem(item, index))}
      </ul>
    ) : (
      <EmptyBlockNote />
    )}
  </BlockShell>
)

const TableBlock = ({ block }) => {
  const columns = block.columns || []
  const rows = block.rows || []
  return (
    <BlockShell type="table" title={block.title}>
      {rows.length ? (
        <div className="overflow-x-auto" data-testid="block-table">
          <table className="w-full min-w-[420px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                {columns.map((column, c) => (
                  <th key={c} className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                    {stripIds(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800/60 dark:hover:bg-gray-900/40">
                  {columns.map((column, c) => (
                    <td key={c} className="px-3 py-2 align-top text-gray-700 dark:text-gray-200">
                      {renderCellValue(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyBlockNote />
      )}
    </BlockShell>
  )
}

/** A status-like table cell becomes a colored badge; anything else is text. */
const renderCellValue = (value) => {
  const stripped = stripIds(value)
  const normalized = String(stripped ?? '').toLowerCase()
  const statusLike = /^(active|completed|pending|overdue|due|won|lost|open|closed|on_hold|on hold|in_progress|in progress|scheduled|cancelled|canceled|approved|rejected|new|high|medium|low|critical|healthy|extended|draft|paid|unpaid|sent|late)$/
  if (typeof stripped === 'string' && statusLike.test(normalized)) {
    const colorKey = normalized === 'overdue' || normalized === 'late' ? 'overdue'
      : normalized === 'paid' || normalized === 'sent' ? 'completed'
        : normalized
    return <Badge label={String(stripped).replace(/_/g, ' ')} colorKey={colorKey} pill />
  }
  if (stripped === null || stripped === undefined || stripped === '') return <span className="text-gray-400 dark:text-gray-600">—</span>
  return <span>{stripped}</span>
}

const DetailBlock = ({ block }) => (
  <BlockShell type="detail" title={block.title}>
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2" data-testid="block-detail">
      {(block.fields || []).map((field, index) => (
        <div key={`field-${index}`} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">{stripIds(field.label || '')}</dt>
          <dd className="mt-0.5 truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={stripIds(field.value)}>
            {renderCellValue(field.value)}
          </dd>
        </div>
      ))}
    </dl>
  </BlockShell>
)

const RiskBlock = ({ block }) => {
  const items = block.items || []
  const highest = items[0]?.priority
  const Icon = highest && /high|critical/i.test(String(highest)) ? AlertTriangle : highest ? Info : Layers
  return (
    <BlockShell type="risk" title={block.title} icon={Icon}>
      {items.length ? (
        <ul className="space-y-2.5">
          {items.map((item, index) => (
            <li key={`risk-${index}`} className="rounded-xl border border-gray-100 bg-gray-50/70 p-3.5 dark:border-gray-800 dark:bg-gray-900/50" data-testid="block-risk-item">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-50">{stripIds(item.title || 'Attention item')}</span>
                <Badge label={String(item.priority || 'info').replace(/_/g, ' ')} colorKey={severityColorKey(item.priority)} pill />
              </div>
              {item.detail ? <p className="mt-1.5 text-sm leading-5 text-gray-600 dark:text-gray-300">{stripIds(item.detail)}</p> : null}
              {item.action ? (
                <div className="mt-2 flex items-center gap-1.5 text-sm text-primary-600 dark:text-primary-300">
                  <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="font-medium">{stripIds(item.action)}</span>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyBlockNote />
      )}
    </BlockShell>
  )
}

const EmptyBlockNote = () => (
  <p className="text-sm text-gray-500 dark:text-gray-400">No records to show.</p>
)

const RENDERERS = {
  count: CountBlock,
  summary: SummaryBlock,
  list: ListBlock,
  table: TableBlock,
  detail: DetailBlock,
  risk: RiskBlock,
}

export function AnswerBlock({ block, showIds = false }) {
  if (!block || !block.type) return null
  const Renderer = RENDERERS[block.type]
  if (!Renderer) return null
  return <Renderer block={block} showIds={showIds} />
}

export default function AnswerBlocks({ blocks, showIds = false, className = '' }) {
  if (!Array.isArray(blocks) || !blocks.length) return null
  return (
    <div className={`space-y-3 ${className}`} data-testid="answer-blocks">
      {blocks.map((block, index) => (
        <AnswerBlock key={`${block.type}-${block.title || index}-${index}`} block={block} showIds={showIds} />
      ))}
    </div>
  )
}
