import type { Metadata, Viewport } from 'next'
import { Afacad, Figtree } from 'next/font/google'
import { eventConfig, siteConfig } from '@/config/site'
import './globals.css'

/**
 * Typefaces match mmpraise.org: Afacad for display/headings, Figtree for body copy.
 * next/font self-hosts them, so there is no render-blocking request to Google.
 */
const afacad = Afacad({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-afacad',
  display: 'swap',
})

const figtree = Figtree({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-figtree',
  display: 'swap',
})

export const metadata: Metadata = {
  // Makes Open Graph and Twitter image URLs absolute.
  metadataBase: new URL(siteConfig.url),
  title: {
    default: 'MMPraise Volunteer Registration',
    template: '%s · MMPraise Volunteers',
  },
  description:
    `Register to volunteer at the ${eventConfig.editionName} — join a department, tell us how you can serve, and manage your volunteer profile.`,
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1c0d0a',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${afacad.variable} ${figtree.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-surface text-body" suppressHydrationWarning>
        <a
          href="#main"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-field bg-ink px-4 py-2 text-sm font-semibold text-white"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  )
}
