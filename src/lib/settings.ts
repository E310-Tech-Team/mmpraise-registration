import 'server-only'
import { cache } from 'react'
import { eventConfig } from '@/config/site'
import { db } from '@/lib/db'

/**
 * Application settings stored as key/value JSON so administrators can change
 * operational behaviour (registration open/closed, event dates, capacity policy)
 * without a deployment.
 */
export type SettingsMap = {
  registration_open: boolean
  registration_closed_message: string
  event_name: string
  event_dates: string[]
  support_email: string
  minor_age_ranges: string[]
  /** Days a person is left alone after ANY successful outreach email. */
  reminder_cooldown_days: number
  /** Hard cap on recipients per reminder run. */
  reminder_max_per_run: number
}

const DEFAULTS: SettingsMap = {
  registration_open: true,
  registration_closed_message: 'Volunteer registration is currently closed. Please check back soon.',
  /**
   * Derived from eventConfig rather than written out again.
   *
   * A second, hand-typed copy of the edition name is exactly how the login page
   * came to greet people with "84 Hours … 2026" long after the site had moved
   * on. An administrator can still override this row in Admin → Settings; the
   * default simply can no longer go stale on its own.
   */
  event_name: `${eventConfig.editionName} ${eventConfig.edition}`,
  event_dates: [],
  support_email: 'volunteers@mmpraise.org',
  minor_age_ranges: ['AGE_00_15'],
  reminder_cooldown_days: 7,
  reminder_max_per_run: 500,
}

export const getSettings = cache(async (): Promise<SettingsMap> => {
  const rows = await db.setting.findMany()
  const map = { ...DEFAULTS }
  for (const row of rows) {
    if (row.key in map) {
      ;(map as Record<string, unknown>)[row.key] = row.value
    }
  }
  return map
})

export async function getSetting<K extends keyof SettingsMap>(key: K): Promise<SettingsMap[K]> {
  return (await getSettings())[key]
}

export async function setSetting<K extends keyof SettingsMap>(key: K, value: SettingsMap[K]): Promise<void> {
  await db.setting.upsert({
    where: { key },
    update: { value: value as never },
    create: { key, value: value as never },
  })
}

/** Age ranges that require guardian consent. */
export async function isMinorAgeRange(ageRange: string | null | undefined): Promise<boolean> {
  if (!ageRange) return false
  const minors = await getSetting('minor_age_ranges')
  return minors.includes(ageRange)
}
