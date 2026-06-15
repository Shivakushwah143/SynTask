import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { addDays, endOfMonth, format, isSameDay, startOfMonth, startOfWeek } from 'date-fns'
import { Calendar as CalendarIcon } from 'lucide-react'
import { calendarApi } from '../api/calendar'
import { Badge, EmptyState, PageHeader, Skeleton, SkeletonCard } from '../components/ui'
import { asArray, formatDateTime } from './phase4Utils'

export default function Calendar() {
  const [selected, setSelected] = useState(new Date())
  const [month] = useState(new Date())
  const { data, isLoading, isError } = useQuery(['calendar-events', format(month, 'yyyy-MM')], () => calendarApi.getEvents({ month: format(month, 'yyyy-MM') }))
  const events = asArray(data, ['events'])
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfMonth(month)
    const list = []
    for (let day = start; day <= addDays(end, 7); day = addDays(day, 1)) list.push(day)
    return list.slice(0, 42)
  }, [month])
  const selectedEvents = events.filter((event) => isSameDay(new Date(event.date || event.start || event.due_date || event.meeting_date), selected))

  return (
    <div className="p-6">
      <PageHeader title="Calendar" description="Tasks, meetings, and timesheet events by day." />
      {isLoading ? <CalendarSkeleton /> : isError ? <EmptyState icon={CalendarIcon} title="Could not load calendar" /> : (
        <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
          <div className="rounded-lg border border-gray-200 bg-white">
            <div className="grid grid-cols-7 border-b bg-gray-50 text-xs font-semibold uppercase text-gray-500">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="p-3">{day}</div>)}</div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayEvents = events.filter((event) => isSameDay(new Date(event.date || event.start || event.due_date || event.meeting_date), day))
                return <button key={day.toISOString()} onClick={() => setSelected(day)} className={`min-h-28 border-b border-r p-2 text-left hover:bg-gray-50 ${isSameDay(day, selected) ? 'bg-primary-50' : ''}`}><span className="text-sm font-medium">{format(day, 'd')}</span><div className="mt-2 space-y-1">{dayEvents.slice(0, 3).map((event, index) => <div key={index} className="truncate rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">{event.title || event.name || event.type || 'Event'}</div>)}{dayEvents.length > 3 ? <span className="text-xs text-gray-500">+{dayEvents.length - 3} more</span> : null}</div></button>
              })}
            </div>
          </div>
          <aside className="rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="font-semibold text-gray-900">{format(selected, 'PPP')}</h2>
            <div className="mt-4 space-y-3">{selectedEvents.length ? selectedEvents.map((event, index) => <div key={index} className="rounded-lg border p-3"><p className="font-medium">{event.title || event.name || 'Event'}</p><p className="mt-1 text-xs text-gray-500">{formatDateTime(event.date || event.start || event.due_date || event.meeting_date)}</p><Badge label={event.type || event.status || 'event'} /></div>) : <p className="text-sm text-gray-500">No events for this day.</p>}</div>
          </aside>
        </div>
      )}
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]" role="status" aria-label="Loading calendar">
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="grid grid-cols-7 border-b bg-gray-50 p-3">
          {Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-4 w-10" />)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, index) => (
            <div key={index} className="min-h-28 border-b border-r p-2">
              <Skeleton className="mb-3 h-4 w-6" />
              <Skeleton className="mb-2 h-5 w-full" />
              <Skeleton className="h-5 w-2/3" />
            </div>
          ))}
        </div>
      </div>
      <SkeletonCard lines={5} />
    </div>
  )
}
