import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  BedDouble,
  BookOpen,
  CalendarClock,
  Download,
  Edit3,
  HeartHandshake,
  HelpCircle,
  Info,
  LifeBuoy,
  Mail,
  Map,
  MapPin,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  Share2,
  Ticket,
  UserCog,
} from 'lucide-react'
import { ActionList, type ActionItem } from '@/components/volunteer/action-list'
import { AnnouncementList } from '@/components/volunteer/announcement-list'
import { CardStagger } from '@/components/volunteer/card-stagger'
import { DashboardFaqs } from '@/components/volunteer/dashboard-faqs'
import { DashboardHero } from '@/components/volunteer/dashboard-hero'
import { JourneyTimeline } from '@/components/volunteer/journey-timeline'
import { NotificationFeed } from '@/components/volunteer/notification-feed'
import { RegistrationProgress } from '@/components/volunteer/registration-progress'
import { ShiftList } from '@/components/volunteer/shift-list'
import { Alert, Card, CardBody, CardHeader, EmptyState, buttonClass } from '@/components/ui/primitives'
import { requireUser } from '@/lib/auth/rbac'
import { promoteDueAnnouncements } from '@/lib/announcements/lifecycle'
import { db } from '@/lib/db'
import { canVolunteerEdit, STATUS_LABELS, STATUS_TONES } from '@/lib/applications/status'
import {
  buildJourney,
  isAccepted,
  lifecyclePhase,
  type LifecyclePhase,
} from '@/lib/applications/journey'
import { buildNotifications } from '@/lib/applications/notifications'
import {
  accommodationNotice,
  dashboardFaqs,
  volunteerResources,
  type ResourceItem,
} from '@/content/volunteer-dashboard'
import {
  contact,
  daysUntilEventAt,
  eventConfig,
  eventEndsAt,
  eventStartsAt,
  eventStateAt,
  eventSummarySentence,
  formatEventDateTime,
  links,
  phoneHref,
} from '@/config/site'
import { isEnabled } from '@/config/features'
import { getSettings } from '@/lib/settings'
import { WIZARD_STEPS, stepByNumber } from '@/lib/validation/registration'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Your dashboard' }

/**
 * The volunteer's home.
 *
 * Organised around one question — *what happens next?* — rather than around the
 * shape of the database. The hero answers it in a sentence and a button; the
 * nine-stage journey places that answer in the whole arc; everything below is
 * detail for the volunteer who wants it.
 *
 * The page is lifecycle-aware: what the hero says, where its primary button
 * goes and which cards appear are all derived from the application's status and
 * the event's own timing. Someone with an unfinished draft is asked to finish
 * it; someone approved is shown their shifts; someone reading during the
 * marathon is pointed at the stream. Nothing the previous dashboard could do
 * has been removed — every control still exists, in the place it now belongs.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; denied?: string; confirmed?: string }>
}) {
  const user = await requireUser()
  const params = await searchParams
  const settings = await getSettings()

  const [account, application] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { createdAt: true, emailVerifiedAt: true, mmpCode: true },
    }),
    db.volunteerApplication.findUnique({
      where: { userId: user.id },
      include: {
        statusHistory: { orderBy: { createdAt: 'desc' }, take: 12 },
        // The current edition only. Everything a volunteer is looking at on
        // this page is about the marathon they are preparing for now.
        participations: {
          where: { edition: eventConfig.edition },
          include: {
            department: { select: { id: true, name: true } },
            assignments: {
              include: { shift: true },
              orderBy: { shift: { startsAt: 'asc' } },
            },
          },
        },
      },
    }),
  ])

  const status = application?.status ?? null
  const isDraft = !application || status === 'DRAFT'
  const accepted = isAccepted(status)

  // At most one row: `(applicationId, edition)` is unique.
  const participation = application?.participations[0] ?? null
  const departmentName = participation?.department?.name ?? null
  const assignments = participation?.assignments ?? []

  /*
   * A registered volunteer who has not yet said "I am coming this edition".
   *
   * This is the returning volunteer's whole reason for visiting, so when it is
   * true it takes over the hero: one button, straight to the two-minute form.
   * Migration seeds `confirmedAt` from the original submission, so nobody who
   * already submitted for 2027 is asked twice.
   */
  const needsConfirmation = !isDraft && (!participation || participation.confirmedAt === null)

  // Tick the lazy lifecycle clock first, so a scheduled announcement whose
  // moment has come is already PUBLISHED by the time this query runs.
  await promoteDueAnnouncements()
  const announcements = await db.announcement.findMany({
    where: {
      status: 'PUBLISHED',
      showOnDashboard: true,
      publishedAt: { not: null, lte: new Date() },
      OR: [
        { audience: 'ALL_VOLUNTEERS' },
        ...(participation?.departmentId
          ? [{ audience: 'DEPARTMENT' as const, departmentId: participation.departmentId }]
          : []),
        ...(application?.status === 'APPROVED' || application?.status === 'ASSIGNED'
          ? [{ audience: 'APPROVED_ONLY' as const }]
          : []),
      ],
    },
    // Highlighted announcements first, then newest.
    orderBy: [{ showAsBanner: 'desc' }, { publishedAt: 'desc' }],
    take: 5,
  })

  /*
   * `currentStep` is the section the wizard would open next, and it is advanced
   * only once a section has passed validation — so the number behind it is what
   * has genuinely been finished, not merely visited.
   */
  const completedSteps = application
    ? Math.max(0, Math.min(WIZARD_STEPS.length, application.currentStep - 1))
    : 0
  const nextStepSlug = stepByNumber(
    Math.min(Math.max(application?.currentStep ?? 1, 1), WIZARD_STEPS.length),
  ).slug

  /*
   * Event timing is resolved here, on the server, and passed down as plain
   * values. The countdown inside the hero keeps its own ticking clock, but the
   * page's *tone* must not depend on a client render — otherwise the headline
   * would flick between two phases during hydration.
   */
  const now = new Date()
  const startsAt = eventStartsAt()
  const endsAt = eventEndsAt()
  const eventState = eventStateAt(now)
  const daysUntilEvent = daysUntilEventAt(now)
  const phase = lifecyclePhase({ status, eventState, daysUntilEvent })

  const milestones = buildJourney({
    status,
    completedSteps,
    totalSteps: WIZARD_STEPS.length,
    departmentName,
    shiftCount: assignments.length,
    emailVerified: user.emailVerified,
  })

  const notifications = buildNotifications({
    accountCreatedAt: account.createdAt,
    emailVerifiedAt: account.emailVerifiedAt,
    application: application
      ? {
          status: application.status,
          updatedAt: application.updatedAt,
          submittedAt: application.submittedAt,
          departmentName,
        }
      : null,
    statusHistory: application?.statusHistory ?? [],
    assignments,
  })

  const supportHref = `mailto:${settings.support_email}?subject=${encodeURIComponent(
    account.mmpCode ? `Volunteer support — ${account.mmpCode}` : 'Volunteer support',
  )}`
  const accommodationHref = `mailto:${settings.support_email}?subject=${encodeURIComponent(
    'Volunteer accommodation',
  )}`

  const message = needsConfirmation
    ? `You are registered and ready — all we need for the ${eventConfig.edition} edition is your department, your dates and this edition's consents. It takes about two minutes.`
    : heroMessage({
        phase,
        completedSteps,
        totalSteps: WIZARD_STEPS.length,
        departmentName,
        daysUntilEvent,
        email: user.email,
        edition: eventConfig.edition,
        editionName: eventConfig.editionName,
      })

  const { primaryAction, secondaryAction } = needsConfirmation
    ? {
        primaryAction: {
          label: `Confirm your availability for ${eventConfig.edition}`,
          href: '/participate',
        },
        secondaryAction: undefined,
      }
    : heroActions({ phase, supportHref })

  const canEdit = Boolean(application) && canVolunteerEdit(application!.status)

  const quickActions: ActionItem[] = [
    isDraft
      ? {
          id: 'continue',
          label: application ? 'Confirm your availability' : 'Start registration',
          description: 'Pick up at the next unfinished section.',
          icon: <Edit3 className="size-4" />,
          href: `/apply/${nextStepSlug}`,
        }
      : {
          id: 'summary',
          label: 'Registration summary',
          description: 'Every answer you gave, ready to print or save.',
          icon: <Download className="size-4" />,
          href: '/dashboard/summary',
        },
    /*
     * Offered only once they have actually confirmed. The card says "I will be
     * attending", so putting it in front of someone who has not yet confirmed
     * their availability would invite them to announce a commitment they have
     * not made — and it doubles as the reward for having just made it.
     */
    ...(!isDraft && !needsConfirmation && isEnabled('attendingFrame')
      ? [
          {
            id: 'attending-card',
            label: 'Share that you are attending',
            description: 'Add your photo to the event card and post it.',
            icon: <Share2 className="size-4" />,
            href: '/attending',
          } satisfies ActionItem,
        ]
      : []),
    ...(!isDraft && canEdit
      ? [
          {
            id: 'edit-profile',
            label: 'Edit profile',
            description: 'Possible until a decision has been made.',
            icon: <Edit3 className="size-4" />,
            href: '/apply/personal',
          } satisfies ActionItem,
        ]
      : []),
    {
      id: 'account',
      label: 'Account settings',
      description: 'Email address, password and photo.',
      icon: <UserCog className="size-4" />,
      href: '/dashboard/account',
    },
    {
      id: 'handbook',
      label: 'Volunteer handbook',
      description: 'What is expected of you on the day.',
      // Not published yet — shown as a placeholder rather than a dead link.
      href: null,
      placeholder: true,
      icon: <BookOpen className="size-4" />,
    },
    {
      id: 'faqs',
      label: 'FAQs',
      description: 'Answers to the questions volunteers ask most.',
      icon: <HelpCircle className="size-4" />,
      href: '#dashboard-faqs',
    },
    {
      id: 'support',
      label: 'Contact support',
      description: settings.support_email,
      icon: <LifeBuoy className="size-4" />,
      href: supportHref,
    },
  ]

  return (
    <div className="space-y-6">
      <DashboardHero
        name={user.firstName ?? user.username}
        phase={phase}
        editionLabel={eventConfig.editionLabel}
        statusLabel={application ? STATUS_LABELS[application.status] : null}
        statusTone={application ? STATUS_TONES[application.status] : 'neutral'}
        mmpCode={account.mmpCode}
        message={message}
        primaryAction={primaryAction}
        secondaryAction={secondaryAction}
        progress={
          isDraft
            ? { completed: completedSteps, total: WIZARD_STEPS.length }
            : null
        }
        dateTimeLabel={startsAt ? formatEventDateTime(startsAt) : 'Date to be announced'}
        venue={eventConfig.venue.fullAddress}
        startsAtIso={startsAt?.toISOString() ?? null}
        endsAtIso={endsAt?.toISOString() ?? null}
        summary={eventSummarySentence()}
      />

      {params.confirmed === '1' && (
        <Alert tone="success" title={`You are confirmed for the ${eventConfig.edition} edition`}>
          Your department and availability are saved. Your shifts will appear here once the rota is
          set.
        </Alert>
      )}
      {params.saved === '1' && (
        <Alert tone="success" title="Progress saved">
          Your draft is saved. Continue whenever you are ready — nothing is lost.
        </Alert>
      )}
      {params.denied === '1' && (
        <Alert tone="danger" title="You do not have access to that page" icon={<ShieldAlert className="size-5" />}>
          If you think this is wrong, contact the volunteer team.
        </Alert>
      )}
      {!user.emailVerified && (
        <Alert tone="warning" title="Confirm your email address">
          We sent a confirmation link to {user.email}.{' '}
          <Link href="/verify-email" className="font-semibold underline underline-offset-4">
            Resend it
          </Link>
          .
        </Alert>
      )}
      {application?.decisionReason && (
        <Alert
          tone={application.status === 'REJECTED' ? 'danger' : 'info'}
          title="Message from the review team"
        >
          {application.decisionReason}
        </Alert>
      )}

      {/*
        Full width, above the two columns: the journey is the orientation the
        rest of the page hangs off, and its nine rows want the whole measure.
      */}
      <Card>
        <CardHeader title="Your journey" description="Where you are, and what happens next." />
        <CardBody>
          <JourneyTimeline milestones={milestones} />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <CardStagger className="space-y-6">
          <Card>
            <CardHeader
              title={isDraft ? 'Your registration' : 'Your application'}
              description={
                isDraft
                  ? 'Nothing is submitted until you review and send it.'
                  : 'What we hold, and what you can still change.'
              }
            />
            <CardBody>
              {isDraft ? (
                <RegistrationProgress
                  completedSteps={completedSteps}
                  nextStepSlug={nextStepSlug}
                  started={Boolean(application) && completedSteps > 0}
                />
              ) : (
                <div className="space-y-5">
                  <dl className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-sm text-muted">MMP number</dt>
                      <dd className="font-display text-lg font-bold text-ink">
                        {account.mmpCode ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted">Department</dt>
                      <dd className="font-medium text-ink">{departmentName ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-sm text-muted">Submitted</dt>
                      <dd className="font-medium text-ink">{formatDate(application!.submittedAt)}</dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      href="/dashboard/summary"
                      className={buttonClass({ variant: 'secondary', size: 'sm' })}
                    >
                      <Download aria-hidden className="size-4" />
                      Registration summary
                    </Link>

                    {canEdit ? (
                      <Link href="/apply/personal" className={buttonClass({ variant: 'outline', size: 'sm' })}>
                        <Edit3 aria-hidden className="size-4" />
                        Edit your details
                      </Link>
                    ) : (
                      <p className="text-sm text-muted">
                        Your application is locked now that it has been reviewed. Contact the
                        volunteer team if something needs to change.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardBody>
          </Card>

          {/*
            Shifts are only meaningful once there is an application to attach
            them to. Telling someone with an unfinished form that they have no
            shifts gives them nothing they can act on.
          */}
          {!isDraft && (
            <Card>
              <CardHeader
                title="Your shifts"
                description={
                  accepted
                    ? 'When and where you are serving.'
                    : 'Assigned once your application has been approved.'
                }
              />
              <CardBody>
                {assignments.length > 0 ? (
                  <ShiftList
                    shifts={assignments.map((assignment) => ({
                      id: assignment.id,
                      name: assignment.shift.name,
                      startsAt: assignment.shift.startsAt,
                      endsAt: assignment.shift.endsAt,
                      location: assignment.shift.location,
                      period: assignment.shift.period,
                    }))}
                  />
                ) : (
                  <EmptyState
                    icon={<CalendarClock className="size-8" />}
                    title="No shifts assigned yet"
                    description={
                      accepted
                        ? 'Your department is building the rota now. Your shifts will appear here and you will be emailed when they do — there is nothing you need to do in the meantime.'
                        : 'Once your application is approved, your department will assign your shifts and they will appear here with times and a meeting point.'
                    }
                  />
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Notifications"
              description="Everything that has happened to your application, newest first."
            />
            <CardBody>
              <NotificationFeed items={notifications} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Announcements"
              description="Messages from the volunteer team to every volunteer."
            />
            <CardBody>
              <AnnouncementList announcements={announcements} />
            </CardBody>
          </Card>

          <Card id="dashboard-faqs" className="scroll-mt-6">
            <CardHeader title="Volunteer FAQs" description="The questions volunteers ask most." />
            <CardBody className="py-1">
              <DashboardFaqs faqs={dashboardFaqs} />
            </CardBody>
          </Card>
        </CardStagger>

        <CardStagger className="space-y-6">
          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="py-3">
              <ActionList items={quickActions} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Event details" />
            <CardBody className="space-y-3 text-sm">
              <p className="font-display text-sm font-bold uppercase tracking-wide text-primary-active">
                {eventConfig.editionName} {eventConfig.edition}
              </p>
              <p className="flex items-start gap-2 text-body">
                <CalendarClock aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                {startsAt ? formatEventDateTime(startsAt) : 'Date to be announced'}
              </p>
              <p className="flex items-start gap-2 text-body">
                <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                {eventConfig.venue.fullAddress}
              </p>
              <p className="flex items-start gap-2 text-muted">
                <HeartHandshake aria-hidden className="mt-0.5 size-4 shrink-0" />
                {eventConfig.admission}
              </p>
              <a
                href={eventConfig.venue.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
              >
                Open in Google Maps
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </CardBody>
          </Card>

          {/*
            Accommodation.

            There is no accommodation record in the schema — no table, no field,
            no import — so this card states the position and points at the people
            who do know. An empty "your accommodation" panel would imply data is
            on its way when none is being collected.
          */}
          <Card>
            <CardHeader title={accommodationNotice.heading} />
            <CardBody className="space-y-3 text-sm">
              <p className="text-body">{accommodationNotice.body}</p>
              <a
                href={accommodationHref}
                className={buttonClass({ variant: 'outline', size: 'sm' })}
              >
                <BedDouble aria-hidden className="size-4" />
                {accommodationNotice.action}
              </a>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Volunteer resources" />
            <CardBody className="py-3">
              <ActionList items={volunteerResources.map(toActionItem)} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Need help?" />
            <CardBody className="space-y-3 text-sm">
              <p className="text-body">
                The volunteer team answers questions about your application, your department and
                your shifts.
              </p>
              <p className="flex items-start gap-2">
                <Mail aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                <a
                  href={supportHref}
                  className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
                >
                  {settings.support_email}
                </a>
              </p>
              <p className="flex items-start gap-2">
                <LifeBuoy aria-hidden className="mt-0.5 size-4 shrink-0 text-muted" />
                <a
                  href={phoneHref(contact.phone)}
                  className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
                >
                  {contact.phone}
                </a>
              </p>
              <p className="text-xs text-muted">
                Quoting your registration ID helps them find you faster.
              </p>
            </CardBody>
          </Card>
        </CardStagger>
      </div>
    </div>
  )
}

// --- Resources --------------------------------------------------------------

const RESOURCE_ICONS: Record<ResourceItem['icon'], ReactNode> = {
  book: <BookOpen className="size-4" />,
  shield: <ShieldCheck className="size-4" />,
  info: <Info className="size-4" />,
  play: <PlayCircle className="size-4" />,
  ticket: <Ticket className="size-4" />,
  mail: <Mail className="size-4" />,
  map: <Map className="size-4" />,
}

function toActionItem(resource: ResourceItem): ActionItem {
  return {
    id: resource.id,
    label: resource.label,
    description: resource.description,
    icon: RESOURCE_ICONS[resource.icon],
    href: resource.href,
    placeholder: resource.placeholder,
  }
}

// --- Lifecycle copy ---------------------------------------------------------

/**
 * One sentence per phase, written to be the only thing a volunteer needs to
 * read. Nothing here is invented: the hour count, the edition and the date come
 * from configuration, the department and the section count from the application
 * itself, and where the organisation has published no response time the wording
 * does not imply one.
 */
function heroMessage({
  phase,
  completedSteps,
  totalSteps,
  departmentName,
  daysUntilEvent,
  email,
  edition,
  editionName,
}: {
  phase: LifecyclePhase
  completedSteps: number
  totalSteps: number
  departmentName: string | null
  daysUntilEvent: number | null
  email: string
  edition: string
  editionName: string
}): string {
  const department = departmentName ? `the ${departmentName} team` : 'your chosen department'

  switch (phase) {
    case 'not_started':
      return 'Volunteering is one application, to one department. Everything you enter is saved as you go, so you can stop and come back whenever you need to.'
    case 'in_progress':
      return completedSteps === 0
        ? 'Your registration is open and nothing has been entered yet. Start with your personal details — the form saves as you go.'
        : `You have finished ${completedSteps} of ${totalSteps} sections. Nothing you entered has been lost; carry on from where you stopped.`
    case 'awaiting_review':
      return `Your application is with ${department}. Every application is read individually, and the decision will be emailed to ${email} as well as appearing here.`
    case 'approved':
      return `You have been approved to serve with ${department}. Your shifts will appear on this page as soon as they are assigned.`
    case 'waitlisted':
      return `You are on the waiting list for ${department}. If a place opens we will contact you at ${email} — nothing more is needed from you for now.`
    case 'not_accepted':
      return `Your application was not accepted for the ${edition} edition. You are welcome to apply again for the next one, and the volunteer team can tell you more.`
    case 'event_week':
      return daysUntilEvent !== null && daysUntilEvent > 0
        ? `${daysUntilEvent} ${daysUntilEvent === 1 ? 'day' : 'days'} until the first hour of praise. Check your shifts below and make sure your contact details are still correct.`
        : 'Praise begins today. Check your shifts below and make sure your contact details are still correct.'
    case 'live':
      return `The ${editionName} is under way. Your shifts are listed below, and your team lead will guide you from here.`
    case 'finished':
      return `The ${edition} edition has finished. Thank you for the hours you gave to it.`
  }
}

/**
 * The hero's buttons.
 *
 * While the application is incomplete, registration is the primary action and
 * nothing shares the row with it — a second button there would be a second
 * answer to "what should I do next?", and there is only one.
 */
function heroActions({ phase, supportHref }: { phase: LifecyclePhase; supportHref: string }): {
  primaryAction: { label: string; href: string; external?: boolean }
  secondaryAction?: { label: string; href: string; external?: boolean }
} {
  switch (phase) {
    case 'not_started':
      return { primaryAction: { label: 'Start your registration', href: '/apply' } }
    case 'in_progress':
      return { primaryAction: { label: 'Confirm your availability', href: '/apply' } }

    case 'not_accepted':
      return {
        primaryAction: { label: 'Contact the volunteer team', href: supportHref },
        secondaryAction: { label: 'Your summary', href: '/dashboard/summary' },
      }

    case 'live':
      return links.livestream
        ? {
            primaryAction: { label: 'Watch live', href: links.livestream, external: true },
            secondaryAction: { label: 'Your summary', href: '/dashboard/summary' },
          }
        : { primaryAction: { label: 'Your registration summary', href: '/dashboard/summary' } }

    default:
      return {
        primaryAction: { label: 'Your registration summary', href: '/dashboard/summary' },
        secondaryAction: { label: 'Account settings', href: '/dashboard/account' },
      }
  }
}
