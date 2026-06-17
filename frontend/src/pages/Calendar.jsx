import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'
import { addDays, addMonths, endOfMonth, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
import { calendarApi } from '../api/calendar'
import { Badge, Button, EmptyState, PageHeader, Skeleton, SkeletonCard } from '../components/ui'
import { asArray, formatDateTime } from './phase4Utils'

export default function Calendar() {
  const [selected, setSelected] = useState(new Date())
  const [month, setMonth] = useState(new Date())
  const { data, isLoading, isError } = useQuery(['calendar-events', format(month, 'yyyy-MM')], () => calendarApi.getEvents({ month: format(month, 'yyyy-MM') }))
  const events = asArray(data, ['events'])
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const end = endOfMonth(month)
    const list = []
    for (let day = start; day <= addDays(end, 7); day = addDays(day, 1)) list.push(day)
    return list.slice(0, 42)
  }, [month])
  const getEventDate = (event) => new Date(event.date || event.start || event.due_date || event.meeting_date)
  const selectedEvents = events.filter((event) => isSameDay(getEventDate(event), selected))
  const monthLabel = format(month, 'MMMM yyyy')

  return (
    <div className="p-4 sm:p-6">
      <PageHeader
        title="Calendar"
        description="Tasks, meetings, and timesheet events by day."
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-32 text-center text-sm font-semibold text-gray-800 dark:text-gray-100">{monthLabel}</div>
            <Button variant="secondary" size="sm" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => {
              const today = new Date()
              setMonth(today)
              setSelected(today)
            }}>
              Today
            </Button>
          </div>
        )}
      />
      {isLoading ? <CalendarSkeleton /> : isError ? <EmptyState icon={CalendarIcon} title="Could not load calendar" /> : (
        <div className="grid gap-6 xl:grid-cols-[1fr_20rem]">
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
            <div className="grid grid-cols-7 border-b bg-gray-50 text-xs font-semibold uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-400">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div key={day} className="p-2 text-center sm:p-3 sm:text-left">{day}</div>)}</div>
            <div className="grid grid-cols-7">
              {days.map((day) => {
                const dayEvents = events.filter((event) => isSameDay(getEventDate(event), day))
                const selectedDay = isSameDay(day, selected)
                const outsideMonth = !isSameMonth(day, month)
                return (
                  <button
                    key={day.toISOString()}
                    type="button"
                    onClick={() => setSelected(day)}
                    className={`min-h-24 border-b border-r border-gray-200 p-2 text-left transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800 sm:min-h-28 ${selectedDay ? 'bg-primary-50 ring-2 ring-inset ring-primary-500 dark:bg-primary-950/40' : ''} ${outsideMonth ? 'bg-gray-50/60 text-gray-400 dark:bg-gray-950/60 dark:text-gray-600' : 'text-gray-900 dark:text-gray-100'}`}
                    aria-pressed={selectedDay}
                    aria-label={`${format(day, 'PPP')}, ${dayEvents.length} events`}
                  >
                    <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full text-sm font-medium ${isToday(day) ? 'bg-primary-600 px-1.5 text-white' : ''}`}>
                      {format(day, 'd')}
                    </span>
                    <div className="mt-2 space-y-1">
                      {dayEvents.slice(0, 3).map((event, index) => (
                        <div key={index} className="truncate rounded bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                          {event.title || event.name || event.type || 'Event'}
                        </div>
                      ))}
                      {dayEvents.length > 3 ? <span className="text-xs text-gray-500 dark:text-gray-400">+{dayEvents.length - 3} more</span> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
          <aside className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold text-gray-900 dark:text-gray-100">{format(selected, 'PPP')}</h2>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{selectedEvents.length} scheduled item{selectedEvents.length === 1 ? '' : 's'}</p>
              </div>
              {isToday(selected) ? <Badge label="Today" colorKey="scheduled" /> : null}
            </div>
            <div className="mt-4 space-y-3">
              {selectedEvents.length ? selectedEvents.map((event, index) => (
                <div key={index} className="rounded-lg border border-gray-200 p-3 dark:border-gray-800">
                  <p className="font-medium text-gray-900 dark:text-gray-100">{event.title || event.name || 'Event'}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{formatDateTime(event.date || event.start || event.due_date || event.meeting_date)}</p>
                  <div className="mt-3"><Badge label={event.type || event.status || 'event'} /></div>
                </div>
              )) : (
                <EmptyState
                  icon={CalendarIcon}
                  title="No events"
                  description="Pick another day or return to today to review upcoming work."
                  action={<Button variant="secondary" size="sm" onClick={() => setSelected(new Date())}>Go to today</Button>}
                />
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}

function CalendarSkeleton() {
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_20rem]" role="status" aria-label="Loading calendar">
      <div className="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-7 border-b bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-950">
          {Array.from({ length: 7 }).map((_, index) => <Skeleton key={index} className="h-4 w-10" />)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, index) => (
            <div key={index} className="min-h-28 border-b border-r border-gray-200 p-2 dark:border-gray-800">
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
