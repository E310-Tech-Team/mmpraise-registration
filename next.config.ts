import type { NextConfig } from 'next'

/**
 * diaspora.mmpraise.org is this same app, not a second deployment: the shared
 * proxy sends that host here, and these rules decide what it sees.
 *
 * Done with config rewrites rather than a proxy.ts on purpose. A proxy file runs
 * on every request and buffers request bodies up to its own 10 MB cap, which
 * would quietly undercut the 13 MB upload limit below.
 */
const DIASPORA_HOST = [{ type: 'host' as const, value: 'diaspora\\..+' }]

/** Where anything else asked of the diaspora host is sent: the main site. */
const MAIN_SITE = (process.env.NEXT_PUBLIC_SITE_URL || 'https://mmpraise.org').replace(/\/+$/, '')

const nextConfig: NextConfig = {
  async rewrites() {
    return {
      beforeFiles: [{ source: '/', has: DIASPORA_HOST, destination: '/diaspora' }],
      afterFiles: [],
      fallback: [],
    }
  },

  async redirects() {
    return [
      {
        /*
         * Every page path except the form and the assets it loads. Without this
         * the whole site — sign-in included — would also answer on the diaspora
         * host, where the host-only session cookie does not apply.
         */
        source:
          '/:path((?!_next/|diaspora|landing/|logo\\.png|icon|apple-icon|favicon\\.ico|robots\\.txt).+)',
        has: DIASPORA_HOST,
        destination: `${MAIN_SITE}/:path`,
        permanent: false,
      },
    ]
  },

  /**
   * Emit a self-contained server in `.next/standalone` with only the modules it
   * actually imports. The Docker image then needs neither `node_modules` nor the
   * source tree, which takes the deployed image from roughly a gigabyte to a
   * couple of hundred megabytes — the difference between a comfortable and a
   * painful deploy on a small VPS.
   */
  output: 'standalone',

  experimental: {
    serverActions: {
      /**
       * Every upload in the app goes through a Server Action, and Next.js
       * refuses any action body over 1 MB unless told otherwise — before the
       * action runs, so the friendly size checks never get a say. That turned
       * away most phone photos, which the form says may be up to 5 MB.
       *
       * The largest upload is the previous-participants CSV import, capped at
       * 12 MB in its action. The extra megabyte is room for the multipart
       * framing around the file. Raise this with that cap, or with
       * MAX_UPLOAD_MB if it ever goes above 12. It is read at build time, so an
       * environment variable cannot change it on a running server.
       */
      bodySizeLimit: '13mb',
    },
  },

  /**
   * No `images.remotePatterns`: every homepage asset is served from
   * /public/landing, so the site never depends on the old WordPress host being
   * reachable. A unit test asserts that no image URL points at mmpraise.org.
   * Adding a pattern back would re-open that dependency.
   */
}

export default nextConfig
