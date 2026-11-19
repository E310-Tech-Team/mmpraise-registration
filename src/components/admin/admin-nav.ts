import 'server-only'
import {
  BarChart3,
  Building2,
  ClipboardList,
  FileClock,
  Globe,
  Globe2,
  History,
  Inbox,
  Megaphone,
  Send,
  MessageSquareQuote,
  Settings,
  Users,
} from 'lucide-react'
import { APPLICANT_VIEW_PERMISSIONS, can, type Permission } from '@/lib/auth/rbac'
import type { SessionUser } from '@/lib/auth/session'

/**
 * Administration shell.
 *
 * Navigation is filtered by permission so an administrator is never shown a link
 * they cannot use. Each page re-checks its own permission — the nav is a
 * convenience, never the access control.
 */
/** `permission` may list several: holding any one of them shows the item. */
export type NavItem = { href: string; label: string; icon: typeof Users; permission: Permission | readonly Permission[] }

/**
 * Grouped navigation.
 *
 * The flat list this replaced put "Reference data" — RCCG regions and parishes,
 * edited perhaps twice a year — at the same level as the applicant queue, which
 * is opened every day. Grouping restores the difference between what an
 * administrator *does* and what they *configure*, and frees the top level for
 * Previous participants, which is daily work during a migration.
 */
export const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [{ href: '/admin', label: 'Dashboard', icon: BarChart3, permission: 'application:review' }],
  },
  {
    title: 'Applications',
    items: [
      {
        href: '/admin/applications',
        label: 'Applicants',
        icon: Users,
        // Viewing, not reviewing: see APPLICANT_VIEW_PERMISSIONS in rbac.ts.
        permission: APPLICANT_VIEW_PERMISSIONS,
      },
    ],
  },
  {
    title: 'People',
    items: [
      {
        href: '/admin/previous-participants',
        label: 'Previous participants',
        icon: History,
        permission: 'migration:view',
      },
      { href: '/admin/diaspora', label: 'Diaspora responses', icon: Globe, permission: 'diaspora:view' },
      { href: '/admin/users', label: 'Administrators', icon: Building2, permission: 'user:manage' },
    ],
  },
  {
    title: 'Communications',
    items: [
      { href: '/admin/messages', label: 'Messages', icon: Inbox, permission: 'application:review' },
      {
        href: '/admin/volunteer-messages',
        label: 'Direct messages',
        icon: Send,
        permission: 'volunteer:message',
      },
      {
        href: '/admin/announcements',
        label: 'Announcements',
        icon: Megaphone,
        permission: 'announcement:manage',
      },
    ],
  },
  {
    title: 'Content',
    items: [
      {
        href: '/admin/testimonies',
        label: 'Testimonies',
        icon: MessageSquareQuote,
        permission: 'application:review',
      },
    ],
  },
  {
    title: 'Configuration',
    items: [
      {
        href: '/admin/departments',
        label: 'Departments & questions',
        icon: ClipboardList,
        permission: 'question:manage',
      },
      { href: '/admin/settings', label: 'Settings', icon: Settings, permission: 'settings:manage' },
      /*
       * RCCG structure belongs under Settings per the audit, and will move
       * inside that page. Until it does it keeps a route of its own so the data
       * stays editable — a nav entry removed before its destination exists is
       * just a feature nobody can reach.
       */
      { href: '/admin/reference', label: 'RCCG structure', icon: Globe2, permission: 'reference:manage' },
    ],
  },
  {
    title: 'Activity and security',
    items: [{ href: '/admin/audit', label: 'Activity log', icon: FileClock, permission: 'audit:view' }],
  },
]

/** The navigation as this administrator may use it: unusable items and empty groups removed. */
export function visibleNav(user: SessionUser): { title: string; items: NavItem[] }[] {
  return NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      (typeof item.permission === 'string' ? [item.permission] : item.permission).some((p) => can(user, p)),
    ),
  })).filter((group) => group.items.length > 0)
}

/**
 * Where "Admin" should land for this administrator: the first section they may
 * open. Null when they can open none, which `requireAdmin` normally rules out.
 */
export function firstAdminHref(user: SessionUser): string | null {
  return visibleNav(user)[0]?.items[0]?.href ?? null
}
