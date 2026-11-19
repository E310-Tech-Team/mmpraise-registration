import Link from 'next/link'
import { LayoutDashboard, LogOut, Mail, Settings, ShieldCheck } from 'lucide-react'
import { unreadMessageCount } from '@/lib/messages/service'
import { signOutAction } from '@/app/(auth)/actions'
import { Logo } from '@/components/ui/primitives'
import { isAdmin } from '@/lib/auth/rbac'
import type { SessionUser } from '@/lib/auth/session'
import { initials } from '@/lib/utils'

/**
 * Application header for signed-in screens.
 *
 * Labels use `sr-only sm:not-sr-only` rather than `hidden sm:inline`: hiding the
 * text on small screens would leave icon-only controls with no accessible name.
 */
export async function AppHeader({ user }: { user: SessionUser }) {
  const unread = await unreadMessageCount(user.id)

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/dashboard" aria-label="MMPraise Volunteers dashboard">
          <Logo />
        </Link>

        <nav aria-label="Main" className="flex flex-wrap items-center gap-1 sm:gap-2">
          <Link
            href="/dashboard"
            className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold text-body hover:bg-surface-sunken"
          >
            <LayoutDashboard aria-hidden className="size-4" />
            <span className="sr-only sm:not-sr-only">Dashboard</span>
          </Link>

          <Link
            href="/dashboard/messages"
            className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold text-body hover:bg-surface-sunken"
          >
            <Mail aria-hidden className="size-4" />
            <span className="sr-only sm:not-sr-only">Messages</span>
            {unread > 0 && (
              <span className="inline-flex min-w-5 items-center justify-center rounded-pill bg-primary px-1.5 text-xs font-bold text-white">
                {unread > 99 ? '99+' : unread}
                <span className="sr-only"> unread</span>
              </span>
            )}
          </Link>

          <Link
            href="/dashboard/account"
            className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold text-body hover:bg-surface-sunken"
          >
            <Settings aria-hidden className="size-4" />
            <span className="sr-only sm:not-sr-only">Account</span>
          </Link>

          {isAdmin(user) && (
            <Link
              href="/admin"
              className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold text-primary hover:bg-primary-subtle"
            >
              <ShieldCheck aria-hidden className="size-4" />
              <span className="sr-only sm:not-sr-only">Admin</span>
            </Link>
          )}

          <span className="mx-1 hidden h-6 w-px bg-line sm:block" aria-hidden />

          <span className="flex items-center gap-2">
            {user.photoDocumentId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/files/${user.photoDocumentId}`}
                alt=""
                className="size-8 rounded-full border border-line object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-white"
              >
                {initials(user.firstName, user.lastName)}
              </span>
            )}
            <span className="hidden text-sm font-medium text-ink md:inline">
              {user.firstName ?? user.username}
            </span>
          </span>

          <form action={signOutAction}>
            <button
              type="submit"
              className="inline-flex min-h-11 items-center gap-2 rounded-pill px-3 py-2 text-sm font-semibold text-body hover:bg-surface-sunken"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </button>
          </form>
        </nav>
      </div>
    </header>
  )
}
