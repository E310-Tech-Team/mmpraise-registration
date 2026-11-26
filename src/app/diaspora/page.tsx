import type { Metadata } from 'next'
import { connection } from 'next/server'
import { eventConfig } from '@/config/site'
import { DiasporaExperience } from '@/components/diaspora/diaspora-experience'
import { getCountries } from '@/lib/reference'
import { DIASPORA_META } from '@/lib/validation/diaspora'

/**
 * The diaspora participation form.
 *
 * Served at the root of diaspora.mmpraise.org by a host rewrite in
 * next.config.ts, and also reachable at /diaspora on the main domain (which is
 * how it is opened in development).
 */
export const metadata: Metadata = {
  title: { absolute: DIASPORA_META.title },
  description: "Confirm your centre's participation in Marathon Messiah's Praise from the diaspora.",
  alternates: { canonical: 'https://diaspora.mmpraise.org' },
}

export default async function DiasporaPage() {
  // The country list comes from the database, so this must render per request:
  // prerendered at build time it would carry the build database's empty list.
  await connection()
  // Name for the answer, dial code for the WhatsApp fields, ISO code for the flag.
  const countries = (await getCountries()).map(({ name, phoneCode, iso2 }) => ({ name, phoneCode, iso2 }))

  return <DiasporaExperience countries={countries} editionName={eventConfig.editionName} />
}
