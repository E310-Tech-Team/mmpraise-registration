import type { Metadata } from 'next'
import Link from 'next/link'
import { FileSpreadsheet, Plus, UploadCloud } from 'lucide-react'
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  buttonClass,
} from '@/components/ui/primitives'
import { ParticipantsTabs } from '@/components/admin/participants/participants-tabs'
import { eventConfig } from '@/config/site'
import { requirePermission, can } from '@/lib/auth/rbac'
import { participantSummary } from '@/lib/admin/participants'
import { db } from '@/lib/db'
import { BATCH_STATUS_LABELS, BATCH_STATUS_TONES } from '@/lib/migration/labels'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Previous participants' }

/**
 * Every previous-edition import, newest first.
 *
 * The list is the module's home rather than the upload form: an administrator
 * arriving here most often wants to know whether last week's import finished
 * and how many people have activated since — not to start another one.
 */
export default async function PreviousParticipantsPage() {
  const user = await requirePermission('migration:view')

  const [batches, people] = await Promise.all([
    db.migrationBatch.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        createdBy: { select: { username: true } },
        _count: { select: { records: true } },
      },
    }),
    /*
     * Person-level, from the shared module. The old trio mixed entities — it
     * counted Users for "imported"/"activated" but migration *rows* for
     * "invitations sent", and activation used to erase the SENT status, so
     * "Invited" fell every time someone responded.
     */
    participantSummary(eventConfig.edition),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Previous participants</h1>
          <p className="mt-1 max-w-2xl text-body">
            Import people who took part in an earlier edition, invite them to set a password, and
            track who has come back.
          </p>
        </div>
        {can(user, 'migration:create') && (
          <Link href="/admin/previous-participants/new" className={buttonClass({ size: 'sm' })}>
            <Plus aria-hidden className="size-4" />
            New import
          </Link>
        )}
      </div>

      <ParticipantsTabs active="batches" />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Previous participants" value={people.total} hint="Unique people, across every import file." />
        <Stat
          label="People invited"
          value={people.invitedEver}
          hint="Ever sent an invitation — responding does not remove anyone from this figure."
        />
        <Stat
          label="Accounts activated"
          value={people.activated}
          hint="Can sign in: set a password, or already had an account."
        />
      </div>

      <Card>
        <CardHeader
          title="Imports"
          description={batches.length > 0 ? `${batches.length} shown, newest first.` : undefined}
        />
        <CardBody className={batches.length > 0 ? 'px-0 py-0 sm:px-0' : undefined}>
          {batches.length === 0 ? (
            <EmptyState
              icon={<FileSpreadsheet className="size-8" />}
              title="No imports yet"
              description="Upload a CSV of people from an earlier edition. You will be shown exactly what would happen before anything is written."
              action={
                can(user, 'migration:create') ? (
                  <Link href="/admin/previous-participants/new" className={buttonClass({ size: 'sm' })}>
                    <UploadCloud aria-hidden className="size-4" />
                    Upload a file
                  </Link>
                ) : undefined
              }
            />
          ) : (
            /*
             * A real table, scrollable rather than reflowed.
             *
             * Turning rows into cards on a phone loses the column headers, and
             * these columns are numbers that only mean anything next to their
             * label. Horizontal scroll inside the card keeps the page itself
             * from overflowing.
             */
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[52rem] border-collapse text-sm">
                <caption className="sr-only">
                  Previous-edition imports, newest first, with row counts and status.
                </caption>
                <thead>
                  <tr className="border-b border-line text-left">
                    <Th>Reference</Th>
                    <Th>Edition</Th>
                    <Th className="text-right">Rows</Th>
                    <Th className="text-right">Created</Th>
                    <Th className="text-right">Matched</Th>
                    <Th>Status</Th>
                    <Th>Uploaded</Th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id} className="border-b border-line last:border-0">
                      <Td>
                        <Link
                          href={`/admin/previous-participants/${batch.id}`}
                          className="font-semibold text-primary-active underline underline-offset-4"
                        >
                          {batch.reference}
                        </Link>
                        <span className="block text-xs text-muted">{batch.name}</span>
                      </Td>
                      <Td>{batch.sourceEdition}</Td>
                      <Td className="text-right tabular-nums">{batch._count.records || batch.totalRows}</Td>
                      <Td className="text-right tabular-nums">{batch.createdRows}</Td>
                      <Td className="text-right tabular-nums">{batch.matchedRows}</Td>
                      <Td>
                        <Badge tone={BATCH_STATUS_TONES[batch.status]}>
                          {BATCH_STATUS_LABELS[batch.status]}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="whitespace-nowrap">{formatDate(batch.createdAt)}</span>
                        {batch.createdBy && (
                          <span className="block text-xs text-muted">by {batch.createdBy.username}</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardBody>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 font-display text-3xl font-bold tabular-nums text-ink">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      </CardBody>
    </Card>
  )
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th scope="col" className={`px-5 py-3 font-display text-xs uppercase tracking-wide text-muted ${className ?? ''}`}>
      {children}
    </th>
  )
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-5 py-3 align-top text-body ${className ?? ''}`}>{children}</td>
}
