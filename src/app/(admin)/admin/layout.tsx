import Link from 'next/link'
import { AppHeader } from '@/components/layout/app-header'
import { visibleNav } from '@/components/admin/admin-nav'
import { requireAdmin } from '@/lib/auth/rbac'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin()

  const groups = visibleNav(user)

  return (
    <div className="flex min-h-dvh flex-col bg-surface-sunken">
      <AppHeader user={user} />

      <div className="mx-auto flex w-full max-w-[100rem] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row">
        {/*
          `min-w-0` is load-bearing.

          A flex item defaults to `min-width: auto`, which is its content width —
          so the scrolling list below never shrank, the nav grew to 1577px and
          the whole page scrolled sideways on a phone. The overflow container
          can only do its job once the item is allowed to be narrower than what
          it holds.
        */}
        <nav aria-label="Administration" className="min-w-0 lg:w-64 lg:shrink-0">
          {/*
            Horizontally scrolling on narrow screens, stacked from `lg`. The
            group headings are hidden while it scrolls — six headings in a
            single scrolling row is noise — but stay in the accessible tree so
            the structure is announced either way.
          */}
          {/*
            `relative` is load-bearing too, for a subtler reason.

            The group headings are `sr-only`, which is `position: absolute`. An
            overflow ancestor only clips absolutely positioned descendants when
            it is itself positioned — so with a static container each hidden
            heading escaped the scroll box and sat at its natural x offset,
            which for the last group is past 1500px. Six 1px headings were
            enough to make the whole document that wide.
          */}
          <ul className="relative flex gap-4 overflow-x-auto lg:flex-col lg:gap-5 lg:overflow-visible">
            {groups.map((group) => (
              <li key={group.title} className="shrink-0 lg:shrink">
                <h2 className="sr-only px-3 lg:not-sr-only lg:mb-1 lg:text-xs lg:tracking-wide lg:text-muted">
                  {group.title}
                </h2>
                <ul className="flex gap-1 lg:flex-col">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-field px-3 py-2 text-sm font-semibold text-body hover:bg-surface"
                      >
                        <item.icon aria-hidden className="size-4 shrink-0 text-primary" />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  )
}
