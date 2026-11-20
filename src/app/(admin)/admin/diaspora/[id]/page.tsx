import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Badge, Card, CardBody, CardHeader } from '@/components/ui/primitives'
import { requirePermission } from '@/lib/auth/rbac'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'
import { DIASPORA_QUESTIONS, DIASPORA_SECTIONS } from '@/lib/validation/diaspora'

export const metadata: Metadata = { title: 'Diaspora response' }


/** Every answer in one response, grouped as the form asked them. */
export default async function DiasporaResponsePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('diaspora:view')
  const { id } = await params

  const submission = await db.diasporaSubmission.findUnique({ where: { id } })
  if (!submission) notFound()

  const others = await db.diasporaSubmission.count({
    where: { centreEmailKey: submission.centreEmailKey, edition: submission.edition, id: { not: submission.id } },
  })

  return (
    <div className="space-y-5">
      <Link
        href="/admin/diaspora"
        className="inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" /> All diaspora responses
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{submission.centreNameAndLocation}</h1>
          <p className="mt-1 text-body">
            {submission.country} · submitted {formatDate(submission.createdAt, true)} · edition {submission.edition}
          </p>
        </div>
        <Badge tone="neutral">{submission.reference}</Badge>
      </div>

      {others > 0 && (
        <p className="text-sm text-body">
          <Badge tone="warning">Repeat</Badge>{' '}
          This centre email has {others} other {others === 1 ? 'response' : 'responses'} this edition.{' '}
          <Link
            href={`/admin/diaspora?q=${encodeURIComponent(submission.centreOfficialEmail)}`}
            className="font-semibold text-primary underline underline-offset-4"
          >
            Compare them
          </Link>
        </p>
      )}

      {DIASPORA_SECTIONS.map((section) => (
        <Card key={section}>
          <CardHeader title={section} />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {DIASPORA_QUESTIONS.filter((q) => q.section === section).map((q) => {
                const value = submission[q.id]
                return (
                  <div key={q.id} className="min-w-0">
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{q.label}</dt>
                    <dd className="mt-1 break-words text-body">
                      {value ? (
                        q.type === 'email' ? (
                          <a href={`mailto:${value}`} className="text-primary underline underline-offset-4">
                            {value}
                          </a>
                        ) : (
                          value
                        )
                      ) : (
                        <span className="text-muted">Not provided</span>
                      )}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </CardBody>
        </Card>
      ))}
    </div>
  )
}
