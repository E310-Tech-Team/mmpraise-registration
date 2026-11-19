'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { sendVolunteerMessageAction } from '@/app/(admin)/admin/volunteer-messages/actions'
import { Checkbox, ErrorSummary, Field, TextArea, TextInput } from '@/components/ui/form'
import { Alert, Button } from '@/components/ui/primitives'
import { MESSAGE_EMAIL_LIMIT, type MessageSelection } from '@/lib/validation/messages'

/**
 * Write and send a direct message.
 *
 * The recipient count shown here is the one the server checks against: if the
 * list has moved by the time the message is sent, the send is refused and the
 * sender is told the new number rather than surprised later.
 */
export function ComposeMessageForm({ selection, recipientCount }: { selection: MessageSelection; recipientCount: number }) {
  const router = useRouter()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sendEmail, setSendEmail] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const emailAllowed = recipientCount <= MESSAGE_EMAIL_LIMIT
  const people = `${recipientCount.toLocaleString()} ${recipientCount === 1 ? 'volunteer' : 'volunteers'}`

  /** An error stops being true once the person edits that field. */
  function clearError(field: 'subject' | 'body') {
    setErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    startTransition(async () => {
      const result = await sendVolunteerMessageAction({
        subject,
        body,
        sendEmail: emailAllowed && sendEmail,
        selection,
        expectedCount: recipientCount,
      }).catch(() => null)

      if (!result) {
        setFormError('The message could not be sent. Check your connection and try again.')
        return
      }
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        setFormError(result.fieldErrors ? null : result.error)
        // After the render that shows the summary, or there is nothing to focus.
        requestAnimationFrame(() => document.getElementById('compose-errors')?.focus())
        return
      }
      router.push(`/admin/volunteer-messages/${result.data.id}?sent=1`)
    })
  }

  const summary = Object.entries(errors).map(([field, message]) => ({ field: `compose-${field}`, message }))

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <ErrorSummary id="compose-errors" errors={summary} />
      {formError && <Alert tone="danger">{formError}</Alert>}

      <Field label="Subject" htmlFor="compose-subject" required error={errors.subject}>
        <TextInput
          id="compose-subject"
          value={subject}
          maxLength={150}
          onChange={(event) => {
            setSubject(event.target.value)
            clearError('subject')
          }}
          invalid={Boolean(errors.subject)}
        />
      </Field>

      <Field
        label="Message"
        htmlFor="compose-body"
        required
        error={errors.body}
        help="Plain text. Line breaks are kept. Volunteers read it in their dashboard inbox."
      >
        <TextArea
          id="compose-body"
          value={body}
          maxLength={4000}
          rows={10}
          onChange={(event) => {
            setBody(event.target.value)
            clearError('body')
          }}
          invalid={Boolean(errors.body)}
        />
      </Field>

      <Checkbox
        checked={emailAllowed && sendEmail}
        onChange={(checked) => setSendEmail(emailAllowed && checked)}
        label="Also email a notice"
        description={
          emailAllowed
            ? 'Each recipient gets a short email with the subject and a link to their inbox — never the message itself.'
            : `Email notices can go to at most ${MESSAGE_EMAIL_LIMIT} volunteers at once. This message will be in-app only; for a large group, an announcement with email is the better tool.`
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-body">
          This will go to <strong>{people}</strong>.
        </p>
        <Button type="submit" isLoading={pending}>
          <Send aria-hidden className="size-4" /> Send to {people}
        </Button>
      </div>
    </form>
  )
}
