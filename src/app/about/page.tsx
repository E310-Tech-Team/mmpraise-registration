import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Compass,
  Eye,
  Gift,
  Globe2,
  HandHeart,
  Heart,
  Infinity as InfinityIcon,
  PlayCircle,
  Sparkles,
  Users,
} from 'lucide-react'
import { CtaPair, VolunteerCta } from '@/components/site/cta'
import { GalleryGrid } from '@/components/site/gallery-grid'
import { Hero } from '@/components/site/hero'
import { HistoryTimeline } from '@/components/site/history-timeline'
import { ImpactStat } from '@/components/site/impact-stat'
import { NewsletterForm } from '@/components/site/newsletter-form'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { buttonClass, Card, CardBody, Eyebrow } from '@/components/ui/primitives'
import { Reveal, RevealStagger } from '@/components/ui/reveal'
import { eventConfig, isExternal, links, siteConfig } from '@/config/site'
import {
  aboutClosing,
  aboutHero,
  aboutOverview,
  aboutVolunteerCta,
  commitments,
  contributors,
  gallery,
  historySection,
  impact,
  milestones,
  mission,
  vision,
} from '@/content/about'
import { participationActions } from '@/content/homepage'
import { getSessionUser } from '@/lib/auth/session'
import { cn } from '@/lib/utils'

const TITLE = 'About MMPraise — a global movement of unending worship'
const DESCRIPTION =
  'Marathon Messiah’s Praise is an annual gospel event with one purpose: to praise God without stopping. Read how it began in 2012, what it is working towards, and how to take part.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: {
    type: 'article',
    url: `${siteConfig.url}/about`,
    siteName: siteConfig.shortName,
    title: TITLE,
    description: DESCRIPTION,
    locale: siteConfig.locale,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

const COMMITMENT_ICONS = {
  infinity: InfinityIcon,
  users: Users,
  globe: Globe2,
  sparkles: Sparkles,
  book: BookOpen,
  heart: Heart,
} as const

/**
 * About page.
 *
 * Rebuilt from https://mmpraise.org/about-us/, preserving every fact the source
 * page states while fixing the problems recorded in docs/ABOUT-AUDIT.md: Vision
 * and Mission carrying identical copy, three contradictory country counts, an
 * unlabelled email box under a "volunteer with us" heading, photographs with no
 * alt text, a heading order that jumps from H1 to H3, and no metadata or
 * structured data of any kind.
 *
 * Content lives in src/content/about.ts. Header, footer, buttons, cards and the
 * newsletter form are the homepage's own components, not copies of them.
 */
export default async function AboutPage() {
  const user = await getSessionUser()

  // Only the actions whose destination actually exists — the rest are still
  // behind their launch flag and would render as dead ends.
  const liveActions = participationActions.filter((action) => action.href !== null)

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'AboutPage',
        '@id': `${siteConfig.url}/about`,
        url: `${siteConfig.url}/about`,
        name: TITLE,
        description: DESCRIPTION,
        isPartOf: { '@type': 'WebSite', url: siteConfig.url, name: siteConfig.name },
        about: { '@id': `${siteConfig.url}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        alternateName: siteConfig.shortName,
        url: siteConfig.url,
        // Stated on the page itself, so the markup claims nothing the reader
        // cannot see.
        foundingDate: '2012-03-02',
        description: aboutHero.standfirst,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteConfig.url },
          { '@type': 'ListItem', position: 2, name: 'About', item: `${siteConfig.url}/about` },
        ],
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader isSignedIn={Boolean(user)} overlay />

      <main id="main">
        {/* ------------------------------------------------------------- Hero */}
        <Hero
          image={{ src: aboutHero.image.src, alt: '' }}
          stats={[
            { value: '200', label: 'Worship leaders and choirs' },
            { value: 'Many nations', label: 'Represented each edition' },
            { value: `Since ${eventConfig.foundedYear}`, label: 'Held every year' },
          ]}
        >
          <div className="mx-auto max-w-3xl text-left sm:text-center">
            <Breadcrumbs />

            <p
              data-hero-badge
              className="mt-6 inline-flex rounded-pill bg-primary px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white"
            >
              {aboutHero.eyebrow}
            </p>

            {/* Each line is wrapped so the timeline can raise them in sequence;
                the overflow clip is what gives the reveal its edge. */}
            <h1 className="mt-5 text-4xl text-white sm:text-5xl lg:text-6xl">
              {/*
                Each visual line is its own block, so the accessible name is
                built by concatenating them — without the trailing space the
                heading is announced as "…movement ofunending worship".
              */}
              {aboutHero.heading.split(' of ').map((line, index) => (
                <span key={line} className="block overflow-hidden pb-1">
                  <span data-hero-line className="block">
                    {index === 0 ? `${line} of ` : line}
                  </span>
                </span>
              ))}
            </h1>

            <p
              data-hero-standfirst
              className="mt-6 text-lg text-white/85 sm:mx-auto sm:max-w-2xl"
            >
              {aboutHero.standfirst}
            </p>

            <CtaPair
              className="mt-8"
              align="center"
              onDark
              registerLabel={user ? 'Continue registration' : 'Register to attend'}
              itemProps={{ 'data-hero-cta': '' }}
            />
          </div>
        </Hero>

        {/* --------------------------------------------------------- Overview */}
        <section className="section" aria-labelledby="overview-heading">
          <div className="container-content grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <Eyebrow>Overview</Eyebrow>
              <h2 id="overview-heading" className="mt-4 text-3xl sm:text-4xl">
                {aboutOverview.heading}
              </h2>
              {/* The opening paragraph carries the section, so it is set larger
                  than the two that support it. */}
              {aboutOverview.paragraphs.map((paragraph, index) => (
                <p
                  key={paragraph.slice(0, 40)}
                  className={
                    index === 0
                      ? 'mt-5 max-w-prose text-lg text-ink'
                      : 'mt-4 max-w-prose text-body'
                  }
                >
                  {paragraph}
                </p>
              ))}
            </Reveal>

            <Reveal delay={0.15}>
            <Image
              src={aboutOverview.image.src}
              alt={aboutOverview.image.alt}
              width={aboutOverview.image.width}
              height={aboutOverview.image.height}
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="h-auto w-full rounded-card border border-line object-cover"
            />
            </Reveal>
          </div>
        </section>

        {/* ---------------------------------------------- Origin and history */}
        <section
          className="border-y border-line bg-surface-sunken"
          aria-labelledby="history-heading"
        >
          <div className="container-content section">
            <div className="max-w-2xl">
              <Eyebrow>{historySection.eyebrow}</Eyebrow>
              <h2 id="history-heading" className="mt-4 text-3xl sm:text-4xl">
                {historySection.heading}
              </h2>
              <p className="mt-4 text-body">{historySection.standfirst}</p>
            </div>

            <HistoryTimeline milestones={milestones} />
          </div>
        </section>

        {/* ------------------------------------------------ Vision + Mission */}
        <section className="section" aria-labelledby="vision-heading">
          <div className="container-content grid gap-6 lg:grid-cols-2">
            {/* Vision — the future being sought. */}
            <Card className="card-lift h-full border-white/12 bg-night text-white">
              <CardBody className="flex h-full flex-col">
                <span className="inline-flex size-12 items-center justify-center rounded-card bg-gold/15 text-gold">
                  <Eye aria-hidden className="size-6" />
                </span>
                <p className="mt-5 inline-flex self-start rounded-pill bg-primary px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-white">
                  {vision.eyebrow}
                </p>
                <h2 id="vision-heading" className="mt-5 text-2xl text-white sm:text-3xl">
                  {vision.heading}
                </h2>
                <p className="mt-4 text-lg text-white/90">{vision.statement}</p>
                {vision.paragraphs.map((paragraph) => (
                  <p key={paragraph.slice(0, 40)} className="mt-4 text-white/80">
                    {paragraph}
                  </p>
                ))}
              </CardBody>
            </Card>

            {/* Mission — the work done to reach it. On the source site these two
                sections carried word-for-word identical copy. */}
            <Card className="card-lift h-full">
              <CardBody className="flex h-full flex-col">
                <span className="inline-flex size-12 items-center justify-center rounded-card bg-primary/10 text-primary-active">
                  <Compass aria-hidden className="size-6" />
                </span>
                <Eyebrow className="mt-5 self-start">{mission.eyebrow}</Eyebrow>
                <h2 id="mission-heading" className="mt-5 text-2xl sm:text-3xl">
                  {mission.heading}
                </h2>
                <p className="mt-4 text-lg text-ink">{mission.statement}</p>

                <ul className="mt-6 space-y-4">
                  {mission.points.map((point) => (
                    <li key={point.title} className="flex gap-3">
                      <Check aria-hidden className="mt-1 size-5 shrink-0 text-primary-active" />
                      <div>
                        <h3 className="text-base font-semibold text-ink">{point.title}</h3>
                        <p className="mt-1 text-body">{point.body}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>
        </section>

        {/* ------------------------------------------------------ Commitments */}
        <section
          className="border-y border-line bg-surface-sunken"
          aria-labelledby="commitments-heading"
        >
          <div className="container-content section">
            <div className="max-w-2xl">
              <Eyebrow>{commitments.eyebrow}</Eyebrow>
              <h2 id="commitments-heading" className="mt-4 text-3xl sm:text-4xl">
                {commitments.heading}
              </h2>
              <p className="mt-4 text-body">{commitments.standfirst}</p>
            </div>

            <RevealStagger as="ul" className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" selector=":scope > li">
              {commitments.items.map((item) => {
                const Icon = COMMITMENT_ICONS[item.icon]
                return (
                  <li key={item.id}>
                    <Card className="card-lift h-full">
                      <CardBody>
                        <span className="inline-flex size-11 items-center justify-center rounded-card bg-primary/10 text-primary-active">
                          <Icon aria-hidden className="size-5" />
                        </span>
                        <h3 className="mt-4 text-xl">{item.title}</h3>
                        <p className="mt-2 text-body">{item.body}</p>
                      </CardBody>
                    </Card>
                  </li>
                )
              })}
            </RevealStagger>
          </div>
        </section>

        {/* ----------------------------------------------------------- Impact */}
        <section className="section" aria-labelledby="impact-heading">
          <div className="container-content">
            <div className="max-w-2xl">
              <Eyebrow>{impact.eyebrow}</Eyebrow>
              <h2 id="impact-heading" className="mt-4 text-3xl sm:text-4xl">
                {impact.heading}
              </h2>
              <p className="mt-4 text-body">{impact.standfirst}</p>
            </div>

            {/* A description list: each figure is a term and its explanation the
                description, so the relationship survives without the layout. */}
            <RevealStagger
              as="dl"
              className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4"
              selector=":scope > div"
            >
              {impact.stats.map((stat) => (
                <ImpactStat key={stat.id} stat={stat} />
              ))}
            </RevealStagger>

            <figure className="mt-10">
              <Image
                src={impact.image.src}
                alt={impact.image.alt}
                width={impact.image.width}
                height={impact.image.height}
                loading="lazy"
                sizes="(min-width: 1024px) 900px, 100vw"
                className="mx-auto h-auto w-full max-w-3xl rounded-card border border-line"
              />
              <figcaption className="mt-4 text-center text-sm text-muted">{impact.note}</figcaption>
            </figure>
          </div>
        </section>

        {/* ----------------------------------------------------- Contributors */}
        <section
          className="border-y border-line bg-surface-sunken"
          aria-labelledby="contributors-heading"
        >
          <div className="container-content section">
            <div className="max-w-2xl">
              <Eyebrow>{contributors.eyebrow}</Eyebrow>
              <h2 id="contributors-heading" className="mt-4 text-3xl sm:text-4xl">
                {contributors.heading}
              </h2>
              <p className="mt-4 text-body">{contributors.standfirst}</p>
            </div>

            <RevealStagger as="ul" className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" selector=":scope > li">
              {contributors.groups.map((group) => (
                <li key={group.id}>
                  <Card className="card-lift h-full">
                    <CardBody>
                      <h3 className="text-xl">{group.title}</h3>
                      <p className="mt-2 text-body">{group.body}</p>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </RevealStagger>
          </div>
        </section>

        {/* ---------------------------------------------------- Participation */}
        <section className="section" aria-labelledby="participate-heading">
          <div className="container-content">
            <div className="max-w-2xl">
              <Eyebrow>Take part</Eyebrow>
              <h2 id="participate-heading" className="mt-4 text-3xl sm:text-4xl">
                Ways to be part of MMPraise
              </h2>
              <p className="mt-4 text-body">
                Every route below tells you what happens when you follow it, so nothing comes as a
                surprise.
              </p>
            </div>

            <RevealStagger as="ul" className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" selector=":scope > li">
              {liveActions.map((action) => {
                const href = action.href!
                const external = isExternal(href)
                return (
                  <li key={action.id}>
                    <Card className={cn('card-lift h-full', action.emphasis && 'ring-1 ring-primary/30')}>
                      <CardBody className="flex h-full flex-col">
                        <h3 className="text-xl">{action.title}</h3>
                        <p className="mt-2 text-body">{action.body}</p>
                        <p className="mt-2 text-sm text-muted">{action.outcome}</p>
                        <Link
                          href={href}
                          {...(external
                            ? { target: '_blank', rel: 'noopener noreferrer' }
                            : {})}
                          className="mt-4 inline-flex items-center gap-2 self-start font-semibold text-primary-active underline-offset-4 hover:underline"
                        >
                          {action.title}
                          <ArrowRight aria-hidden className="size-4" />
                          {external && <span className="sr-only"> (opens in a new tab)</span>}
                        </Link>
                      </CardBody>
                    </Card>
                  </li>
                )
              })}
            </RevealStagger>
          </div>
        </section>

        {/* ---------------------------------------------------------- Gallery */}
        <section
          className="border-y border-line bg-surface-sunken"
          aria-labelledby="gallery-heading"
        >
          <div className="container-content section">
            <div className="max-w-2xl">
              <Eyebrow>{gallery.eyebrow}</Eyebrow>
              <h2 id="gallery-heading" className="mt-4 text-3xl sm:text-4xl">
                {gallery.heading}
              </h2>
              <p className="mt-4 text-body">{gallery.standfirst}</p>
            </div>

            <GalleryGrid images={gallery.images} />
          </div>
        </section>

        {/* ------------------------------------------------- Volunteer appeal */}
        <section className="bg-night text-white" aria-labelledby="volunteer-heading">
          <div className="container-content section grid items-center gap-10 lg:grid-cols-2">
            <div>
              <p className="inline-flex rounded-pill bg-primary px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-white">
                {aboutVolunteerCta.eyebrow}
              </p>
              <h2 id="volunteer-heading" className="mt-5 text-3xl text-white sm:text-4xl">
                {aboutVolunteerCta.heading}
              </h2>
              {aboutVolunteerCta.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-4 text-white/85">
                  {paragraph}
                </p>
              ))}
              <Link href={aboutVolunteerCta.href} className={buttonClass({ size: 'lg', className: 'mt-8' })}>
                <HandHeart aria-hidden className="size-4" />
                {aboutVolunteerCta.ctaLabel}
              </Link>
            </div>

            <Image
              src={aboutVolunteerCta.image.src}
              alt={aboutVolunteerCta.image.alt}
              width={aboutVolunteerCta.image.width}
              height={aboutVolunteerCta.image.height}
              loading="lazy"
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="h-auto w-full rounded-card object-cover"
            />
          </div>
        </section>

        {/* ------------------------------------------------------- Subscribe */}
        <section className="section" aria-labelledby="updates-heading">
          <div className="container-content max-w-2xl">
            <Eyebrow>Stay in touch</Eyebrow>
            <h2 id="updates-heading" className="mt-4 text-3xl sm:text-4xl">
              Receive MMPraise updates
            </h2>
            <p className="mt-4 text-body">
              Dates, programme announcements and news from the marathon. Subscribing does not enter
              you as a volunteer — that is a separate application.
            </p>
            <div className="mt-8">
              <NewsletterForm />
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- Closing */}
        <section
          className="relative isolate overflow-hidden text-white"
          aria-labelledby="closing-heading"
        >
          {/* The page opens and closes on the same photographic register, so it
              reads as one piece rather than as a document that stops. */}
          <Image
            src={aboutOverview.image.src}
            alt=""
            fill
            sizes="100vw"
            loading="lazy"
            className="-z-30 object-cover"
          />
          <div aria-hidden className="absolute inset-0 -z-20 bg-night/82" />
          <div aria-hidden className="texture-grain absolute inset-0 -z-10 opacity-60" />

          <Reveal className="container-content section text-center">
            <h2 id="closing-heading" className="text-3xl text-white sm:text-4xl lg:text-5xl">
              {aboutClosing.heading}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-white/85">{aboutClosing.body}</p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <VolunteerCta />
              {/* Both are behind launch flags; each appears only once live. */}
              {links.livestream && (
                <Link
                  href={links.livestream}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({
                    variant: 'ghost',
                    size: 'lg',
                    className: 'text-white hover:bg-white/10',
                  })}
                >
                  <PlayCircle aria-hidden className="size-4" />
                  Watch live
                  <span className="sr-only"> (opens in a new tab)</span>
                </Link>
              )}
              {links.donation && (
                <Link
                  href={links.donation}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass({
                    variant: 'ghost',
                    size: 'lg',
                    className: 'text-white hover:bg-white/10',
                  })}
                >
                  <Gift aria-hidden className="size-4" />
                  Give
                  <span className="sr-only"> (opens in a new tab)</span>
                </Link>
              )}
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </>
  )
}

/** Breadcrumb trail, matching the BreadcrumbList in the structured data. */
function Breadcrumbs() {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-sm text-white/75">
        <li>
          <Link href="/" className="underline-offset-4 hover:text-white hover:underline">
            Home
          </Link>
        </li>
        <li aria-hidden>
          <ChevronRight className="size-4" />
        </li>
        <li aria-current="page" className="text-white">
          About
        </li>
      </ol>
    </nav>
  )
}
