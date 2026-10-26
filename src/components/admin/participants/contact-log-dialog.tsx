'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PhoneCall } from 'lucide-react'
import { bulkLogContactAction, logContactAction } from '@/app/(admin)/admin/previous-participants/followup-actions'
import { Alert, Button } from '@/components/ui/primitives'
import { Field, SelectInput, TextArea, TextInput } from '@/components/ui/form'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

export type ContactSelection =
  | { mode: 'single'; userId: string; name: string }
  | { mode: 'ids'; ids: string[] }
  | { mode: 'filter'; filters: Record<string, string>; total: number }

const CHANNELS = [
  { value: 'PHONE', label: 'Phone call' },
  { value: 'WHATSAPP', label: 'WhatsApp' },
  { value: 'SMS', label: 'SMS' },
  { value: 'EMAIL', label: 'Email (manual)' },
  { value: 'IN_PERSON', label: 'In person' },
  { value: 'OTHER', label: 'Other' },
]

const OUTCOMES = [
  { value: 'AWAITING_RESPONSE', label: 'Awaiting response' },
  { value: 'NEEDS_ASSISTANCE', label: 'Needs assistance' },
  { value: 'DECLINED', label: 'Declined — do not contact again' },
  { value: 'UNREACHABLE', label: 'Unreachable' },
  { value: 'RESOLVED', label: 'Resolved' },
]

/**
 * Record what was said to one person or many.
 *
 * The dialog always states exactly how many people the entry will be written
 * against, and the server re-counts with the same definition before acting —
 * the same counted contract as every bulk action on this platform. Staff
 * outcomes never masquerade as the participant's own response: confirming or
 * activating clears queues by itself.
 */
export function ContactLogDialog({
  selection,
  triggerLabel = 'Log contact',
  triggerVariant = 'outline',
}: {
  selection: ContactSelection
  triggerLabel?: string
  triggerVariant?: 'outline' | 'secondary' | 'ghost'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [values, setValues] = useState({
    channel: 'PHONE',
    outcome: 'AWAITING_RESPONSE',
    notes: '',
    nextFollowUpAt: '',
  })

  const count =
    selection.mode === 'single' ? 1 : selection.mode === 'ids' ? selection.ids.length : selection.total

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const entry = {
        channel: values.channel,
        outcome: values.outcome,
        notes: values.notes || null,
        nextFollowUpAt: values.nextFollowUpAt || null,
      }
      const result =
        selection.mode === 'single'
          ? await logContactAction({ userId: selection.userId, ...entry })
          : await bulkLogContactAction({
              selection:
                selection.mode === 'ids'
                  ? { mode: 'ids', ids: selection.ids }
                  : { mode: 'filter', filters: selection.filters },
              expectedCount: count,
              entry,
            })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setDone(
        count === 1
          ? 'Contact logged.'
          : `Contact logged against ${count} people.`,
      )
      setOpen(false)
      setValues({ channel: 'PHONE', outcome: 'AWAITING_RESPONSE', notes: '', nextFollowUpAt: '' })
      router.refresh()
    })
  }

  return (
    <>
      {done && <Alert tone="success">{done}</Alert>}
      <Dialog open={open} onOpenChange={(next) => (setOpen(next), setDone(null))}>
        <DialogTrigger asChild>
          <Button variant={triggerVariant} size="sm">
            <PhoneCall aria-hidden className="size-4" />
            {triggerLabel}
          </Button>
        </DialogTrigger>
        <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogTitle>
            {selection.mode === 'single'
              ? `Log contact with ${selection.name}`
              : `Log contact against ${count} ${count === 1 ? 'person' : 'people'}`}
          </DialogTitle>
          <DialogDescription asChild>
            <p className="mt-2 text-sm text-body">
              {selection.mode === 'filter'
                ? 'Everyone matching the current filters — including people beyond this page.'
                : selection.mode === 'ids'
                  ? 'Only the rows you ticked.'
                  : 'The entry joins their timeline; nothing is ever overwritten.'}
            </p>
          </DialogDescription>

          <form onSubmit={submit} className="mt-4 space-y-4">
            {error && <Alert tone="danger">{error}</Alert>}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Channel" htmlFor="contact-channel" required>
                <SelectInput
                  id="contact-channel"
                  value={values.channel}
                  onChange={(event) => setValues((v) => ({ ...v, channel: event.target.value }))}
                >
                  {CHANNELS.map((channel) => (
                    <option key={channel.value} value={channel.value}>
                      {channel.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Outcome" htmlFor="contact-outcome" required>
                <SelectInput
                  id="contact-outcome"
                  value={values.outcome}
                  onChange={(event) => setValues((v) => ({ ...v, outcome: event.target.value }))}
                >
                  {OUTCOMES.map((outcome) => (
                    <option key={outcome.value} value={outcome.value}>
                      {outcome.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>

            <Field
              label="Notes"
              htmlFor="contact-notes"
              help="What was said, promised or needed. Internal only."
            >
              <TextArea
                id="contact-notes"
                rows={3}
                maxLength={2000}
                value={values.notes}
                onChange={(event) => setValues((v) => ({ ...v, notes: event.target.value }))}
              />
            </Field>

            <Field
              label="Next follow-up"
              htmlFor="contact-followup"
              help="Leave empty if nothing is owed. A confirmed or activated person drops off the due list by themselves."
            >
              <TextInput
                id="contact-followup"
                type="datetime-local"
                value={values.nextFollowUpAt}
                onChange={(event) => setValues((v) => ({ ...v, nextFollowUpAt: event.target.value }))}
              />
            </Field>

            <div className="flex flex-wrap justify-end gap-3">
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" isLoading={pending}>
                Log against {count} {count === 1 ? 'person' : 'people'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
