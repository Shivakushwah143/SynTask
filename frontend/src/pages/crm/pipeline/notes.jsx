import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Loader2, Plus, RefreshCw, StickyNote, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { Button } from '../../../components/ui'
import { timeService } from '@/services/timeService'

// Query key for this popover. Notes are lead-scoped (never stage-scoped), so a
// note written on one pipeline stage shows up on every other stage automatically.
const NOTES_QUERY_KEY = 'crm-pipeline-lead-notes'
// The lead workspace Notes tab queries ['crm-lead-notes', leadId]; keep it in
// sync so a note added from the pipeline is immediately visible there too.
const WORKSPACE_NOTES_QUERY_KEY = 'crm-lead-notes'

const getErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (typeof error?.message === 'string' && error.message.trim()) return error.message
  return fallback
}

// Date AND time label, rendered through the app's timezone service (the same
// one the rest of the CRM uses).
const formatDateTime = (value) => {
  if (!value) return ''
  const date = timeService.instant(value)
  if (Number.isNaN(date.getTime())) return ''
  return timeService.formatPattern(value, 'MMM d, yyyy h:mm a')
}

const getLeadLabel = (lead) =>
  lead?.company_name || lead?.prospect_name || lead?.primary_contact || lead?.email || 'this lead'

// A single note entry: author + date/time label on top, content below. Content
// is collapsed to one line (with a CSS ellipsis) and expands/collapses through
// the Show more / Show less toggle.
function NoteRow({ note }) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)
  const contentRef = useRef(null)
  const text = note.content || ''

  // Detect whether the note runs past a single line. DOM measurement is
  // authoritative in real browsers; the length/newline heuristic covers jsdom
  // (where scrollHeight/clientHeight are always 0) so tests stay deterministic.
  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node || expanded) return
    const measure = () => {
      const sh = node.scrollHeight
      const ch = node.clientHeight
      if (sh > 0 && ch > 0) {
        setOverflows(sh > ch + 1)
      } else {
        setOverflows(text.length > 90 || /\n/.test(text))
      }
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [expanded, text])

  return (
    <li className="rounded-xl border border-surface-border/80 bg-surface-muted/50 px-3 py-2.5 dark:border-gray-800 dark:bg-gray-950/40">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.14em] text-text-secondary dark:text-gray-300">
          {note.created_by_name || 'System'}
        </span>
        <span className="shrink-0 text-[10px] font-medium text-text-muted dark:text-gray-400">
          {formatDateTime(note.created_at)}
          {note.is_edited ? ' · edited' : ''}
        </span>
      </div>
      <p
        ref={contentRef}
        className={`mt-1.5 whitespace-pre-wrap break-words text-xs leading-5 text-text-primary dark:text-gray-100 ${expanded ? '' : 'line-clamp-1'}`}
      >
        {text}
      </p>
      {overflows ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-1 text-[11px] font-semibold text-primary-700 transition hover:text-primary-800 dark:text-primary-300 dark:hover:text-primary-200"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </li>
  )
}

// Self-contained trigger + popover: shows the lead's notes (all stages), lets
// the user add a new one, and collapses long entries to a single line. Fully
// manages its own fetch/create state, so callers only pass the lead.
export const LeadNotesButton = memo(function LeadNotesButton({
  lead,
  variant = 'ghost',
  size = 'sm',
  className = '',
}) {
  const leadId = lead?.id || lead?._id
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)
  const [position, setPosition] = useState(null)
  const queryClient = useQueryClient()
  const leadLabel = getLeadLabel(lead)

  // ── Resizable panel state ────────────────────────────────────────────
  const MIN_W = 280
  const MAX_W = 600
  const MIN_H = 220
  const MAX_H = 700
  const [panelSize, setPanelSize] = useState({ w: 320, h: 440 })
  const resizingRef = useRef(null) // { startX, startY, startW, startH, dir }
  const pinchRef = useRef(null)    // { startDist, startW, startH }

  const notesQuery = useQuery(
    [NOTES_QUERY_KEY, leadId],
    () => crmApi.getLeadNotes(leadId),
    { enabled: Boolean(leadId) && open, retry: false, staleTime: 30 * 1000 }
  )

  const createMutation = useMutation(
    (content) => crmApi.createLeadNote(leadId, { content }),
    {
      onSuccess: () => {
        toast.success('Note added')
        setDraft('')
        queryClient.invalidateQueries([NOTES_QUERY_KEY, leadId])
        queryClient.invalidateQueries([WORKSPACE_NOTES_QUERY_KEY, leadId])
      },
      onError: (error) => {
        toast.error(getErrorMessage(error, 'Failed to add note'))
      },
    }
  )

  // ── Resize: pointer drag (all four edges + corners) ─────────────────
  const handleResizePointerDown = useCallback((event, dir) => {
    event.preventDefault()
    event.stopPropagation()
    const { clientX, clientY } = event
    resizingRef.current = {
      startX: clientX, startY: clientY,
      startW: panelSize.w, startH: panelSize.h, dir,
    }
    const onMove = (e) => {
      const r = resizingRef.current
      if (!r) return
      const dx = e.clientX - r.startX
      const dy = e.clientY - r.startY
      let newW = r.startW
      let newH = r.startH
      if (r.dir.includes('e')) newW = r.startW + dx
      if (r.dir.includes('w')) newW = r.startW - dx
      if (r.dir.includes('s')) newH = r.startH + dy
      if (r.dir.includes('n')) newH = r.startH - dy
      setPanelSize({
        w: Math.min(MAX_W, Math.max(MIN_W, newW)),
        h: Math.min(MAX_H, Math.max(MIN_H, newH)),
      })
    }
    const onUp = () => {
      resizingRef.current = null
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [panelSize])

  // ── Resize: pinch-to-zoom (touch) ───────────────────────────────────
  useEffect(() => {
    if (!open) return undefined
    const el = popoverRef.current
    if (!el) return undefined
    const getDist = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.hypot(dx, dy)
    }
    const onTouchStart = (e) => {
      if (e.touches.length !== 2) return
      e.preventDefault()
      pinchRef.current = { startDist: getDist(e.touches), startW: panelSize.w, startH: panelSize.h }
    }
    const onTouchMove = (e) => {
      const p = pinchRef.current
      if (!p || e.touches.length !== 2) return
      e.preventDefault()
      const dist = getDist(e.touches)
      const scale = dist / p.startDist
      setPanelSize({
        w: Math.min(MAX_W, Math.max(MIN_W, Math.round(p.startW * scale))),
        h: Math.min(MAX_H, Math.max(MIN_H, Math.round(p.startH * scale))),
      })
    }
    const onTouchEnd = () => { pinchRef.current = null }
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
    }
  }, [open, panelSize.w, panelSize.h])

  // Anchor the popover to the trigger and close on outside clicks / Escape.
  useEffect(() => {
    if (!open) return undefined
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      const margin = 12
      const width = panelSize.w
      const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin)
      const spaceBelow = window.innerHeight - rect.bottom - margin
      const spaceAbove = rect.top - margin
      const renderAbove = spaceBelow < 300 && spaceAbove > spaceBelow
      const maxHeight = Math.max(MIN_H, Math.min(panelSize.h, (renderAbove ? spaceAbove : spaceBelow) - 8))
      setPosition(
        renderAbove
          ? { bottom: window.innerHeight - rect.top + 8, left, width, maxHeight }
          : { top: rect.bottom + 8, left, width, maxHeight }
      )
    }
    updatePosition()
    const handlePointerDown = (event) => {
      if (
        popoverRef.current
        && !popoverRef.current.contains(event.target)
        && triggerRef.current
        && !triggerRef.current.contains(event.target)
      ) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, panelSize.w, panelSize.h])

  if (!leadId) return null

  const notes = notesQuery.data?.notes || []
  const handleAdd = () => {
    const content = draft.trim()
    if (!content || createMutation.isLoading) return
    createMutation.mutate(content)
  }

  const handleComposerKeyDown = (event) => {
    // Enter posts the note; Shift+Enter keeps writing multiline text.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleAdd()
    }
  }

  return (
    <>
      <div ref={triggerRef} className="inline-flex">
        <Button
          type="button"
          variant={variant}
          size={size}
          className={className}
          title="Lead notes"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Notes for ${leadLabel}`}
          onClick={() => setOpen((value) => !value)}
        >
          <StickyNote className="h-4 w-4" />
          Notes
        </Button>
      </div>
      {open && typeof document !== 'undefined' ? createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`Notes for ${leadLabel}`}
          className="fixed z-[9999] flex flex-col overflow-hidden rounded-2xl border border-surface-border/80 bg-surface shadow-2xl backdrop-blur-md dark:border-gray-800 dark:bg-gray-900"
          style={position || { width: panelSize.w, top: 'auto', left: 'auto', maxHeight: panelSize.h }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-surface-border/70 px-4 py-3 dark:border-gray-800">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-primary-600 dark:text-primary-300" />
                <h4 className="text-sm font-semibold text-text-primary dark:text-gray-100">
                  Notes
                </h4>
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[10px] font-semibold text-text-muted dark:bg-gray-800 dark:text-gray-400">
                  {notes.length}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-text-secondary dark:text-gray-400">
                {leadLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close notes"
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-muted hover:text-text-primary dark:hover:bg-gray-800 dark:hover:text-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
            {notesQuery.isLoading ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-text-muted dark:text-gray-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notes...
              </div>
            ) : notesQuery.isError ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-text-muted dark:text-gray-400">
                <span>{getErrorMessage(notesQuery.error, 'Notes could not be loaded.')}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => notesQuery.refetch()}>
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </Button>
              </div>
            ) : notes.length ? (
              <ul className="space-y-2">
                {notes.map((note) => (
                  <NoteRow key={note.id} note={note} />
                ))}
              </ul>
            ) : (
              <div className="flex flex-col items-center gap-2 py-6 text-center text-xs text-text-muted dark:text-gray-400">
                <StickyNote className="h-5 w-5" />
                <span>No notes yet for this lead.</span>
              </div>
            )}
          </div>

          {/* Resize handle: bottom-right corner + all four edges */}
          {/* ── Corner: bottom-right ─────────────────────────────── */}
          <div
            role="separator"
            aria-label="Resize notes panel"
            onPointerDown={(e) => handleResizePointerDown(e, 'se')}
            className="absolute bottom-0 right-0 z-10 h-5 w-5 cursor-se-resize"
          >
            <svg className="h-full w-full p-0.5 text-text-muted/50 dark:text-gray-500" viewBox="0 0 16 16" fill="none">
              <path d="M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M14 8L8 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          {/* ── Edge: right ─────────────────────────────────────── */}
          <div
            role="separator"
            aria-label="Resize width"
            onPointerDown={(e) => handleResizePointerDown(e, 'e')}
            className="absolute right-0 top-8 bottom-8 z-10 w-1.5 cursor-e-resize hover:bg-primary-400/20"
          />
          {/* ── Edge: bottom ────────────────────────────────────── */}
          <div
            role="separator"
            aria-label="Resize height"
            onPointerDown={(e) => handleResizePointerDown(e, 's')}
            className="absolute bottom-0 left-4 right-4 z-10 h-1.5 cursor-s-resize hover:bg-primary-400/20"
          />
          {/* ── Edge: left ──────────────────────────────────────── */}
          <div
            role="separator"
            aria-label="Resize width"
            onPointerDown={(e) => handleResizePointerDown(e, 'w')}
            className="absolute left-0 top-8 bottom-8 z-10 w-1.5 cursor-w-resize hover:bg-primary-400/20"
          />
          {/* ── Edge: top ───────────────────────────────────────── */}
          <div
            role="separator"
            aria-label="Resize height"
            onPointerDown={(e) => handleResizePointerDown(e, 'n')}
            className="absolute top-0 left-4 right-4 z-10 h-1.5 cursor-n-resize hover:bg-primary-400/20"
          />

          <div className="border-t border-surface-border/70 px-4 py-3 dark:border-gray-800">
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                aria-label="Write a note"
                placeholder="Write something about this lead..."
                rows={2}
                className="min-w-0 flex-1 resize-none rounded-xl border border-surface-border/80 bg-surface px-3 py-2 text-xs leading-5 text-text-primary outline-none transition placeholder:text-text-muted focus:border-primary-400 focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={createMutation.isLoading}
                loadingText="Adding"
                onClick={handleAdd}
                disabled={!draft.trim()}
              >
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
          </div>
        </div>,
        document.body
      ) : null}
    </>
  )
})