'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, Download, Mail, PlayCircle, RefreshCw, RotateCcw } from 'lucide-react'
import {
  cancelBatchAction,
  downloadFailedRowsAction,
  queueImportAction,
  queueInvitationsAction,
  retryFailedRowsAction,
  runQueueAction,
} from '@/app/(admin)/admin/previous-participants/actions'
import { saveCsv } from '@/components/admin/migration/upload-form'
import { Alert, Button } from '@/components/ui/primitives'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import type { MigrationBatchStatus } from '@/generated/prisma/enums'
import { isBatchRunning } from '@/lib/migration/labels'

/**
 * The controls that actually change something.
 *
 * Two rules run through all of them:
 *
 *  1. **Confirm before anything irreversible.** Importing creates accounts and
 *     inviting emails real people; both open a dialog stating the number
 *     affected, because "how many?" is the question that stops a mistake.
 *  2. **Say what cannot be undone.** Cancelling does not delete accounts
 *     already created, and the dialog says so rather than implying a rollback
 *     the platform cannot perform.
 */
export function BatchActions({
  batchId,
  status,
  importableRows,
  invitableRows,
  failedRows,
  sendingInvitations = false,
  can,
}: {
  batchId: string
  status: MigrationBatchStatus
  importableRows: number
  invitableRows: number
  failedRows: number
  /** An outreach run for this batch still has queued sends. */
  sendingInvitations?: boolean
  can: { execute: boolean; invite: boolean; export: boolean }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const running = isBatchRunning(status) || sendingInvitations

  /*
   * While work is queued, advance it and refresh.
   *
   * There is no separate scheduler in this deployment, so the screen that is
   * watching the import is also what drives it. Five seconds is slow enough not
   * to hammer the database and fast enough that a small batch appears to finish
   * on its own. The interval stops the moment the batch leaves a running state
   * and its invitations have all gone — sending honestly pauses when nobody
   * has this screen open, and resumes when it is opened again.
   */
  useEffect(() => {
    if (!running || !can.execute) return

    const timer = setInterval(() => {
      void runQueueAction(batchId).then(() => router.refresh())
    }, 5000)

    return () => clearInterval(timer)
  }, [running, can.execute, batchId, router])

  function run(
    label: string,
    action: () => Promise<{ ok: true; data?: unknown } | { ok: false; error: string }>,
  ) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        setError(result.error)
        return
      }
      setNotice(label)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert tone="danger" title="That did not work">
          {error}
        </Alert>
      )}
      {notice && !error && <Alert tone="success">{notice}</Alert>}

      <div className="flex flex-wrap gap-3">
        {status === 'VALIDATED' && can.execute && (
          <Confirm
            trigger={
              <Button isLoading={pending}>
                <PlayCircle aria-hidden className="size-4" />
                Import {importableRows} {importableRows === 1 ? 'row' : 'rows'}
              </Button>
            }
            title={`Import ${importableRows} ${importableRows === 1 ? 'row' : 'rows'}?`}
            body={
              <>
                <p>
                  This creates accounts for people who do not have one and links the rest to their
                  existing account. Nothing already recorded is overwritten.
                </p>
                <p className="mt-3">
                  No password is imported or generated, and no email is sent by this step.
                </p>
              </>
            }
            confirmLabel="Import now"
            onConfirm={() =>
              run('Import queued. Progress appears below.', () => queueImportAction(batchId))
            }
          />
        )}

        {running && can.execute && (
          <Button
            variant="outline"
            isLoading={pending}
            onClick={() => run('Queue advanced.', () => runQueueAction(batchId))}
          >
            <RefreshCw aria-hidden className="size-4" />
            Process now
          </Button>
        )}

        {(status === 'COMPLETED' || status === 'COMPLETED_WITH_WARNINGS') &&
          can.invite &&
          invitableRows > 0 && (
            <Confirm
              trigger={
                <Button isLoading={pending}>
                  <Mail aria-hidden className="size-4" />
                  Invite {invitableRows} {invitableRows === 1 ? 'person' : 'people'}
                </Button>
              }
              title={`Email ${invitableRows} ${invitableRows === 1 ? 'person' : 'people'}?`}
              body={
                <>
                  <p>
                    Each receives one message telling them an account exists and asking them to set a
                    password through “Forgot password”. No password is included.
                  </p>
                  <p className="mt-3 font-semibold text-ink">
                    This cannot be recalled once it starts.
                  </p>
                </>
              }
              confirmLabel="Send invitations"
              onConfirm={() =>
                run('Invitations queued.', () => queueInvitationsAction(batchId))
              }
            />
          )}

        {failedRows > 0 && can.execute && (
          <Button
            variant="outline"
            isLoading={pending}
            onClick={() => run('Failed rows queued again.', () => retryFailedRowsAction(batchId))}
          >
            <RotateCcw aria-hidden className="size-4" />
            Retry {failedRows} failed {failedRows === 1 ? 'row' : 'rows'}
          </Button>
        )}

        {can.export && failedRows + importableRows >= 0 && (
          <Button
            variant="outline"
            isLoading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await downloadFailedRowsAction(batchId)
                if (!result.ok) {
                  setError(result.error)
                  return
                }
                saveCsv(result.data.filename, result.data.csv)
              })
            }
          >
            <Download aria-hidden className="size-4" />
            Download unimported rows
          </Button>
        )}

        {status !== 'COMPLETED' &&
          status !== 'COMPLETED_WITH_WARNINGS' &&
          status !== 'CANCELLED' &&
          can.execute && (
            <Confirm
              trigger={
                <Button variant="ghost" isLoading={pending}>
                  <Ban aria-hidden className="size-4" />
                  Cancel this import
                </Button>
              }
              title="Cancel this import?"
              body={
                <>
                  <p>Queued work stops and no further rows are processed.</p>
                  <p className="mt-3">
                    Accounts already created are <strong>not</strong> removed — this stops the
                    import, it does not undo it.
                  </p>
                </>
              }
              confirmLabel="Cancel the import"
              destructive
              onConfirm={() => run('Import cancelled.', () => cancelBatchAction(batchId))}
            />
          )}
      </div>
    </div>
  )
}

/**
 * A confirmation dialog stating the number affected.
 *
 * Radix supplies the focus trap, the escape handling and the labelled dialog
 * role; the value added here is the wording — every one of these says what will
 * happen to how many people, because that is the sentence that stops a mistake.
 */
function Confirm({
  trigger,
  title,
  body,
  confirmLabel,
  onConfirm,
  destructive,
}: {
  trigger: React.ReactNode
  title: string
  body: React.ReactNode
  confirmLabel: string
  onConfirm: () => void
  destructive?: boolean
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription asChild>
          <div className="mt-3 space-y-0 text-sm text-body">{body}</div>
        </DialogDescription>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <DialogClose asChild>
            <Button variant="ghost">Go back</Button>
          </DialogClose>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
