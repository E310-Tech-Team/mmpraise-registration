import { expect, test } from '@playwright/test'
import { signIn } from './helpers'
import { clearRateLimits, unlockAccounts } from './rate-limit'
import { seedPreviousParticipant } from './seed-user'

/**
 * Previous participants as people, and the follow-up workflow on top.
 *
 * Each test seeds its own previous participant — an imported account that has
 * never signed in, with 2025 history and no application — so assertions never
 * depend on what the shared dev database happens to contain. No email is sent
 * by any test: the reminder dialog is exercised up to its counted preview only.
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@mmpraise.org'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026'

test.describe('previous participants — people and follow-up', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await clearRateLimits()
    await unlockAccounts()
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 30_000 })
  })

  test('finds a previous participant by name, as one person in the right stage', async ({ page }) => {
    const person = await seedPreviousParticipant()

    await page.goto(`/admin/previous-participants/people?q=${encodeURIComponent(person.lastName)}`)
    await expect(page.getByText(/^1 person match/)).toBeVisible({ timeout: 30_000 })

    const row = page.locator('tbody tr').filter({ hasText: person.lastName })
    await expect(row).toHaveCount(1)
    // Imported, never emailed, never signed in.
    await expect(row.getByText('Not yet invited')).toBeVisible()
    await expect(row.getByText('2025')).toBeVisible()
  })

  test('stage filters agree with the stage shown on each row', async ({ page }) => {
    const person = await seedPreviousParticipant()

    await page.goto(
      `/admin/previous-participants/people?stage=not_invited&q=${encodeURIComponent(person.lastName)}`,
    )
    await expect(page.locator('tbody tr').filter({ hasText: person.lastName })).toHaveCount(1)

    await page.goto(
      `/admin/previous-participants/people?stage=confirmed&q=${encodeURIComponent(person.lastName)}`,
    )
    await expect(page.getByText(/nobody matches/i)).toBeVisible({ timeout: 30_000 })
  })

  test('the detail page shows history, and a logged contact joins the timeline', async ({ page }) => {
    const person = await seedPreviousParticipant()

    await page.goto(`/admin/previous-participants/people/${person.id}`)
    await expect(page.getByRole('heading', { level: 1, name: new RegExp(person.lastName) })).toBeVisible()
    await expect(page.getByText(/nobody has logged contact/i)).toBeVisible()
    await expect(page.getByText(/no emails have been sent/i)).toBeVisible()

    await page.getByRole('button', { name: /^log contact$/i }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Outcome').selectOption('NEEDS_ASSISTANCE')
    await dialog.getByLabel(/notes/i).fill('Wants help choosing a department.')
    await dialog.getByRole('button', { name: /log against 1 person/i }).click()

    await expect(page.getByText(/wants help choosing a department/i)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Needs assistance').first()).toBeVisible()
  })

  test('a follow-up date in the past puts the person in the due queue', async ({ page }) => {
    const person = await seedPreviousParticipant()

    await page.goto(`/admin/previous-participants/people/${person.id}`)
    await page.getByRole('button', { name: /^log contact$/i }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Outcome').selectOption('AWAITING_RESPONSE')
    // Two days ago: overdue, therefore also due.
    const past = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 16)
    await dialog.getByLabel(/next follow-up/i).fill(past)
    await dialog.getByRole('button', { name: /log against 1 person/i }).click()
    await expect(page.getByText(/follow up/i).first()).toBeVisible({ timeout: 30_000 })

    await page.goto(
      `/admin/previous-participants/people?followup=overdue&q=${encodeURIComponent(person.lastName)}`,
    )
    await expect(page.locator('tbody tr').filter({ hasText: person.lastName })).toHaveCount(1, {
      timeout: 30_000,
    })
  })

  test('bulk logging states its exact count before acting', async ({ page }) => {
    const person = await seedPreviousParticipant()

    await page.goto(`/admin/previous-participants/people?q=${encodeURIComponent(person.lastName)}`)
    await page.getByRole('checkbox', { name: new RegExp(`select .*${person.lastName}`, 'i') }).check()
    await page.getByRole('button', { name: /log contact — 1 selected/i }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: /against 1 person/i })).toBeVisible()
    await expect(dialog.getByText(/only the rows you ticked/i)).toBeVisible()
    await dialog.getByRole('button', { name: /cancel/i }).click()
  })

  test('the reminder dialog previews an exact audience before anything sends', async ({ page }) => {
    await seedPreviousParticipant()

    await page.goto('/admin/previous-participants/people')
    await page.getByRole('button', { name: /remind unactivated accounts/i }).click()

    const dialog = page.getByRole('dialog')
    // The counted preview: a real number, the cooldown, and the re-check promise.
    await expect(dialog.getByText(/currently match/i)).toBeVisible({ timeout: 30_000 })
    await expect(dialog.getByText(/re-checked at the moment of sending/i)).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^send to \d+$/i })).toBeVisible()
    // Deliberately not clicked: tests never send mail. (The footer button —
    // the dialog's corner ✕ is also named "Close".)
    await dialog.getByText('Close', { exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('the people export carries the same filters as the screen', async ({ page }) => {
    const person = await seedPreviousParticipant()

    await page.goto(`/admin/previous-participants/people?q=${encodeURIComponent(person.lastName)}`)
    const exportLink = page.getByRole('link', { name: /export 1 as csv/i })
    await expect(exportLink).toHaveAttribute(
      'href',
      `/api/admin/previous-participants/export?q=${encodeURIComponent(person.lastName)}`,
    )

    const response = await page.request.get(await exportLink.getAttribute('href') as string)
    expect(response.status()).toBe(200)
    const csv = await response.text()
    // Header plus exactly this one person.
    expect(csv.trim().split('\r\n')).toHaveLength(2)
    expect(csv).toContain(person.email)
  })

  test('import rows and people are separate views with honest labels', async ({ page }) => {
    await page.goto('/admin/previous-participants/rows')
    await expect(page.getByText(/csv lines across every batch, not unique people/i)).toBeVisible()
    await page.getByRole('link', { name: /^people$/i }).click()
    await expect(page).toHaveURL(/\/previous-participants\/people/)
    await expect(page.getByText(/one row per person/i)).toBeVisible()
  })
})
