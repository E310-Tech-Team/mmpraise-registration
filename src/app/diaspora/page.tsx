import type { Metadata } from 'next'
import { connection } from 'next/server'
import { eventConfig } from '@/config/site'
import { DiasporaForm } from '@/components/diaspora/diaspora-form'
import { Logo } from '@/components/ui/primitives'
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
  description: "Affirm your centre's participation in Marathon Messiah's Praise from the diaspora.",
  alternates: { canonical: 'https://diaspora.mmpraise.org' },
}

export default async function DiasporaPage() {
  // The country list comes from the database, so this must render per request:
  // prerendered at build time it would carry the build database's empty list.
  await connection()
  // Name for the answer, dial code for the WhatsApp fields, ISO code for the flag.
  const countries = (await getCountries()).map(({ name, phoneCode, iso2 }) => ({ name, phoneCode, iso2 }))

  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <header className="relative overflow-hidden bg-night text-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/global-map.webp"
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover opacity-30"
        />
        <div className="relative mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
          <Logo inverted subtitle="Diaspora" />
          <p className="max-w-xl text-sm leading-relaxed text-white/85">
            {eventConfig.editionName} · Global participation
          </p>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6 sm:py-12">
        <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-8">
          <DiasporaForm countries={countries} />
        </div>
      </main>

      <footer className="px-4 py-6 text-center text-xs text-muted sm:px-6">
        {`© ${new Date().getFullYear()} MMPraise · Marathon Messiah’s Praise`}
      </footer>
    </div>
  )
}
