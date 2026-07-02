import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from 'react-query'
import { Lock, PencilLine, Plus, StickyNote, Trash2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { crmApi } from '../../../api/crm'
import { CRMEmptyState, CRMSection } from '../../../components/crm'
import { Badge, Button, ConfirmDialog, FormField, Modal, inputClassName } from '../../../components/ui'
import { formatShortDate } from '../pipeline/utils'

export const LEAD_NOTES_QUERY_KEY = 'crm-lead-notes'
const WORKSPACE_QUERY_KEY = 'crm-lead-workspace'

const getErrorMessage = (error, fallback) =>
  error?.response?.data?.detail || error?.message || fallback

const refreshLeadData = (queryClient, leadId) => {
  queryClient.invalidateQueries([LEAD_NOTES_QUERY_KEY, leadId])
  queryClient.invalidateQueries([WORKSPACE_QUERY_KEY, leadId, 'timeline'])
}

export function LeadNotesTab({ leadId, lead }) {
  const queryClient = useQueryClient()
  const [draftContent, setDraftContent] = useState('')
  const [editingNote, setEditingNote] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)

  const notesQuery = useQuery(
    [LEAD_NOTES_QUERY_KEY, leadId],
    () => crmApi.getLeadNotes(leadId),
    {
      enabled: Boolean(leadId),
      retry: false,
      staleTime: 60 * 1000,
    }
  )

  useEffect(() => {
    if (editingNote) {
      setEditingContent(editingNote.content || '')
      return
    }
    setEditingContent('')
  }, [editingNote])

  const notes = notesQuery.data?.notes || []
  const leadLabel = useMemo(
    () => lead?.company_name || lead?.prospect_name || lead?.primary_contact || 'this lead',
    [lead]
  )

  const createMutation = useMutation(
    (content) => crmApi.createLeadNote(leadId, { content }),
    {
      onSuccess: () => {
        toast.success('Note created')
        setDraftContent('')
        refreshLeadData(queryClient, leadId)
      },
      onError: (error) => {
        toast.error(getErrorMessage(error, 'Failed to create note'))
      },
    }
  )

  const updateMutation = useMutation(
    ({ noteId, content }) => crmApi.updateLeadNote(leadId, noteId, { content }),
    {
      onSuccess: () => {
        toast.success('Note updated')
        setEditingNote(null)
        refreshLeadData(queryClient, leadId)
      },
      onError: (error) => {
        toast.error(getErrorMessage(error, 'Failed to update note'))
      },
    }
  )

  const deleteMutation = useMutation(
    (noteId) => crmApi.deleteLeadNote(leadId, noteId),
    {
      onSuccess: () => {
        toast.success('Note deleted')
        setDeleteTarget(null)
        refreshLeadData(queryClient, leadId)
      },
      onError: (error) => {
        toast.error(getErrorMessage(error, 'Failed to delete note'))
      },
    }
  )

  const handleCreate = () => {
    const content = draftContent.trim()
    if (!content) {
      toast.error('Enter a note before saving')
      return
    }
    createMutation.mutate(content)
  }

  const handleUpdate = () => {
    const content = editingContent.trim()
    if (!content) {
      toast.error('Enter a note before saving')
      return
    }
    if (!editingNote) return
    updateMutation.mutate({ noteId: editingNote.id, content })
  }

  if (notesQuery.isError && notesQuery.error?.response?.status === 403) {
    return (
      <CRMSection title="Notes" description={`Notes for ${leadLabel}.`}>
        <CRMEmptyState
          icon={Lock}
          title="Access denied"
          description="You do not have permission to view notes for this lead."
        />
      </CRMSection>
    )
  }

  if (notesQuery.isError) {
    return (
      <CRMSection title="Notes" description={`Notes for ${leadLabel}.`}>
        <CRMEmptyState
          icon={StickyNote}
          title="Notes unavailable"
          description={getErrorMessage(notesQuery.error, 'The notes section could not be loaded.')}
          action={(
            <Button type="button" variant="primary" onClick={() => notesQuery.refetch()}>
              Retry
            </Button>
          )}
        />
      </CRMSection>
    )
  }

  return (
    <>
      <CRMSection
        title="Notes"
        description={`Lead-scoped notes for ${leadLabel}.`}
        actions={<Badge label={`${notes.length} notes`} colorKey="draft" />}
      >
        <div className="space-y-5">
          <div className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
            <FormField label="Add note" htmlFor="lead-note-content">
              <textarea
                id="lead-note-content"
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
                placeholder="Write a simple note for this lead..."
                className={`${inputClassName} min-h-32 resize-y`}
                aria-label="Add lead note"
              />
            </FormField>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">
                Notes are plain text, tenant scoped, and appear in the lead timeline.
              </p>
              <Button
                type="button"
                variant="primary"
                loading={createMutation.isLoading}
                onClick={handleCreate}
                disabled={!draftContent.trim()}
              >
                <Plus className="h-4 w-4" />
                Add note
              </Button>
            </div>
          </div>

          {notesQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div key={item} className="h-32 animate-pulse rounded-3xl bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : notes.length ? (
            <div className="space-y-3">
              {notes.map((note) => (
                <article key={note.id} className="rounded-3xl border border-surface-border/80 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge label={note.is_edited ? 'Edited' : 'Note'} colorKey="draft" />
                        <span className="text-xs font-medium uppercase tracking-[0.22em] text-gray-400 dark:text-gray-500">
                          {note.created_by_name || 'System'}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-gray-200">
                        {note.content}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <Button type="button" variant="secondary" size="sm" onClick={() => setEditingNote(note)}>
                        <PencilLine className="h-4 w-4" />
                        Edit
                      </Button>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setDeleteTarget(note)}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Badge label={`Created ${formatShortDate(note.created_at)}`} colorKey="draft" />
                    <Badge label={`Updated ${formatShortDate(note.updated_at)}`} colorKey="draft" />
                    {note.updated_by_name ? <Badge label={`By ${note.updated_by_name}`} colorKey="draft" /> : null}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <CRMEmptyState
              icon={StickyNote}
              title="No notes yet"
              description="Add the first note to keep all lead context in one place."
            />
          )}
        </div>
      </CRMSection>

      <Modal
        isOpen={Boolean(editingNote)}
        onClose={() => setEditingNote(null)}
        title="Edit note"
        size="lg"
      >
        <div className="space-y-4">
          <FormField label="Note content" htmlFor="lead-note-edit-content" required>
            <textarea
              id="lead-note-edit-content"
              value={editingContent}
              onChange={(event) => setEditingContent(event.target.value)}
              className={`${inputClassName} min-h-40 resize-y`}
              aria-label="Edit lead note"
            />
          </FormField>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditingNote(null)}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={updateMutation.isLoading}
              onClick={handleUpdate}
              disabled={!editingContent.trim()}
            >
              Save changes
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isLoading}
        title="Delete note"
        message="This note will be removed from the lead workspace and lead timeline."
        confirmLabel="Delete"
      />
    </>
  )
}
