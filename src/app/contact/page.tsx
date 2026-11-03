import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  ChevronRight,
  Gift,
  HandHeart,
  HeartHandshake,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PlayCircle,
  Quote,
  Send,
  Ticket,
} from 'lucide-react'
import { ContactForm } from '@/components/site/contact-form'
import { VolunteerCta } from '@/components/site/cta'
import { Hero } from '@/components/site/hero'
import { MapEmbed } from '@/components/site/map-embed'
import { SiteFooter } from '@/components/site/site-footer'
import { SiteHeader } from '@/components/site/site-header'
import { ReachFigure } from '@/components/site/reach-figure'
import { buttonClass, Card, CardBody, Eyebrow } from '@/components/ui/primitives'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Reveal, RevealStagger } from '@/components/ui/reveal'
import { contact, eventConfig, isExternal, links, phoneHref, siteConfig, socialLinks } from '@/config/site'
import {
  contactChannels,
  contactClosing,
  contactDetails,
  contactFaqs,
  contactHero,
  contactVolunteer,
} from '@/content/contact'
import { getSessionUser } from '@/lib/auth/session'

const TITLE = 'Contact MMPraise — questions, volunteering, prayer and partnership'
const DESCRIPTION =
  'Get in touch with Marathon Messiah’s Praise. Send a message, apply to volunteer, request prayer, share a testimony, or find where and when the marathon is held.'

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/contact' },
  openGraph: {
    type: 'website',
    url: `${siteConfig.url}/contact`,
    siteName: siteConfig.shortName,
    title: TITLE,
    description: DESCRIPTION,
    locale: siteConfig.locale,
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
}

const CHANNEL_ICONS = {
  message: MessageSquare,
  hands: HandHeart,
  pray: HeartHandshake,
  quote: Quote,
  ticket: Ticket,
  gift: Gift,
  play: PlayCircle,
} as const

const DETAIL_ICONS = { pin: MapPin, phone: Phone, mail: Mail, share: Send } as const

/**
 * Contact page.
 *
 * Rebuilt from https://mmpraise.org/contact-us/, which is a heading, one generic
 * form whose message field is named `prayer-request`, a line of address text,
 * and a stray email box under a volunteer heading. See docs/CONTACT-AUDIT.md.
 *
 * Content lives in src/content/contact.ts and src/config/site.ts. Header,
 * footer, cards, buttons and form controls are the shared components.
 */
export default async function ContactPage() {
  const user = await getSessionUser()

  // Only channels whose destination exists — the rest are behind a launch flag
  // and would be dead ends.
  const liveChannels = contactChannels.items.filter((channel) => channel.href !== null)

  // Derived rather than written down, so it can never go stale.
  const yearsActive = new Date().getUTCFullYear() - eventConfig.foundedYear

  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(
    contact.visitAddress,
  )}&output=embed`

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ContactPage',
        '@id': `${siteConfig.url}/contact`,
        url: `${siteConfig.url}/contact`,
        name: TITLE,
        description: DESCRIPTION,
        isPartOf: { '@type': 'WebSite', url: siteConfig.url, name: siteConfig.name },
      },
      {
        '@type': 'Organization',
        '@id': `${siteConfig.url}/#organization`,
        name: siteConfig.name,
        alternateName: siteConfig.shortName,
        url: siteConfig.url,
        email: contact.email,
        telephone: contact.phone,
        contactPoint: {
          '@type': 'ContactPoint',
          contactType: 'customer support',
          email: contact.email,
          telephone: contact.phone,
          areaServed: 'Worldwide',
          availableLanguage: 'English',
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: siteConfig.url },
          { '@type': 'ListItem', position: 2, name: 'Contact', item: `${siteConfig.url}/contact` },
        ],
      },
      {
        // Only the questions actually rendered below.
        '@type': 'FAQPage',
        mainEntity: contactFaqs.map((faq) => ({
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <SiteHeader isSignedIn={Boolean(user)} overlay />

      <main id="main">
        {/* ------------------------------------------------------------- Hero */}
        <Hero
          image={{ src: contactHero.image.src, alt: '' }}
          stats={[
            { value: `${yearsActive}`, label: 'Years of unbroken praise' },
            { value: `${eventConfig.durationHours} hours`, label: `In the ${eventConfig.edition} edition` },
            { value: 'Many nations', label: 'Joining in person and online' },
          ]}
        >
          <div className="mx-auto max-w-3xl text-left sm:text-center">
            <nav aria-label="Breadcrumb">
              <ol className="flex items-center gap-2 text-sm text-white/75 sm:justify-center">
                <li>
                  <Link href="/" className="underline-offset-4 hover:text-white hover:underline">
                    Home
                  </Link>
                </li>
                <li aria-hidden>
                  <ChevronRight className="size-4" />
                </li>
                <li aria-current="page" className="text-white">
                  Contact
                </li>
              </ol>
            </nav>

            <p
              data-hero-badge
              className="mt-6 inline-flex rounded-pill bg-primary px-4 py-1.5 font-display text-sm font-bold uppercase tracking-wide text-white"
            >
              {contactHero.eyebrow}
            </p>

            {/* Each line is its own block so the timeline can raise them in
                sequence. The trailing space matters: without it the accessible
                name concatenates the lines into one run-on word. */}
            <h1 className="mt-5 text-4xl text-white sm:text-5xl lg:text-6xl">
              {contactHero.heading.split(' with ').map((line, index) => (
                <span key={line} className="block overflow-hidden pb-1">
                  <span data-hero-line className="block">
                    {index === 0 ? `${line} with ` : line}
                  </span>
                </span>
              ))}
            </h1>

            <p data-hero-standfirst className="mt-6 text-lg text-white/85 sm:mx-auto sm:max-w-2xl">
              {contactHero.standfirst}
            </p>

            {/* Volunteer is filled even here: the page's own task (writing a
                message) is the outline, because recruiting is the product goal
                and a contact page is where many people arrive undecided. */}
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <VolunteerCta data-hero-cta="" />
              <a
                data-hero-cta
                href="#send-message"
                className={buttonClass({ variant: 'outlineOnDark', size: 'lg' })}
              >
                <Send aria-hidden className="size-4" />
                Send a message
              </a>
            </div>
          </div>
        </Hero>

        {/* ------------------------------------------------------ Trust band */}
        <section className="border-b border-line bg-surface-sunken" aria-labelledby="trust-heading">
          <div className="container-content py-10">
            <h2 id="trust-heading" className="sr-only">
              MMPraise at a glance
            </h2>
            <dl className="flex flex-wrap justify-center gap-x-16 gap-y-8 text-center sm:gap-x-24">
              <ReachFigure value={yearsActive} label="Years active" />
              <ReachFigure value={eventConfig.durationHours} label="Hours of praise" suffix=" hrs" />
              <ReachFigure value={eventConfig.foundedYear} label="Running since" animate={false} />
            </dl>
          </div>
        </section>

        {/* ---------------------------------------------------------- Details */}
        <section className="section" aria-labelledby="details-heading">
          <div className="container-content">
            <div className="max-w-2xl">
              <Eyebrow>{contactDetails.eyebrow}</Eyebrow>
              <h2 id="details-heading" className="mt-4 text-3xl sm:text-4xl">
                {contactDetails.heading}
              </h2>
            </div>

            <RevealStagger as="ul" className="mt-10 grid gap-6 md:grid-cols-3" selector=":scope > li">
              {contactDetails.items
                // A detail with no confirmed value is omitted rather than shown
                // as a placeholder, which is what the current footer does.
                .filter((detail) => detail.value)
                .map((detail) => {
                  const Icon = DETAIL_ICONS[detail.icon]
                  const href =
                    detail.id === 'phone' ? phoneHref(detail.value!) : detail.href
                  return (
                    <li key={detail.id}>
                      <Card className="card-lift h-full">
                        <CardBody>
                          <span className="inline-flex size-11 items-center justify-center rounded-card bg-primary/10 text-primary-active">
                            <Icon aria-hidden className="size-5" />
                          </span>
                          <h3 className="mt-4 text-xl">{detail.title}</h3>
                          {href ? (
                            <a
                              href={href}
                              {...(detail.external
                                ? { target: '_blank', rel: 'noopener noreferrer' }
                                : {})}
                              className="mt-2 inline-block font-semibold text-primary-active underline-offset-4 hover:underline"
                            >
                              {detail.value}
                              {detail.external && (
                                <span className="sr-only"> (opens in a new tab)</span>
                              )}
                            </a>
                          ) : (
                            <p className="mt-2 font-semibold text-ink">{detail.value}</p>
                          )}
                          <p className="mt-2 text-sm text-muted">{detail.note}</p>
                        </CardBody>
                      </Card>
                    </li>
                  )
                })}
            </RevealStagger>

            <div className="mt-10">
              <h3 className="text-xl">Find the venue</h3>
              <p className="mt-2 max-w-2xl text-body">
                The marathon is held at {contact.visitAddress}.
              </p>
              <div className="mt-4">
                <MapEmbed
                  address={contact.visitAddress}
                  mapUrl={contact.visitMapUrl}
                  embedUrl={embedUrl}
                />
              </div>
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- Channels */}
        <section
          className="border-y border-line bg-surface-sunken"
          aria-labelledby="channels-heading"
        >
          <div className="container-content section">
            <div className="max-w-2xl">
              <Eyebrow>{contactChannels.eyebrow}</Eyebrow>
              <h2 id="channels-heading" className="mt-4 text-3xl sm:text-4xl">
                {contactChannels.heading}
              </h2>
              <p className="mt-4 text-body">{contactChannels.standfirst}</p>
            </div>

            <RevealStagger as="ul" className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" selector=":scope > li">
              {liveChannels.map((channel) => {
                const Icon = CHANNEL_ICONS[channel.icon]
                const href = channel.href!
                const external = isExternal(href)
                return (
                  <li key={channel.id}>
                    <Card className="card-lift h-full">
                      <CardBody className="flex h-full flex-col">
                        <span className="inline-flex size-11 items-center justify-center rounded-card bg-primary/10 text-primary-active">
                          <Icon aria-hidden className="size-5" />
                        </span>
                        <h3 className="mt-4 text-xl">{channel.title}</h3>
                        <p className="mt-2 grow text-body">{channel.description}</p>

                        {/* An in-page jump is an anchor, not a router link. */}
                        {channel.onThisPage ? (
                          <a
                            href={href}
                            className="mt-4 inline-flex items-center gap-2 self-start font-semibold text-primary-active underline-offset-4 hover:underline"
                          >
                            {channel.linkLabel}
                            <ArrowRight aria-hidden className="size-4" />
                          </a>
                        ) : (
                          <Link
                            href={href}
                            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                            className="mt-4 inline-flex items-center gap-2 self-start font-semibold text-primary-active underline-offset-4 hover:underline"
                          >
                            {channel.linkLabel}
                            <ArrowRight aria-hidden className="size-4" />
                            {external && <span className="sr-only"> (opens in a new tab)</span>}
                          </Link>
                        )}
                      </CardBody>
                    </Card>
                  </li>
                )
              })}
            </RevealStagger>
          </div>
        </section>

        {/* ------------------------------------------------------------- Form */}
        <section className="section" aria-labelledby="send-message-heading" id="send-message">
          <div className="container-content grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div>
              <Eyebrow>Send a message</Eyebrow>
              <h2 id="send-message-heading" className="mt-4 text-3xl sm:text-4xl">
                Write to the MMPraise team
              </h2>
              <p className="mt-4 max-w-prose text-body">
                Tell us what your message is about and it reaches the right team. Everything marked
                required must be filled in before the message can be sent.
              </p>

              <div className="mt-8 max-w-2xl">
                <ContactForm />
              </div>
            </div>

            <aside className="lg:pt-24">
              <Card>
                <CardBody>
                  <h3 className="text-lg">Before you write</h3>
                  <ul className="mt-4 space-y-3 text-sm text-body">
                    <li>
                      Volunteering is an{' '}
                      <Link
                        href={links.volunteer}
                        className="font-semibold text-primary-active underline underline-offset-4"
                      >
                        application
                      </Link>
                      , not a message — it asks which department you want to join.
                    </li>
                    <li>
                      Registering to attend is{' '}
                      <Link
                        href={links.register}
                        className="font-semibold text-primary-active underline underline-offset-4"
                      >
                        a separate form
                      </Link>{' '}
                      and takes about five minutes.
                    </li>
                    <li>
                      Your message is never published. Only the MMPraise team can read it.
                    </li>
                  </ul>
                </CardBody>
              </Card>
            </aside>
          </div>
        </section>

        {/* -------------------------------------------------------- Volunteer */}
        <section className="bg-night text-white" aria-labelledby="volunteer-heading">
          <div className="container-content section grid items-center gap-12 lg:grid-cols-2">
            <Reveal>
              <p className="inline-flex rounded-pill bg-primary px-3 py-1 font-display text-xs font-bold uppercase tracking-wide text-white">
                {contactVolunteer.eyebrow}
              </p>
              <h2 id="volunteer-heading" className="mt-5 text-3xl text-white sm:text-4xl">
                {contactVolunteer.heading}
              </h2>
              {contactVolunteer.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-4 text-white/85">
                  {paragraph}
                </p>
              ))}
              <Link
                href={contactVolunteer.href}
                className={buttonClass({ size: 'lg', className: 'mt-8' })}
              >
                <HandHeart aria-hidden className="size-4" />
                {contactVolunteer.ctaLabel}
              </Link>
            </Reveal>

            <Reveal delay={0.15}>
              <Image
                src="/landing/activity-volunteer.webp"
                alt="Volunteers serving during Marathon Messiah’s Praise"
                width={720}
                height={480}
                loading="lazy"
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="h-auto w-full rounded-card border border-white/12 object-cover"
              />
            </Reveal>
          </div>
        </section>

        {/* ----------------------------------------------------------- Social */}
        {socialLinks.length > 0 && (
          <section className="section" aria-labelledby="social-heading">
            <div className="container-content max-w-3xl text-center">
              <Eyebrow>Follow MMPraise</Eyebrow>
              <h2 id="social-heading" className="mt-4 text-3xl sm:text-4xl">
                Keep up between editions
              </h2>
              <p className="mt-4 text-body">
                Ministrations, highlights and announcements as they happen.
              </p>

              {/* Only profiles with a confirmed URL render, so there are never
                  dead social icons — the current site lists five networks as
                  plain text with no links at all. */}
              <RevealStagger
                as="ul"
                className="mt-10 flex flex-wrap justify-center gap-4"
                selector=":scope > li"
              >
                {socialLinks.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="card-lift flex min-w-44 flex-col items-center gap-1 rounded-card border border-line bg-surface px-6 py-5"
                    >
                      <span className="font-display text-lg font-bold uppercase text-ink">
                        {social.label}
                      </span>
                      {social.handle && (
                        <span className="text-sm text-muted">{social.handle}</span>
                      )}
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </li>
                ))}
              </RevealStagger>
            </div>
          </section>
        )}

        {/* -------------------------------------------------------------- FAQ */}
        <section className="section" aria-labelledby="faq-heading">
          <div className="container-content max-w-3xl">
            <Eyebrow>Common questions</Eyebrow>
            <h2 id="faq-heading" className="mt-4 text-3xl sm:text-4xl">
              Frequently asked
            </h2>

            {/*
              Radix accordion: roving arrow-key focus and correct aria wiring.
              Every answer stays in the HTML and is republished as FAQPage
              structured data, so a crawler still gets the content.
            */}
            <Accordion type="multiple" className="mt-8">
              {contactFaqs.map((faq) => (
                <AccordionItem key={faq.id} value={faq.id}>
                  <AccordionTrigger>{faq.question}</AccordionTrigger>
                  <AccordionContent>{faq.answer}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* ---------------------------------------------------------- Closing */}
        <section
          className="relative isolate overflow-hidden text-white"
          aria-labelledby="closing-heading"
        >
          {/* The page opens and closes on the same photographic register, so it
              reads as one piece rather than as a document that stops. */}
          <Image
            src="/landing/about-2016-congregation.webp"
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
              {contactClosing.heading}
            </h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-white/85">{contactClosing.body}</p>

            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <VolunteerCta />
              <RegisterCta onDark />
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
