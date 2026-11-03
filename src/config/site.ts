import { destination } from './features'

/**
 * Single source of truth for event facts and external destinations.
 *
 * Everything here is either read from an environment variable or carries a
 * documented default, so the organisation can change dates, venues and URLs
 * without a code change. Values marked TODO(verify) were inconsistent on the
 * current WordPress homepage and need confirmation — see docs/HOMEPAGE-AUDIT.md.
 *
 * Client Components read this too, so it must not import anything server-only.
 */

function env(key: string, fallback: string): string {
  const value = process.env[key]
  return value && value.trim().length > 0 ? value.trim() : fallback
}

function optionalEnv(key: string): string | null {
  const value = process.env[key]
  return value && value.trim().length > 0 ? value.trim() : null
}

export const siteConfig = {
  name: 'Marathon Messiah’s Praise',
  shortName: 'MMPraise',
  url: env('NEXT_PUBLIC_SITE_URL', 'https://mmpraise.org'),
  description:
    'Marathon Messiah’s Praise is an annual global gospel event where worshippers from many nations gather to praise God without stopping. Attend in person, watch online, volunteer or give.',
  locale: 'en_NG',
} as const

/**
 * The current edition — the single source of truth.
 *
 * Every page, email, export and structured-data node reads the duration, year,
 * start time and venue from here. Nothing restates them: the "84 Hours … 2026"
 * that used to greet people on the login page came from a second copy of this
 * information living in the database, and one copy is the only way that cannot
 * happen again.
 */
export const eventConfig = {
  /** The duration increases by one hour each year: 2026 ran 84, 2027 runs 85. */
  durationHours: Number(env('NEXT_PUBLIC_EVENT_DURATION_HOURS', '85')),

  edition: env('NEXT_PUBLIC_EVENT_EDITION', '2027'),

  /** "85 Hours Marathon Messiah's Praise" — the edition's own name. */
  get editionName(): string {
    return `${this.durationHours} Hours ${siteConfig.name}`
  },

  /** "85 Hours · 2027 edition" — the compact badge form. */
  get editionLabel(): string {
    return `${this.durationHours} Hours · ${this.edition} edition`
  },

  /**
   * Confirmed start: Monday 1 March 2027, 02:00 West Africa Time.
   *
   * Stored as ISO 8601 **with its offset**. Parsing "March 1, 2027 2:00 AM"
   * would be interpreted in the reader's own timezone, so someone in London
   * would see a different start than someone in Lagos — the offset is what
   * makes the instant unambiguous.
   */
  startsAt: env('NEXT_PUBLIC_EVENT_STARTS_AT', '2027-03-01T02:00:00+01:00'),

  /** Authoritative for every displayed date and time, whatever the visitor's. */
  timezone: 'Africa/Lagos',
  timezoneLabel: 'WAT',

  /** Derived from startsAt + durationHours unless overridden. */
  endsAtOverride: optionalEnv('NEXT_PUBLIC_EVENT_ENDS_AT'),

  venue: {
    name: env('NEXT_PUBLIC_EVENT_VENUE', 'RCCG Prayer Foyer, New Arena'),
    address: env('NEXT_PUBLIC_EVENT_VENUE_ADDRESS', 'Redemption City, Nigeria'),
    city: 'Redemption City',
    country: 'Nigeria',
    fullAddress: 'RCCG Prayer Foyer, New Arena, Redemption City, Nigeria',
    mapUrl: env(
      'NEXT_PUBLIC_EVENT_MAP_URL',
      'https://maps.google.com/?q=RCCG+Redemption+City+Prayer+Foyer',
    ),
  },

  admission: 'Free and open to everyone',

  /** TODO(verify): prose says 82 nations; the map graphic still reads "80 Countries". */
  nationsCount: Number(env('NEXT_PUBLIC_EVENT_NATIONS', '82')),

  /** TODO(verify): no theme was published on the current homepage. */
  theme: optionalEnv('NEXT_PUBLIC_EVENT_THEME'),

  foundedYear: 2012,
  foundedNote:
    'Birthed on 2 March 2012 to celebrate God’s faithfulness in the life of Pastor E. A. Adeboye, General Overseer of the Redeemed Christian Church of God.',
} as const

/**
 * Destinations.
 *
 * Registration and volunteering point at this application's own routes so the
 * two systems behave as one product; they are always live.
 *
 * Everything else is wrapped in `destination(...)`, which returns null while
 * that feature is still being built — see src/config/features.ts. A null here
 * is rendered as "Coming soon" rather than as a dead link.
 */
export const links = {
  // Always live: registration cannot receive applications without these.
  register: env('NEXT_PUBLIC_REGISTRATION_URL', '/register'),
  volunteer: env('NEXT_PUBLIC_VOLUNTEER_URL', '/login'),
  shareTestimony: '/#share-testimony',

  // Gated behind launch flags.
  /**
   * A route in this application, not the old WordPress page — so it opens in
   * the same tab and carries the same header, footer and design system.
   */
  about: destination('about', env('NEXT_PUBLIC_ABOUT_URL', '/about')),
  donation: destination('give', env('NEXT_PUBLIC_DONATION_URL', 'https://mmpraise.org/donate/')),
  livestream: destination(
    'livestream',
    env('NEXT_PUBLIC_LIVESTREAM_URL', 'https://www.youtube.com/@themmpraise'),
  ),
  youtube: destination('livestream', env('NEXT_PUBLIC_YOUTUBE_URL', 'https://www.youtube.com/@themmpraise')),
  radio: destination('radio', optionalEnv('NEXT_PUBLIC_RADIO_URL')),
  magazine: destination('magazine', optionalEnv('NEXT_PUBLIC_MAGAZINE_URL')),
  blog: destination('blog', env('NEXT_PUBLIC_BLOG_URL', 'https://mmpraise.org/blog/')),
  gallery: destination('gallery', env('NEXT_PUBLIC_GALLERY_URL', 'https://mmpraise.org/gallery/')),
  prayerRequest: destination(
    'prayerRequest',
    env('NEXT_PUBLIC_PRAYER_REQUEST_URL', 'https://mmpraise.org/prayer-request/'),
  ),
  /** A route in this application, not the old WordPress page. */
  contact: destination('contact', env('NEXT_PUBLIC_CONTACT_URL', '/contact')),
} as const

/**
 * The single source of contact detail for every page.
 *
 * The current site contradicts itself: the contact page publishes a real
 * telephone number and a Redemption Camp address, while the footer on the very
 * same page publishes the placeholder "+234 XXX-XXXX-XXX" and a Lagos HQ
 * address. The real number is used everywhere here, and the two addresses are
 * modelled as what they appear to be — a place to visit and a postal HQ —
 * rather than one silently overwriting the other.
 *
 * TODO(verify): confirm the postal address, and whether the Lagos HQ is still
 * current. See docs/CONTACT-AUDIT.md.
 */
export const contact = {
  email: env('NEXT_PUBLIC_CONTACT_EMAIL', 'info@mmpraise.org'),

  /** Published on the contact page of the current site. */
  phone: optionalEnv('NEXT_PUBLIC_CONTACT_PHONE') ?? '+234 703 385 3817',

  /** Postal / organisational address, as published in the footer. */
  address: env('NEXT_PUBLIC_CONTACT_ADDRESS', 'Marathon Messiah’s Praise HQ, Lagos, Nigeria'),
  addressMapUrl: 'https://maps.google.com/?q=Marathon+Messiah%27s+Praise+HQ,+Lagos,+Nigeria',

  /** Where visitors are told to come, as published on the contact page. */
  visitAddress: env(
    'NEXT_PUBLIC_VISIT_ADDRESS',
    'MMPraise, Redemption Camp, Ogun State, Nigeria',
  ),
  visitMapUrl: env(
    'NEXT_PUBLIC_VISIT_MAP_URL',
    'https://maps.google.com/?q=Redemption+Camp,+Ogun+State,+Nigeria',
  ),
} as const

/**
 * A telephone number in E.164, for `tel:` links and structured data. Display
 * keeps the spaced form, which is easier to read and to dictate.
 */
export function phoneHref(value: string): string {
  return `tel:${value.replace(/[^\d+]/g, '')}`
}

/**
 * Social profiles. The current footer lists these networks as plain text with no
 * links at all, so only YouTube is confirmed. The rest render only once a URL is
 * supplied — no dead icons.
 */
export const socialLinks = [
  { label: 'YouTube', href: links.youtube, handle: '@themmpraise' as string | null },
  { label: 'Facebook', href: optionalEnv('NEXT_PUBLIC_FACEBOOK_URL'), handle: null },
  { label: 'Instagram', href: optionalEnv('NEXT_PUBLIC_INSTAGRAM_URL'), handle: null },
  { label: 'X', href: optionalEnv('NEXT_PUBLIC_X_URL'), handle: null },
  { label: 'TikTok', href: optionalEnv('NEXT_PUBLIC_TIKTOK_URL'), handle: null },
].filter((social): social is { label: string; href: string; handle: string | null } =>
  Boolean(social.href),
)

/** True once a start date has been confirmed and configured. */
export function isEventScheduled(): boolean {
  if (!eventConfig.startsAt) return false
  return !Number.isNaN(new Date(eventConfig.startsAt).getTime())
}

/** Confirmed start, or null while the date is still to be announced. */
export function eventStartsAt(): Date | null {
  if (!isEventScheduled()) return null
  return new Date(eventConfig.startsAt!)
}

/** Absolute end of the event, used by the countdown's completed state. */
export function eventEndsAt(): Date | null {
  if (eventConfig.endsAtOverride) return new Date(eventConfig.endsAtOverride)
  const start = eventStartsAt()
  if (!start) return null
  return new Date(start.getTime() + eventConfig.durationHours * 3_600_000)
}

/**
 * Where the event stands at a given instant.
 *
 * The same four states the countdown uses, derived from a `Date` the caller
 * supplies rather than from the clock — so a Server Component can decide what
 * to say without pulling in the client-side ticker, and a test can drive it to
 * any point in the event's life.
 */
export function eventStateAt(now: Date): 'unscheduled' | 'upcoming' | 'live' | 'completed' {
  const start = eventStartsAt()
  const end = eventEndsAt()
  if (!start || !end) return 'unscheduled'
  if (now.getTime() >= end.getTime()) return 'completed'
  if (now.getTime() >= start.getTime()) return 'live'
  return 'upcoming'
}

/**
 * Whole days from `now` to the first hour of praise, or null while the date is
 * unconfirmed. Never negative — once the event has begun there are none left.
 */
export function daysUntilEventAt(now: Date): number | null {
  const start = eventStartsAt()
  if (!start) return null
  const diff = start.getTime() - now.getTime()
  if (diff <= 0) return 0
  return Math.ceil(diff / 86_400_000)
}

/** True when a URL leaves this application. */
export function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href)
}

/**
 * Event date and time formatting.
 *
 * Every one of these pins `timeZone` to Africa/Lagos. Without it the same
 * instant renders as 2:00 AM in Lagos and 1:00 AM in London, and a volunteer
 * abroad would arrive an hour early — the event begins at 2:00 AM WAT for
 * everyone, wherever they are reading.
 */
const LOCALE = 'en-GB'

/** "Monday, 1 March 2027" */
export function formatEventDateLong(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: eventConfig.timezone,
  }).format(date)
}

/** "1 March 2027" */
export function formatEventDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: eventConfig.timezone,
  }).format(date)
}

/** "2:00 AM WAT" */
export function formatEventTime(date: Date): string {
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: eventConfig.timezone,
  }).format(date)
  return `${time} ${eventConfig.timezoneLabel}`
}

/** "1 March 2027 · 2:00 AM WAT" */
export function formatEventDateTime(date: Date): string {
  return `${formatEventDate(date)} · ${formatEventTime(date)}`
}

/**
 * The full sentence a screen reader hears, and the fallback anyone sees before
 * the countdown has initialised. "West Africa Time" is spelled out because
 * "WAT" is read as a word rather than as an abbreviation.
 */
export function eventSummarySentence(): string {
  const start = eventStartsAt()
  if (!start) return `The ${eventConfig.editionName} date will be announced soon.`
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: eventConfig.timezone,
  }).format(start)
  return `The ${eventConfig.editionName} begins on ${formatEventDateLong(start)} at ${time} West Africa Time.`
}
