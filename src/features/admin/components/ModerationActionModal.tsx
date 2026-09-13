import { useEffect, useState } from 'react'
import { Button, Modal, TextArea } from '@/shared/ui'

// Matches functions/src/adminActions.ts's REJECTION_REASON_MAX_LENGTH exactly
// — the server-side bound this client-side check exists only to give
// immediate feedback for, never to replace.
const REJECTION_REASON_MAX_LENGTH = 500

/**
 * One shared confirm/reason dialog reused by both seller-application review
 * and artwork moderation, for both the approve and reject outcome — four
 * call sites, one component, since all four share the exact same shape:
 * confirm an action, optionally require a reason first. `requireReason`
 * drives whether the textarea renders at all; approve never needs one.
 *
 * A textarea invites multi-line typing, but the server's `rejectionReason`
 * validation rejects any control character, newlines included (it's meant
 * to be a short plain-text note, not a document) — so a newline/run of
 * whitespace is collapsed to a single space before the reason is ever
 * submitted, matching the server's actual contract instead of surprising
 * the admin with a rejected submission over ordinary paragraph typing.
 */
export function ModerationActionModal({
  open,
  onClose,
  title,
  description,
  requireReason,
  confirmLabel,
  isSubmitting,
  onConfirm,
}: {
  open: boolean
  onClose: () => void
  title: string
  description: string
  requireReason: boolean
  confirmLabel: string
  isSubmitting: boolean
  onConfirm: (reason?: string) => void
}) {
  const [reason, setReason] = useState('')
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setReason('')
      setTouched(false)
    }
  }, [open])

  const normalizedReason = reason.replace(/\s+/g, ' ').trim()
  const reasonError = !requireReason
    ? null
    : normalizedReason.length === 0
      ? 'A reason is required.'
      : normalizedReason.length > REJECTION_REASON_MAX_LENGTH
        ? `Must be ${REJECTION_REASON_MAX_LENGTH} characters or fewer.`
        : null

  function handleConfirm() {
    if (requireReason) {
      setTouched(true)
      if (reasonError) return
      onConfirm(normalizedReason)
      return
    }
    onConfirm()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || (requireReason && touched && !!reasonError)}>
            {isSubmitting ? 'Working…' : confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">{description}</p>

        {requireReason && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="moderation-reason" className="text-sm font-medium text-text-secondary">
              Reason
            </label>
            <TextArea
              id="moderation-reason"
              rows={4}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !!reasonError}
              aria-describedby={touched && reasonError ? 'moderation-reason-error' : undefined}
              autoFocus
            />
            {touched && reasonError && (
              <span id="moderation-reason-error" role="alert" className="text-sm font-normal text-danger">
                {reasonError}
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
