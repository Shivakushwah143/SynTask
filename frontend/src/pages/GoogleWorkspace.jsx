import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from 'react-query'
import { format, isAfter, parseISO } from 'date-fns'
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Mail,
  MailPlus,
  MapPinned,
  RefreshCw,
  Send,
  Settings,
  Star,
  Video,
  CalendarPlus,
  ChevronRight,
  AlertCircle,
  Database,
  ShieldCheck,
  UserCircle2,
  Globe,
  LayoutGrid,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { googleWorkspaceApi } from '../api/googleWorkspace'
import { tasksAPI } from '../api/tasks'
import { useAuthStore } from '../store/authStore'
import { Badge, Button, EmptyState, Modal, PageHeader, SkeletonCard, inputClassName } from '../components/ui'

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutGrid },
  { id: 'gmail', label: 'Gmail', icon: Mail },
  { id: 'calendar', label: 'Google Calendar', icon: CalendarDays },
  { id: 'meet', label: 'Google Meet', icon: Video },
  { id: 'settings', label: 'Workspace Settings', icon: Settings },
]

const FOLDERS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'starred', label: 'Starred' },
]

const VIEW_MODES = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'day', label: 'Day' },
]

function Section({ title, description, action, children }) {
  return (
    <section className="rounded-3xl border border-gray-200/80 bg-white/90 shadow-sm backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          {description ? <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p> : null}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function StatusPill({ connected, status }) {
  return (
    <Badge
      label={connected ? status || 'Connected' : status || 'Disconnected'}
      colorKey={connected ? 'approved' : 'cancelled'}
    />
  )
}

function WorkspaceSkeleton() {
  return (
    <div className="space-y-4">
      <SkeletonCard lines={2} actions />
      <div className="grid gap-4 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={4} />
      </div>
    </div>
  )
}

function ComposerModal({ isOpen, onClose, onSend, onSaveDraft, initialFolder = 'inbox' }) {
  const [form, setForm] = useState({ to: '', subject: '', html: '', text: '', folder: initialFolder })
  const [sending, setSending] = useState(false)

  const submit = async (mode = 'send') => {
    const payload = {
      to: form.to.split(',').map((email) => ({ email: email.trim(), name: '' })).filter((item) => item.email),
      subject: form.subject,
      html: form.html,
      text: form.text,
      draft: mode === 'draft',
    }
    setSending(true)
    try {
      if (mode === 'draft') {
        await onSaveDraft(payload)
      } else {
        await onSend(payload)
      }
      onClose()
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Compose email" description="Use the existing Google Workspace connection and SynTask email automation.">
      <div className="space-y-4">
        <input className={inputClassName} placeholder="To: email1@company.com, email2@company.com" value={form.to} onChange={(event) => setForm((state) => ({ ...state, to: event.target.value }))} />
        <input className={inputClassName} placeholder="Subject" value={form.subject} onChange={(event) => setForm((state) => ({ ...state, subject: event.target.value }))} />
        <textarea className={`${inputClassName} min-h-40`} placeholder="HTML body" value={form.html} onChange={(event) => setForm((state) => ({ ...state, html: event.target.value }))} />
        <textarea className={`${inputClassName} min-h-28`} placeholder="Plain text body" value={form.text} onChange={(event) => setForm((state) => ({ ...state, text: event.target.value }))} />
        <div className="flex flex-wrap gap-2">
          <Button loading={sending} onClick={() => submit('send')}>
            <Send className="h-4 w-4" /> Send
          </Button>
          <Button variant="secondary" loading={sending} onClick={() => submit('draft')}>
            Save draft
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export default function GoogleWorkspacePage() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [activeTab, setActiveTab] = useState('dashboard')
  const [folder, setFolder] = useState('inbox')
  const [gmailQuery, setGmailQuery] = useState('')
  const [calendarView, setCalendarView] = useState('month')
  const [composerOpen, setComposerOpen] = useState(false)

  const dashboardQuery = useQuery(['google-workspace-dashboard'], async () => (await googleWorkspaceApi.getDashboard()).data, {
    staleTime: 30_000,
  })
  const connectionQuery = useQuery(['google-workspace-connection'], async () => (await googleWorkspaceApi.getConnection()).data, {
    staleTime: 30_000,
  })
  const gmailQueryResult = useQuery(['google-workspace-gmail', folder, gmailQuery], async () => (await googleWorkspaceApi.listGmail({ folder, query: gmailQuery, page: 1, page_size: 20 })).data, {
    keepPreviousData: true,
    staleTime: 20_000,
  })
  const calendarQuery = useQuery(['google-workspace-calendar', calendarView], async () => (await googleWorkspaceApi.getCalendar({ view: calendarView })).data, {
    staleTime: 20_000,
  })
  const settingsQuery = useQuery(['google-workspace-settings'], async () => (await googleWorkspaceApi.getSettings()).data, {
    staleTime: 30_000,
  })

  const dashboard = dashboardQuery.data || {}
  const account = dashboard.account || connectionQuery.data || {}
  const gmailItems = gmailQueryResult.data?.items || []
  const calendar = calendarQuery.data || {}
  const connection = settingsQuery.data?.connection || connectionQuery.data || {}
  const diagnostics = settingsQuery.data?.diagnostics || {}

  const stats = useMemo(() => ({
    todayEvents: (dashboard.today_events || []).length,
    upcomingMeetings: (dashboard.upcoming_meetings || []).length,
    gmailActivity: (dashboard.gmail_activity || []).length,
    driveFiles: (dashboard.drive_files || []).length,
  }), [dashboard])

  const refreshAll = async () => {
    await Promise.all([
      dashboardQuery.refetch(),
      connectionQuery.refetch(),
      gmailQueryResult.refetch(),
      calendarQuery.refetch(),
      settingsQuery.refetch(),
    ])
    toast.success('Google Workspace refreshed')
  }

  const createCalendarEventFromTask = async (taskId) => {
    await googleWorkspaceApi.createEventFromTask(taskId)
    await Promise.all([calendarQuery.refetch(), dashboardQuery.refetch()])
    toast.success('Calendar event created from task')
  }

  const createTaskFromEvent = async (eventId) => {
    await googleWorkspaceApi.createTaskFromEvent(eventId)
    await Promise.all([calendarQuery.refetch(), dashboardQuery.refetch()])
    toast.success('Task created from event')
  }

  const sendMail = async (payload) => {
    await googleWorkspaceApi.sendMail(payload)
    await Promise.all([gmailQueryResult.refetch(), dashboardQuery.refetch()])
    toast.success('Email sent')
  }

  const saveDraft = async (payload) => {
    await googleWorkspaceApi.saveDraft(payload)
    await Promise.all([gmailQueryResult.refetch(), dashboardQuery.refetch()])
    toast.success('Draft saved')
  }

  const reconnect = async () => {
    await googleWorkspaceApi.reconnect({
      account_name: account.name || user?.first_name,
      account_email: account.email || user?.email,
      account_avatar: account.avatar || user?.avatar,
      granted_scopes: connection.granted_scopes || [],
    })
    await settingsQuery.refetch()
    toast.success('Google Workspace connection updated')
  }

  const disconnect = async () => {
    await googleWorkspaceApi.disconnect()
    await settingsQuery.refetch()
    toast.success('Google Workspace disconnected')
  }

  const refreshTokens = async () => {
    await googleWorkspaceApi.refreshTokens()
    await settingsQuery.refetch()
    toast.success('Google tokens refreshed')
  }

  const pageHeaderActions = (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={refreshAll}>
        <RefreshCw className="h-4 w-4" /> Refresh
      </Button>
      <Button onClick={() => setComposerOpen(true)}>
        <MailPlus className="h-4 w-4" /> Compose
      </Button>
    </div>
  )

  const renderDashboard = () => (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Today\'s events', stats.todayEvents, CalendarDays],
          ['Meetings', stats.upcomingMeetings, Video],
          ['Mail items', stats.gmailActivity, Mail],
          ['Drive files', stats.driveFiles, FolderOpen],
        ].map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/60">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
              <Icon className="h-4 w-4 text-gray-400" />
            </div>
            <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-gray-50">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Connected account" description="Reuses the existing Google identity and stored Workspace credentials.">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800">
              {account.avatar ? <img src={account.avatar} alt={account.name || 'Google account'} className="h-full w-full object-cover" /> : <UserCircle2 className="h-8 w-8 text-gray-400" />}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{account.name || 'Connected Google account'}</h3>
                <StatusPill connected={account.connected !== false} status={account.status} />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">{account.email || user?.email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Last sync: {account.last_sync_at ? format(parseISO(account.last_sync_at), 'PP p') : 'No sync data yet'}</p>
            </div>
          </div>
        </Section>

        <Section title="Quick actions" description="Native workspace actions that map to Google mail, calendar, tasks, and meetings.">
          <div className="grid gap-3 sm:grid-cols-2">
            {(dashboard.quick_actions || []).map((action) => (
              <button key={action.id} type="button" onClick={() => {
                if (action.id === 'compose') setComposerOpen(true)
                if (action.id === 'sync') void refreshAll()
              }} className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 text-left transition hover:border-primary-300 hover:bg-primary-50/60 dark:border-gray-800 dark:hover:border-primary-800 dark:hover:bg-primary-950/20">
                <div>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{action.label}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">SynTask-native action</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Today\'s calendar" description="Events pulled from the Google Workspace calendar surface.">
          <div className="space-y-3">
            {(dashboard.today_events || []).length ? dashboard.today_events.map((event) => (
              <div key={event.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <p className="font-medium text-gray-900 dark:text-gray-100">{event.title}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{format(parseISO(event.start_at), 'p')} - {format(parseISO(event.end_at), 'p')}</p>
              </div>
            )) : <EmptyState icon={CalendarDays} title="No events today" description="Your synced Google Calendar events will appear here." />}
          </div>
        </Section>

        <Section title="Upcoming meetings" description="Meetings stay tied to SynTask projects, tasks, and people.">
          <div className="space-y-3">
            {(dashboard.upcoming_meetings || []).length ? dashboard.upcoming_meetings.map((meeting) => (
              <div key={meeting.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <p className="font-medium text-gray-900 dark:text-gray-100">{meeting.title}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{meeting.meeting_date ? format(parseISO(meeting.meeting_date), 'PP') : 'No date'} · {meeting.meeting_time}</p>
                {meeting.zoom_meeting_url ? <a className="mt-2 inline-flex items-center gap-2 text-sm text-primary-600 hover:underline" href={meeting.zoom_meeting_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Open link</a> : null}
              </div>
            )) : <EmptyState icon={Video} title="No meetings yet" description="Schedule meetings from Calendar or tasks to see them here." />}
          </div>
        </Section>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Recent Gmail activity" description="Stored email activity with pagination, drafts, and search support.">
          <div className="space-y-3">
            {(dashboard.gmail_activity || []).length ? dashboard.gmail_activity.slice(0, 4).map((mail) => (
              <div key={mail.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{mail.subject}</p>
                  <Badge label={mail.folder} colorKey={mail.is_draft ? 'draft' : 'approved'} />
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{mail.preview || 'No preview available'}</p>
              </div>
            )) : <EmptyState icon={Mail} title="No Gmail activity" description="Send or sync emails to see activity here." />}
          </div>
        </Section>

        <Section title="Recent Drive files" description="Drive attachments and task-linked files appear here.">
          <div className="space-y-3">
            {(dashboard.drive_files || []).length ? dashboard.drive_files.map((file) => (
              <div key={`${file.title}-${file.task_id}`} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <p className="font-medium text-gray-900 dark:text-gray-100">{file.title}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{file.source}</p>
              </div>
            )) : <EmptyState icon={FolderOpen} title="No Drive files" description="Attach Drive-linked files to tasks, meetings, or mail." />}
          </div>
        </Section>
      </div>
    </div>
  )

  const renderGmail = () => (
    <div className="space-y-4">
      <Section title="Gmail" description="Search, draft, reply, and send mail while staying inside SynTask.">
        <div className="flex flex-wrap gap-2">
          {FOLDERS.map((item) => (
            <Button key={item.id} variant={folder === item.id ? 'primary' : 'secondary'} onClick={() => setFolder(item.id)}>
              {item.label}
            </Button>
          ))}
          <div className="ml-auto flex min-w-[260px] flex-1 gap-2">
            <input className={`${inputClassName} flex-1`} placeholder="Search Gmail" value={gmailQuery} onChange={(event) => setGmailQuery(event.target.value)} />
            <Button variant="secondary" onClick={() => setComposerOpen(true)}>
              <MailPlus className="h-4 w-4" /> New
            </Button>
          </div>
        </div>
      </Section>
      <div className="space-y-3">
        {gmailQueryResult.isLoading ? <WorkspaceSkeleton /> : gmailItems.length ? gmailItems.map((mail) => (
          <article key={mail.id} className="rounded-3xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900 dark:text-gray-100">{mail.subject}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{mail.from_name || mail.from_email || 'Unknown sender'}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={async () => { await googleWorkspaceApi.toggleStar(mail.id, !mail.is_starred); await gmailQueryResult.refetch(); }}>
                  <Star className={`h-4 w-4 ${mail.is_starred ? 'fill-amber-400 text-amber-400' : ''}`} />
                </Button>
                <Badge label={mail.folder} colorKey={mail.is_draft ? 'draft' : 'approved'} />
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-gray-600 dark:text-gray-300">{mail.preview || mail.text_body || 'No preview available.'}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setComposerOpen(true)}><Mail className="h-4 w-4" /> Reply</Button>
              <Button variant="secondary" size="sm" onClick={() => setComposerOpen(true)}><Send className="h-4 w-4" /> Reply all</Button>
            </div>
          </article>
        )) : <EmptyState icon={Mail} title="No emails found" description="Try a different folder or search term." />}
      </div>
    </div>
  )

  const renderCalendar = () => (
    <div className="space-y-4">
      <Section title="Google Calendar" description="Month, week, and day views with SynTask task synchronization.">
        <div className="flex flex-wrap gap-2">
          {VIEW_MODES.map((item) => (
            <Button key={item.id} variant={calendarView === item.id ? 'primary' : 'secondary'} onClick={() => setCalendarView(item.id)}>{item.label}</Button>
          ))}
        </div>
      </Section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Events" description="Drag-and-drop rescheduling is represented through editable SynTask event cards.">
          <div className="space-y-3">
            {(calendar.events || []).length ? calendar.events.map((event) => (
              <div key={event.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <p className="font-medium text-gray-900 dark:text-gray-100">{event.title}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{format(parseISO(event.start_at), 'PP p')} - {format(parseISO(event.end_at), 'p')}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => createTaskFromEvent(event.id)}><CheckCircle2 className="h-4 w-4" /> Create task</Button>
                  {event.task_id ? <Badge label="Linked to task" colorKey="approved" /> : null}
                </div>
              </div>
            )) : <EmptyState icon={CalendarDays} title="No calendar events" description="Create events or sync them from tasks." />}
          </div>
        </Section>
        <Section title="Task deadlines" description="Create calendar events from task due dates and keep reminders aligned.">
          <div className="space-y-3">
            {(calendar.task_deadlines || []).length ? calendar.task_deadlines.map((task) => (
              <div key={task.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
                <p className="font-medium text-gray-900 dark:text-gray-100">{task.title}</p>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Due: {task.due_date ? format(parseISO(task.due_date), 'PP p') : 'Not scheduled'}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => createCalendarEventFromTask(task.id)}><CalendarPlus className="h-4 w-4" /> Create event</Button>
                  <Badge label={task.priority} colorKey={task.priority} />
                </div>
              </div>
            )) : <EmptyState icon={Clock3} title="No task deadlines" description="Add due dates in SynTask tasks to sync them into Calendar." />}
          </div>
        </Section>
      </div>
    </div>
  )

  const renderMeet = () => (
    <Section title="Google Meet" description="Create and attach meetings to tasks and projects without leaving SynTask.">
      <div className="space-y-3">
        <Button onClick={async () => {
          await googleWorkspaceApi.createMeet({ title: 'SynTask meeting', duration: 30 })
          await Promise.all([dashboardQuery.refetch(), settingsQuery.refetch()])
          toast.success('Meet link created')
        }}><Video className="h-4 w-4" /> Create Meet link</Button>
        {(dashboard.upcoming_meetings || []).length ? dashboard.upcoming_meetings.map((meeting) => (
          <div key={meeting.id} className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
            <p className="font-medium text-gray-900 dark:text-gray-100">{meeting.title}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {meeting.zoom_meeting_url ? <Button variant="secondary" size="sm" onClick={async () => { await navigator.clipboard.writeText(meeting.zoom_meeting_url); toast.success('Link copied') }}><Copy className="h-4 w-4" /> Copy link</Button> : null}
              {meeting.zoom_meeting_url ? <a className="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-sm text-gray-700 hover:border-primary-300 hover:text-primary-700 dark:border-gray-800 dark:text-gray-300" href={meeting.zoom_meeting_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /> Join meeting</a> : null}
            </div>
          </div>
        )) : <EmptyState icon={Video} title="No meetings yet" description="Generate a Meet link or schedule one from Calendar." />}
      </div>
    </Section>
  )

  const renderSettings = () => (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Workspace settings" description="Manage the connected Google account and token health.">
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">{connection.account_name || account.name || 'Google account'}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{connection.account_email || account.email || user?.email}</p>
              </div>
              <StatusPill connected={connection.connected !== false} status={connection.last_connection_status} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={reconnect}><ShieldCheck className="h-4 w-4" /> Reconnect</Button>
              <Button variant="secondary" onClick={refreshTokens}><RefreshCw className="h-4 w-4" /> Refresh tokens</Button>
              <Button variant="danger" onClick={disconnect}>Disconnect</Button>
            </div>
          </div>
          <div className="rounded-2xl border border-gray-200 p-4 dark:border-gray-800">
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Granted permissions</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(connection.granted_scopes || diagnostics.scopes || []).map((scope) => <Badge key={scope} label={scope.split('/').pop()} colorKey="new" />)}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Connection diagnostics" description="Connection health, token flags, and scope visibility.">
        <div className="space-y-3">
          {[
            ['Connected', diagnostics.connected ? 'Yes' : 'No'],
            ['Refresh token', diagnostics.has_refresh_token ? 'Available' : 'Missing'],
            ['Access token', diagnostics.has_access_token ? 'Available' : 'Missing'],
            ['Google client', diagnostics.google_client_configured ? 'Configured' : 'Missing'],
            ['Client secret', diagnostics.google_client_secret_configured ? 'Configured' : 'Missing'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 dark:border-gray-800">
              <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{value}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )

  const activeContent = {
    dashboard: renderDashboard(),
    gmail: renderGmail(),
    calendar: renderCalendar(),
    meet: renderMeet(),
    settings: renderSettings(),
  }[activeTab]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="rounded-[2rem] border border-gray-200/80 bg-gradient-to-br from-white via-slate-50 to-primary-50 p-5 shadow-sm dark:border-gray-800 dark:from-gray-950 dark:via-gray-950 dark:to-primary-950/20 md:p-7">
        <PageHeader
          title="Google Workspace"
          description="A native SynTask workspace for Gmail, Calendar, Meet, and account management."
          actions={pageHeaderActions}
        />
        <div className="mt-5 flex flex-wrap gap-2">
          {TABS.map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${active ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-950' : 'bg-white/80 text-gray-600 hover:bg-white dark:bg-gray-900/70 dark:text-gray-300 dark:hover:bg-gray-800'}`}>
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {dashboardQuery.isLoading || settingsQuery.isLoading ? <WorkspaceSkeleton /> : activeContent}

      <ComposerModal isOpen={composerOpen} onClose={() => setComposerOpen(false)} onSend={sendMail} onSaveDraft={saveDraft} />
    </div>
  )
}