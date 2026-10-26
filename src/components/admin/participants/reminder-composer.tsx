'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MailPlus } from 'lucide-react'
import {
  cancelOutreachRunAction,
  createReminderRunAction,
  outreachProgressAction,
  previewReminderAction,
} from '@/app/(admin)/admin/previous-participants/outreach-actions'
import { Alert, Button, Spinner } from '@/components/ui/primitives'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

type Kind = 'REMINDER_UNACTIVATED' | 'REMINDER_UNCONFIRMED'

type Preview = {
  count: number
  sample: { email: string; firstName: string | null }[]
  cooldownDays: number
  maxRecipients: number
}

type Progress = {
  status: string
  planned: number
  sent: number
  failed: number
  skipped: number
  queued: number
  mailerMode: string
}

const COPY: Record<Kind, { title: string; audience: string; wording: string }> = {
  REMINDER_UNACTIVATED: {
    title: 'Remind unactivated accounts',
    audience:
      'imported previous participants who still cannot sign in — no password set, not excluded, outside the cooldown',
    wording: '“Your volunteer account is still waiting” — a fresh pointer to the password-reset flow. No links that grant access.',
  },
  REMINDER_UNCONFIRMED: {
    title: 'Remind unconfirmed volunteers',
    audience:
      'everyone with a working account and no confirmed availability for this edition — previous participants and new registrants alike, not excluded, outside the cooldown',
    wording: '“Are you serving this edition?” — a two-minute confirmation ask linking to the sign-in.',
  },
}

/**
 * The reminder campaign dialog: preview (exact count + a glimpse of who) →
 * counted confirm → live progress. Sending advances while this dialog polls;
 * the copy says so, because closing the page genuinely pauses it. In
 * development the run is visibly non-real ("written to file").
 */
export function ReminderComposer({ kind }: { kind: Kind }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [runId, setRunId] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const copy = COPY[kind]

  /*
   * Opening resets the dialog and loads the audience — the number shown is the
   * number the server will insist on at creation. Done in the event handler,
   * not an effect: the reset is a consequence of the click, not of rendering.
   */
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) return
    setPreview(null)
    setError(null)
    setRunId(null)
    setProgress(null)
    startTransition(async () => {
      const result = await previewReminderAction({ kind })
      if (!result.ok) setError(result.error)
      else setPreview(result.data)
    })
  }

  // While a run is live, poll — the poll itself advances the queue.
  useEffect(() => {
    if (!runId) return
    const tick = async () => {
      const result = await outreachProgressAction(runId)
      if (result.ok) {
        setProgress(result.data)
        if (!['QUEUED', 'RUNNING'].includes(result.data.status) && pollRef.current) {
          clearInterval(pollRef.current)
          pollRef.current = null
          router.refresh()
        }
      }
    }
    void tick()
    pollRef.current = setInterval(() => void tick(), 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [runId, router])

  function start() {
    if (!preview) return
    setError(null)
    startTransition(async () => {
      const result = await createReminderRunAction({ kind, expectedCount: preview.count })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setRunId(result.data.runId)
    })
  }

  const running = progress && ['QUEUED', 'RUNNING'].includes(progress.status)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MailPlus aria-hidden className="size-4" />
          {copy.title}
        </Button>
      </DialogTrigger>
      <DialogContent onOpenAutoFocus={(event) => event.preventDefault()}>
        <DialogTitle>{copy.title}</DialogTitle>
        <DialogDescription asChild>
          <p className="mt-2 text-sm text-body">
            Audience: {copy.audience}. Wording: {copy.wording}
          </p>
        </DialogDescription>

        <div className="mt-4 space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          {!runId && !preview && !error && (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Spinner className="size-4" /> Counting the audience…
            </p>
          )}

          {!runId && preview && (
            <>
              <p className="text-sm text-body">
                <strong className="font-display text-2xl tabular-nums">{preview.count}</strong>{' '}
                {preview.count === 1 ? 'person' : 'people'} currently match
                {preview.count > preview.maxRecipients &&
                  ` — this run is capped at ${preview.maxRecipients}; run it again for the rest`}
                . Cooldown: nobody emailed in the last {preview.cooldownDays} days is included, and
                every person is re-checked at the moment of sending.
              </p>
              {preview.sample.length > 0 && (
                <p className="text-xs text-muted">
                  For example: {preview.sample.map((person) => person.email).join(', ')}
                </p>
              )}
            </>
          )}

          {progress && (
            <div aria-live="polite" className="rounded-field bg-surface-sunken px-4 py-3 text-sm">
              <p className="font-semibold text-ink">
                {running ? 'Sending…' : 'Run finished'}
                {progress.mailerMode === 'file' && ' — development mode, written to files, no real mail'}
              </p>
              <p className="mt-1 tabular-nums text-body">
                {progress.sent} sent · {progress.failed} failed · {progress.skipped} skipped ·{' '}
                {progress.queued} to go (of {progress.planned})
              </p>
              {running && (
                <p className="mt-1 text-xs text-muted">
                  Sending continues while this dialog is open; it pauses if you close it and resumes
                  when reopened. “Sent” means the mail server accepted the message.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          {running && runId ? (
            <Button
              variant="outline"
              isLoading={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await cancelOutreachRunAction(runId)
                  if (!result.ok) setError(result.error)
                })
              }
            >
              Stop the rest
            </Button>
          ) : (
            <DialogClose asChild>
              <Button variant="ghost">Close</Button>
            </DialogClose>
          )}
          {!runId && (
            <Button onClick={start} isLoading={pending} disabled={!preview || preview.count === 0}>
              Send to {Math.min(preview?.count ?? 0, preview?.maxRecipients ?? 0)}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
