import { Button } from './Button'
import { Modal } from './Modal'

export function ConfirmDialog({ isOpen, title = 'Confirm action', message, confirmLabel = 'Confirm', loading, onConfirm, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <p className="text-sm text-gray-600">{message}</p>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}
