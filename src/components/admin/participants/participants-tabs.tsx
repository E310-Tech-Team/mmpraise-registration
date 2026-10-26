import Link from 'next/link'
import { buttonClass } from '@/components/ui/primitives'

/**
 * The previous-participants area, by what the administrator is working on:
 * People (who has responded, who to chase), Imports (files and batches), and
 * Import rows (CSV-line troubleshooting).
 */
export function ParticipantsTabs({ active }: { active: 'people' | 'batches' | 'rows' }) {
  const tabs = [
    { key: 'people', label: 'People', href: '/admin/previous-participants/people' },
    { key: 'batches', label: 'Imports', href: '/admin/previous-participants' },
    { key: 'rows', label: 'Import rows', href: '/admin/previous-participants/rows' },
  ] as const

  return (
    <nav aria-label="Previous participants sections" className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          aria-current={active === tab.key ? 'page' : undefined}
          className={buttonClass({ variant: active === tab.key ? 'primary' : 'ghost', size: 'sm' })}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
