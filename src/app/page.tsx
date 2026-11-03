import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  CalendarDays,
  Clock,
  Gift,
  HandHeart,
  HeartHandshake,
  MapPin,
  PlayCircle,
  Quote,
  Ticket,
  Users,
} from 'lucide-react'
import { AnnouncementBar } from '@/components/site/announcement-bar'
import { CtaPair } from '@/components/site/cta'
import { Hero } from '@/components/site/hero'
import { EventCountdown } from '@/components/site/event-countdown'
import { NewsletterForm } from '@/components/site/newsletter-form'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { TestimonyCard } from '@/components/site/testimony-card'
import { TestimonyForm } from '@/components/site/testimony-form'
import { buttonClass, Card, CardBody, Eyebrow } from '@/components/ui/primitives'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ReachFigure } from '@/components/site/reach-figure'
import { Reveal, RevealStagger } from '@/components/ui/reveal'
import {
  contact,
  eventConfig,
  eventEndsAt,
  eventStartsAt,
  eventSummarySentence,
  isExternal,
  links,
  siteConfig,
} from '@/config/site'
import {
  activities,
  artists,
  artistsSection,
  eventSummary,
  faqs,
  globalReach,
  hero,
  mediaResources,
  mediaSection,
  participationActions,
  testimonies,
  testimoniesSection,
  volunteerCta,
} from '@/content/homepage'
import { getSessionUser } from '@/lib/auth/session'
import { getSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${eventConfig.durationHours} Hours of non-stop praise`,
  description: siteConfig.description,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: siteConfig.url,
    siteName: siteConfig.shortName,
    title: `${siteConfig.name} — ${eventConfig.durationHours} Hours of non-stop praise`,
    description: siteConfig.description,
    locale: siteConfig.locale,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} — ${eventConfig.durationHours} Hours of non-stop praise`,
    description: siteConfig.description,
  },
}

const ACTION_ICONS = {
  ticket: Ticket,
  hands: HandHeart,
  gift: Gift,
  play: PlayCircle,
  pray: HeartHandshake,
  quote: Quote,
} as const

/**
 * MMPraise homepage.
 *
 * Rebuilt from the current WordPress homepage, preserving every meaningful
 * section while fixing the problems recorded in docs/HOMEPAGE-AUDIT.md: no H1,
 * duplicated testimonies, an expired countdown, unlabelled forms, dead menu
 * links and a published placeholder telephone number.
 *
 * Content lives in src/content/homepage.ts and src/config/site.ts so the
 * organisation can change dates, artists, testimonies and FAQs without touching
 * this file.
 */
export default async function HomePage() {
  const [user, settings] = await Promise.all([getSessionUser(), getSettings()])

  // Null while the date is still to be announced — every dependent section
  // switches to a "to be confirmed" state rather than showing a made-up date.
  const startsAt = eventStartsAt()
  const endsAt = eventEndsAt()
  const registrationOpen = settings.registration_open

  const dateFormatter = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Africa/Lagos',
  })
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lagos',
  })

  const eventFacts = [
    {
      icon: CalendarDays,
      label: 'Starts',
      value: startsAt ? dateFormatter.format(startsAt) : 'To be announced',
    },
    {
      icon: Clock,
      label: 'First hour',
      value: startsAt ? `${timeFormatter.format(startsAt)} WAT` : 'To be announced',
    },
    { icon: Clock, label: 'Duration', value: `${eventConfig.durationHours} unbroken hours` },
    { icon: MapPin, label: 'Venue', value: `${eventConfig.venue.name}, ${eventConfig.venue.address}` },
    { icon: PlayCircle, label: 'Online', value: 'Streamed on YouTube and Dove TV' },
    { icon: Users, label: 'Admission', value: eventConfig.admission },
  ]

  /** Structured data describing only what is visible on this page. */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        alternateName: siteConfig.shortName,
        url: siteConfig.url,
        email: contact.email,
        description: siteConfig.description,
        foundingDate: String(eventConfig.foundedYear),
        sameAs: [links.youtube],
      },
      // schema.org requires startDate on an Event, so the node is only emitted
      // once a date is confirmed. Invalid structured data is worse than none.
      ...(startsAt && endsAt
        ? [
            {
              '@type': 'Event',
              name: `${eventConfig.durationHours} Hours ${siteConfig.name} ${eventConfig.edition}`,
              description: siteConfig.description,
              startDate: startsAt.toISOString(),
              endDate: endsAt.toISOString(),
              eventStatus: 'https://schema.org/EventScheduled',
              eventAttendanceMode: 'https://schema.org/MixedEventAttendanceMode',
              isAccessibleForFree: true,
              organizer: { '@id': `${siteConfig.url}/#organization` },
              location: [
                { '@type': 'Place', name: eventConfig.venue.name, address: eventConfig.venue.address },
                { '@type': 'VirtualLocation', url: links.livestream },
              ],
            },
          ]
        : []),
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: { '@type': 'Answer', text: faq.answer },
        })),
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        // Generated from the same content the page renders, so the two cannot drift.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <AnnouncementBar
        id={`volunteer-${eventConfig.edition}`}
        message={
          registrationOpen
            ? `Volunteer applications for the ${eventConfig.edition} edition are open.`
            : settings.registration_closed_message
        }
        href={registrationOpen ? links.volunteer : (links.about ?? links.register)}
        linkLabel={registrationOpen ? 'Apply now' : 'Learn more'}
      />

      <SiteHeader isSignedIn={Boolean(user)} overlay />

      <main id="main">
        {/* ------------------------------------------------------------- Hero */}
        <Hero
          image={hero.image}
          stats={[
            { value: `${eventConfig.durationHours} hours`, label: 'Non-stop praise' },
            { value: `${eventConfig.nationsCount} nations`, label: 'Global worship' },
            { value: `Since ${eventConfig.foundedYear}`, label: 'A legacy of praise' },
          ]}
        >
          <div className="mx-auto max-w-4xl">
            <p
              data-hero-badge
              className="inline-flex rounded-pill bg-primary px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white"
            >
              {hero.eyebrow}
            </p>

            {/* The current site has no H1 anywhere on the page. Each line is
                wrapped so the timeline can raise them in sequence; the overflow
                clip is what gives the reveal its edge. */}
            <h1 className="mt-6 text-4xl text-white sm:text-5xl lg:text-6xl">
              {hero.heading.split(' — ').map((line, index) => (
                <span key={line} className="block overflow-hidden pb-1">
                  <span data-hero-line className="block">
                    {index === 0 ? `${line} ` : `— ${line}`}
                  </span>
                </span>
              ))}
            </h1>

            <p data-hero-standfirst className="mx-auto mt-5 max-w-2xl text-lg text-white/85">
              {hero.standfirst}
            </p>

            <ul className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-x-8 gap-y-3 text-sm text-white/85">
              <li data-hero-fact className="flex items-center gap-2">
                <CalendarDays aria-hidden className="size-4 shrink-0" />
                <span className="sr-only">Date: </span>
                {startsAt ? dateFormatter.format(startsAt) : 'Dates to be announced'}
              </li>
              <li data-hero-fact className="flex items-center gap-2">
                <MapPin aria-hidden className="size-4 shrink-0" />
                <span className="sr-only">Venue: </span>
                {eventConfig.venue.name}
              </li>
              <li data-hero-fact className="flex items-center gap-2">
                <PlayCircle aria-hidden className="size-4 shrink-0" />
                Watch live online
              </li>
            </ul>

            {/* Volunteer leads; attending is the outline beside it. */}
            <CtaPair
              className="mt-9"
              align="center"
              onDark
              registerLabel={user ? 'Confirm your availability' : 'Register to attend'}
              itemProps={{ 'data-hero-cta': '' }}
            />
          </div>
        </Hero>

        {/* ---------------------------------------------------- Event summary */}
        <section className="section" aria-labelledby="about-heading">
          <div className="container-content grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h2 id="about-heading" className="text-3xl sm:text-4xl">
                {eventSummary.heading}
              </h2>
              {eventSummary.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-4 text-body">
                  {paragraph}
                </p>
              ))}
              {eventSummary.readMoreHref && (
                <ExternalCta href={eventSummary.readMoreHref} className="mt-7">
                  Read the full story
                </ExternalCta>
              )}
            </div>

            <Image
              src={eventSummary.image.src}
              alt={eventSummary.image.alt}
              width={eventSummary.image.width}
              height={eventSummary.image.height}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="h-auto w-full rounded-card border border-line object-cover"
            />
          </div>
        </section>

        {/* ------------------------------------------ Countdown + event facts */}
        <section className="bg-night text-white" aria-labelledby="countdown-heading">
          <div className="container-content section">
            <div className="text-center">
              <p className="inline-flex rounded-pill bg-primary px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white">
                Countdown
              </p>
              <h2 id="countdown-heading" className="mt-6 text-3xl text-white sm:text-4xl">
                The countdown to glory begins
              </h2>
            </div>

            <div className="mt-10">
              <EventCountdown
                startsAtIso={startsAt?.toISOString() ?? null}
                endsAtIso={endsAt?.toISOString() ?? null}
                watchHref={links.livestream ?? '#updates'}
                highlightsHref={links.youtube ?? '#updates'}
                subscribeHref="#updates"
                summary={eventSummarySentence()}
                venue={eventConfig.venue.fullAddress}
                edition={eventConfig.edition}
              />
            </div>

            <dl className="mt-14 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
              {eventFacts.map((fact) => (
                <div key={fact.label} className="min-w-0">
                  <dt className="text-sm text-white/60">{fact.label}</dt>
                  {/* The icon lives inside the <dd>: a <dl>'s wrapping <div> may
                      only contain <dt> and <dd> elements. */}
                  <dd className="flex gap-2 font-medium text-white">
                    <fact.icon aria-hidden className="mt-1 size-4 shrink-0 text-brand-soft" />
                    <span>{fact.value}</span>
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-8 text-center text-sm text-white/60">
              <a
                href={eventConfig.venue.mapUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 hover:text-white"
              >
                Find the venue on the map
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </p>
          </div>
        </section>

        {/* -------------------------------------------- Participation actions */}
        <section className="section" aria-labelledby="participate-heading">
          <div className="container-content">
            <div className="max-w-2xl">
              <Eyebrow>Take part</Eyebrow>
              <h2 id="participate-heading" className="mt-5 text-3xl sm:text-4xl">
                How you can join the marathon
              </h2>
              <p className="mt-4 text-body">
                Whether you are travelling to the Redemption City or worshipping from another continent,
                there is a way in.
              </p>
            </div>

            <RevealStagger as="ul" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" selector=":scope > li">
              {participationActions.map((action) => {
                const Icon = ACTION_ICONS[action.icon]
                const external = action.href ? isExternal(action.href) : false
                return (
                  <li key={action.id}>
                    <Card
                      className={cn(
                        'h-full transition-shadow hover:shadow-[var(--shadow-raised)]',
                        action.emphasis && 'border-primary-border',
                      )}
                    >
                      <CardBody className="flex h-full flex-col">
                        <span
                          aria-hidden
                          className="flex size-11 items-center justify-center rounded-full bg-primary-subtle"
                        >
                          <Icon className="size-5 text-primary" />
                        </span>
                        <h3 className="mt-4 text-lg">{action.title}</h3>
                        <p className="mt-2 flex-1 text-sm text-body">{action.body}</p>
                        {action.href ? (
                          <>
                            {/* Say what happens next, so the click is never a surprise. */}
                            <p className="mt-3 text-xs text-muted">{action.outcome}</p>
                            <Link
                              href={action.href}
                              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                              className="mt-4 inline-flex items-center gap-1.5 self-start font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
                            >
                              {action.title}
                              <ArrowRight aria-hidden className="size-4" />
                              {external && <span className="sr-only"> (opens in a new tab)</span>}
                            </Link>
                          </>
                        ) : (
                          <p className="mt-4 inline-flex items-center gap-2 self-start rounded-pill bg-surface-sunken px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                            Coming soon
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  </li>
                )
              })}
            </RevealStagger>
          </div>
        </section>

        {/* ------------------------------------------------------- Activities */}
        <section className="border-y border-line bg-surface-sunken" aria-labelledby="activities-heading">
          <div className="container-content section">
            <div className="max-w-2xl">
              <Eyebrow>{activities.eyebrow}</Eyebrow>
              <h2 id="activities-heading" className="mt-5 text-3xl sm:text-4xl">
                {activities.heading}
              </h2>
            </div>

            <RevealStagger as="ul" className="mt-10 grid gap-6 md:grid-cols-3" selector=":scope > li">
              {activities.items.map((item) => {
                const external = item.href ? isExternal(item.href) : false
                return (
                  <li key={item.title}>
                    <Card className="card-lift h-full overflow-hidden">
                      <Image
                        src={item.image.src}
                        alt={item.alt}
                        width={item.image.width}
                        height={item.image.height}
                        sizes="(min-width: 768px) 33vw, 100vw"
                        loading="lazy"
                        className="h-48 w-full object-cover"
                      />
                      <CardBody>
                        <h3 className="text-lg">{item.title}</h3>
                        <p className="mt-2 text-sm text-body">{item.body}</p>
                        {item.href ? (
                          <Link
                            href={item.href}
                            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            className="mt-4 inline-flex items-center gap-1.5 font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
                          >
                            {item.linkLabel}
                            <ArrowRight aria-hidden className="size-4" />
                            {external && <span className="sr-only"> (opens in a new tab)</span>}
                          </Link>
                        ) : (
                          <p className="mt-4 text-sm font-semibold text-muted">Coming soon</p>
                        )}
                      </CardBody>
                    </Card>
                  </li>
                )
              })}
            </RevealStagger>
          </div>
        </section>

        {/* ------------------------------------------------------ Global reach */}
        <section
          className="relative isolate overflow-hidden bg-night text-white"
          aria-labelledby="reach-heading"
        >
          <div aria-hidden className="texture-grain absolute inset-0 -z-10 opacity-70" />

          <div className="container-content section grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              {/* The one place on the page that speaks rather than explains. */}
              <p className="font-display text-3xl font-bold uppercase leading-tight text-white sm:text-4xl lg:text-5xl">
                One voice.
                <br />
                One worship.
                <br />
                <span className="text-gold">Across nations.</span>
              </p>

              <h2 id="reach-heading" className="mt-8 text-xl text-white sm:text-2xl">
                {globalReach.heading}
              </h2>
              <p className="mt-4 max-w-prose text-white/80">{globalReach.body}</p>

              <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-8">
                <ReachFigure value={eventConfig.nationsCount} label="Nations represented" onDark />
                <ReachFigure value={eventConfig.durationHours} label="Hours of praise" onDark />
                <ReachFigure value={eventConfig.foundedYear} label="Running since" onDark animate={false} />
              </dl>
            </Reveal>

            <Reveal delay={0.15}>
              <Image
                src={globalReach.image.src}
                alt={globalReach.alt}
                width={globalReach.image.width}
                height={globalReach.image.height}
                sizes="(min-width: 1024px) 50vw, 100vw"
                loading="lazy"
                className="h-auto w-full rounded-card border border-white/12"
              />
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------------- Artists */}
        <section className="border-y border-line bg-surface-sunken" aria-labelledby="artists-heading">
          <div className="container-content section">
            <div className="max-w-2xl">
              <Eyebrow>{artistsSection.eyebrow}</Eyebrow>
              <h2 id="artists-heading" className="mt-5 text-3xl sm:text-4xl">
                {artistsSection.heading}
              </h2>
              <p className="mt-4 text-body">{artistsSection.body}</p>
            </div>

            <RevealStagger as="ul" className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" selector=":scope > li">
              {artists.map((artist, index) => (
                <li key={artist.id}>
                  <figure className="overflow-hidden rounded-card border border-line bg-surface">
                    <Image
                      src={artist.image.src}
                      // Names are not published on the current site, so the alt
                      // text describes the image rather than inventing one.
                      alt={artist.name ?? `Worship minister at Marathon Messiah’s Praise, portrait ${index + 1}`}
                      width={artist.image.width}
                      height={artist.image.height}
                      sizes="(min-width: 1024px) 25vw, 50vw"
                      loading="lazy"
                      className="h-auto w-full object-cover"
                    />
                    {(artist.name || artist.role) && (
                      <figcaption className="px-3 py-2.5">
                        {artist.name && (
                          <span className="block font-display font-bold uppercase text-ink">{artist.name}</span>
                        )}
                        {[artist.role, artist.country].filter(Boolean).length > 0 && (
                          <span className="block text-xs text-muted">
                            {[artist.role, artist.country].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </figcaption>
                    )}
                  </figure>
                </li>
              ))}
            </RevealStagger>
          </div>
        </section>

        {/* -------------------------------------------------------- Testimonies */}
        <section className="section" aria-labelledby="testimonies-heading">
          <div className="container-content">
            <div className="max-w-3xl">
              <Eyebrow>{testimoniesSection.eyebrow}</Eyebrow>
              <h2 id="testimonies-heading" className="mt-5 text-3xl sm:text-4xl">
                {testimoniesSection.heading}
              </h2>
              <p className="mt-4 text-body">{testimoniesSection.intro}</p>
            </div>

            {/*
              The first testimony leads at double width and is never truncated;
              the rest follow in the grid. A wall of seven identical cards gives
              the reader nowhere to start.
            */}
            <RevealStagger
              as="ul"
              className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3"
              selector=":scope > li"
            >
              {testimonies.map((testimony, index) => (
                <li key={testimony.id} className={index === 0 ? 'md:col-span-2' : undefined}>
                  <TestimonyCard testimony={testimony} featured={index === 0} />
                </li>
              ))}
            </RevealStagger>

            {/* Presented as personal accounts, not as verified claims. */}
            <p className="mt-8 max-w-3xl text-sm text-muted">{testimoniesSection.disclaimer}</p>
          </div>
        </section>

        {/* --------------------------------------------------- Share testimony */}
        <section
          id="share-testimony"
          className="scroll-mt-24 border-y border-line bg-surface-sunken"
          aria-labelledby="share-testimony-heading"
        >
          <div className="container-content section grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <Eyebrow>Share</Eyebrow>
              <h2 id="share-testimony-heading" className="mt-5 text-3xl sm:text-4xl">
                Tell us what God has done
              </h2>
              <p className="mt-4 text-body">
                Your story could be the encouragement someone else is waiting for. Share what happened and
                our team will be in touch if we need to check anything before publishing.
              </p>
              <Image
                src="/landing/congregation.webp"
                alt="Worshippers gathered in praise"
                width={567}
                height={660}
                sizes="(min-width: 1024px) 40vw, 100vw"
                loading="lazy"
                className="mt-8 hidden h-auto w-full rounded-card border border-line object-cover lg:block"
              />
            </div>

            <Card>
              <CardBody>
                <TestimonyForm />
              </CardBody>
            </Card>
          </div>
        </section>

        {/* ------------------------------------------------------------- Media */}
        <section className="section" aria-labelledby="media-heading">
          <div className="container-content">
            <div className="max-w-2xl">
              <Eyebrow>{mediaSection.eyebrow}</Eyebrow>
              <h2 id="media-heading" className="mt-5 text-3xl sm:text-4xl">
                {mediaSection.heading}
              </h2>
              <p className="mt-4 text-body">{mediaSection.body}</p>
            </div>

            <RevealStagger as="ul" className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" selector=":scope > li">
              {mediaResources.map((resource) => (
                <li key={resource.id}>
                  <Card className="card-lift h-full">
                    <CardBody className="flex h-full flex-col">
                      <p className="font-display text-xs font-bold uppercase tracking-wide text-primary-active">
                        {resource.category}
                      </p>
                      <h3 className="mt-2 text-base">{resource.title}</h3>
                      <p className="mt-2 flex-1 text-sm text-body">{resource.description}</p>

                      {resource.href && !resource.comingSoon ? (
                        <Link
                          href={resource.href}
                          {...(isExternal(resource.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className="mt-4 inline-flex items-center gap-1.5 self-start font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
                        >
                          Open {resource.category.toLowerCase()}
                          <ArrowRight aria-hidden className="size-4" />
                          {isExternal(resource.href) && <span className="sr-only"> (opens in a new tab)</span>}
                        </Link>
                      ) : (
                        // Honest "coming soon" beats a link to "#".
                        <p className="mt-4 text-sm font-semibold text-muted">Coming soon</p>
                      )}
                    </CardBody>
                  </Card>
                </li>
              ))}
            </RevealStagger>
          </div>
        </section>

        {/* --------------------------------------------------------- Volunteer */}
        <section className="bg-night text-white" aria-labelledby="volunteer-heading">
          <div className="container-content section grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="inline-flex rounded-pill bg-primary px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white">
                Volunteer
              </p>
              <h2 id="volunteer-heading" className="mt-6 text-3xl text-white sm:text-4xl">
                {volunteerCta.heading}
              </h2>
              <p className="mt-4 text-white/80">{volunteerCta.body}</p>

              <ul className="mt-6 space-y-3">
                {volunteerCta.points.map((point) => (
                  <li key={point.slice(0, 30)} className="flex gap-3 text-white/80">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
                    {point}
                  </li>
                ))}
              </ul>

              <Link href={links.volunteer} className={buttonClass({ size: 'lg', className: 'mt-8' })}>
                <HandHeart aria-hidden className="size-4" />
                Apply to volunteer
              </Link>
            </div>

            <Image
              src={volunteerCta.image.src}
              alt={volunteerCta.image.alt}
              width={volunteerCta.image.width}
              height={volunteerCta.image.height}
              sizes="(min-width: 1024px) 50vw, 100vw"
              loading="lazy"
              className="h-auto w-full rounded-card"
            />
          </div>
        </section>

        {/* --------------------------------------------------------------- FAQ */}
        <section className="section" aria-labelledby="faq-heading">
          <div className="container-content max-w-3xl">
            <div>
              <Eyebrow>FAQs</Eyebrow>
              <h2 id="faq-heading" className="mt-5 text-3xl sm:text-4xl">
                Everything you need to know
              </h2>
            </div>

            {/*
              Radix accordion: roving arrow-key focus, correct aria-expanded /
              aria-controls wiring, and a height transition that the
              reduced-motion rule cancels. `type="multiple"` so opening one
              answer never closes the one being read.

              Every answer is present in the HTML and republished as FAQPage
              structured data, so a crawler or a reader without JavaScript still
              gets the content even though the toggle needs it.
            */}
            <Accordion type="multiple" className="mt-10">
              {faqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* -------------------------------------------------------- Newsletter */}
        <section
          id="updates"
          className="scroll-mt-24 border-t border-line bg-surface-sunken"
          aria-labelledby="updates-heading"
        >
          <div className="container-content section grid gap-10 lg:grid-cols-2">
            <div>
              <Eyebrow>Stay connected</Eyebrow>
              <h2 id="updates-heading" className="mt-5 text-3xl sm:text-4xl">
                Get MMPraise updates
              </h2>
              <p className="mt-4 text-body">
                Be first to know when registration opens, when the schedule is published, and when the
                marathon goes live.
              </p>
            </div>

            <Card>
              <CardBody>
                <NewsletterForm />
              </CardBody>
            </Card>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}

function ExternalCta({
  href,
  children,
  className,
}: {
  href: string
  children: React.ReactNode
  className?: string
}) {
  const external = isExternal(href)
  return (
    <Link
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className={buttonClass({ variant: 'secondary', className })}
    >
      {children}
      <ArrowRight aria-hidden className="size-4" />
      {external && <span className="sr-only"> (opens in a new tab)</span>}
    </Link>
  )
}
