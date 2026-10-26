import AxeBuilder from '@axe-core/playwright'
import Papa from 'papaparse'
import { expect, test } from '@playwright/test'
import { signIn } from './helpers'
import { clearRateLimits, unlockAccounts } from './rate-limit'

/**
 * The admin command centre.
 *
 * Signs in as the seeded super administrator, so the run needs the seeded
 * database (`npm run db:seed`) — the same requirement every admin flow has.
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@mmpraise.org'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe!2026'

test.describe('admin overview', () => {
  test.beforeEach(async ({ page }) => {
    await clearRateLimits()
    await unlockAccounts()
    await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD)
    await expect(page).toHaveURL(/\/(dashboard|admin)/, { timeout: 30_000 })
    await page.goto('/admin')
    await expect(page.getByRole('heading', { level: 1, name: /overview/i })).toBeVisible({
      timeout: 30_000,
    })
  })

  test('opens with the needs-attention queue, then the event state', async ({ page }) => {
    // The first card answers "is anything on fire?" — either queues or the
    // all-clear sentence, never silence.
    const attention = page.getByRole('heading', { name: /needs attention/i })
    await expect(attention).toBeVisible()

    await expect(page.getByText(/registration (open|closed)/i)).toBeVisible()
    // The countdown is the shared clock at operational size, minutes not seconds.
    await expect(page.getByText(/days/i).first()).toBeVisible()
  })

  test('reports the two lifecycles separately', async ({ page }) => {
    /*
     * The registration/participation split, visible: one-time standing and
     * this edition's participation are different questions with different
     * numbers, and conflating them again on the dashboard would undo the model.
     */
    await expect(page.getByRole('heading', { name: /^registrations$/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /this edition \(\d{4}\)/i })).toBeVisible()
    await expect(page.getByText(/registered, not confirmed/i).first()).toBeVisible()
  })

  test('every actionable metric is a link to the view that resolves it', async ({ page }) => {
    // "Awaiting review" counts SUBMITTED and UNDER_REVIEW, so its link must
    // carry both — it used to open SUBMITTED only and undercount on arrival.
    await expect(
      page.getByRole('link', { name: /awaiting review/i }).first(),
    ).toHaveAttribute('href', /\/admin\/applications\?status=SUBMITTED,UNDER_REVIEW/)

    const hrefs = await page
      .locator('main a[href]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('href') ?? ''))
    for (const href of hrefs) {
      expect(href).not.toBe('#')
      expect(href).not.toBe('')
    }
  })

  test('shows migration and communications sections to a super administrator', async ({ page }) => {
    // Scoped to main: the sidebar has group headings with the same names.
    const main = page.locator('main')
    await expect(main.getByRole('heading', { name: /previous participants/i })).toBeVisible()
    await expect(main.getByRole('heading', { name: /communications/i })).toBeVisible()
    await expect(main.getByRole('heading', { name: /recent activity/i })).toBeVisible()
  })

  test('never shows department capacity anywhere', async ({ page }) => {
    const body = await page.locator('main').innerText()
    expect(body).not.toMatch(/\d+\s*\/\s*\d+ places/i)
    expect(body).not.toMatch(/\bfull\b/i)
    await expect(page.getByText(/departments have no cap/i)).toBeVisible()
  })


  /*
   * The drill-through. A distribution bar that reports a number and cannot
   * tell you who is behind it is a dead end, so each row links into the
   * applicant list with that filter applied.
   *
   * The count is the contract: both sides exclude DRAFT and both reach
   * department through this edition's participation, so the figure on the
   * card must be the figure on the list. A mismatch here means the two
   * queries have drifted apart, which is exactly the bug this asserts against.
   */
  test('every distribution row opens the volunteers behind it, and the count agrees', async ({
    page,
  }) => {
    const rows = page.locator(
      'a[href*="/admin/applications?departmentId="], a[href*="/admin/applications?countryId="], a[href*="/admin/applications?ageRange="]',
    )
    await expect(rows.first()).toBeVisible()

    const first = rows.first()
    // The bar is decorative, so the figure has to live in the accessible name.
    const label = await first.getAttribute('aria-label')
    expect(label).toMatch(/: \d+\. View these volunteers\./)
    const claimed = Number(/: (\d+)\./.exec(label ?? '')?.[1])
    expect(claimed).toBeGreaterThan(0)

    await first.click()
    await expect(page).toHaveURL(/\/admin\/applications\?/, { timeout: 30_000 })
    await expect(page.getByText(`${claimed} application`)).toBeVisible({ timeout: 30_000 })
  })

  test('a segment that cannot be filtered on is not offered as a link', async ({ page }) => {
    // An unknown country cannot be expressed as a filter, so it stays plain
    // text. ("No department yet" *can* now — `departmentId=none` — so it links.)
    const deadEnds = page.getByText(/^unknown$/i)
    for (const text of await deadEnds.all()) {
      await expect(text.locator('xpath=ancestor::a')).toHaveCount(0)
    }
  })

  /*
   * The contract of the whole dashboard, asserted figure by figure: a tile
   * saying N opens a list saying N, under the same permissions. Each tile's
   * predicate and its destination's predicate come from the same module, so a
   * failure here means they have drifted apart — the bug class this rework
   * exists to end.
   */
  test('every figure opens a list with the same count', async ({ page }) => {
    test.setTimeout(180_000)

    const tiles = await page.locator('main a[href]').evaluateAll((links) =>
      links
        .map((link) => {
          const value = link.querySelector('span.text-2xl')?.textContent?.trim()
          return { href: link.getAttribute('href') ?? '', value: value ? Number(value) : NaN }
        })
        .filter(
          (tile) =>
            !Number.isNaN(tile.value) &&
            (tile.href.startsWith('/admin/applications') ||
              tile.href.startsWith('/admin/previous-participants/people')),
        ),
    )
    expect(tiles.length).toBeGreaterThan(8)

    for (const tile of tiles) {
      await page.goto(tile.href)
      // The applications header prints the raw number; the people header
      // uses thousands separators. Each pattern matches its own page's form.
      const pattern = tile.href.startsWith('/admin/applications')
        ? new RegExp(`^${tile.value} applications? match`)
        : new RegExp(`^${tile.value.toLocaleString('en-US')} (people|person) match`)
      await expect(
        page.getByText(pattern),
        `${tile.href} should open ${tile.value}`,
      ).toBeVisible({ timeout: 30_000 })
    }
  })

  /*
   * Every Registrations tile downloads exactly its own people. Parsed with a
   * real CSV parser, not by counting lines: free-text answers can contain line
   * breaks inside quoted cells, and a line count would then over-report.
   */
  test('each registrations figure downloads a CSV of exactly that many people', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const downloads = await page
      .locator('main a[href^="/api/admin/export?format=csv"]')
      .evaluateAll((links) =>
        links.map((link) => ({
          href: link.getAttribute('href') ?? '',
          label: link.getAttribute('aria-label') ?? '',
        })),
      )
    // Total, Submitted, Draft at minimum on the seeded dev data.
    expect(downloads.length).toBeGreaterThanOrEqual(3)

    for (const { href, label } of downloads) {
      const claimed = Number(/the (\d+) /.exec(label)?.[1])
      const response = await page.request.get(href)
      expect(response.status(), href).toBe(200)
      const parsed = Papa.parse<string[]>((await response.text()).trim(), { skipEmptyLines: true })
      // One header row, then one row per person.
      expect(parsed.data.length - 1, `${label} → ${href}`).toBe(claimed)
    }
  })

  test('Total includes drafts, so it no longer opens the same list as Approved', async ({ page }) => {
    const totalHref = await page
      .getByRole('link', { name: /^total/i })
      .first()
      .getAttribute('href')
    expect(totalHref).toBe('/admin/applications?status=everyone')

    const draftExport = page.getByRole('link', { name: /download the \d+ draft as csv/i })
    if (await draftExport.count()) {
      const href = (await draftExport.getAttribute('href')) ?? ''
      const csv = await (await page.request.get(href)).text()
      const [header, ...rows] = Papa.parse<string[]>(csv.trim(), { skipEmptyLines: true }).data
      const progress = header.findIndex((cell) => cell.includes('Progress'))
      // The follow-up columns are present, and every row is a draft.
      expect(progress).toBeGreaterThan(-1)
      expect(header.some((cell) => cell === 'Last activity')).toBe(true)
      for (const row of rows) expect(row[progress]).toMatch(/^Draft — stopped at step \d/)
    }
  })

  test('percentages name their denominator', async ({ page }) => {
    // Never a bare "62%": every percentage on a tile says what it is a share of.
    const percents = await page
      .locator('main li span.text-xs')
      .evaluateAll((nodes) =>
        nodes.map((n) => n.textContent?.trim() ?? '').filter((t) => /(\d+%|N\/A)/.test(t)),
      )
    expect(percents.length).toBeGreaterThan(0)
    for (const text of percents) {
      expect(text).toMatch(/(\d+%|N\/A) (of |response rate)/)
    }
  })

  test('says when the figures were computed, and refreshes on request', async ({ page }) => {
    await expect(page.getByText(/updated \d{2} \w{3} \d{4}, \d{2}:\d{2} WAT/i)).toBeVisible()
    await page.getByRole('button', { name: /refresh/i }).click()
    await expect(page.getByRole('heading', { level: 1, name: /overview/i })).toBeVisible()
  })

  test('every chart has a keyboard-reachable table of linked records', async ({ page }) => {
    const tables = page.locator('main details summary', { hasText: /view as table/i })
    expect(await tables.count()).toBeGreaterThanOrEqual(2)
    await tables.first().click()
    await expect(page.locator('main details[open] table a').first()).toBeVisible()
  })

  test('has no detectable accessibility violations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/admin', { waitUntil: 'networkidle' })
    const results = await new AxeBuilder({ page }).analyze()
    expect(JSON.stringify(results.violations, null, 2)).toBe('[]')
  })

  test('has no horizontal overflow at any supported width', async ({ page }) => {
    for (const width of [320, 375, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/admin')
      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
      expect(overflows, `overflow at ${width}px`).toBe(false)
    }
  })
})
