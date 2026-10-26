import 'server-only'
import { NextResponse } from 'next/server'
import type { ApplicationFilters } from '@/lib/admin/queries'

/**
 * Serialisation shared by every administrative export.
 *
 * Extracted when the contact list arrived. Two routes writing their own CSV
 * quoting is two chances to get formula injection wrong, and the rule in this
 * codebase is one mechanism per job — the same reason there is one countdown
 * and one queue.
 */

export type ExportRow = (string | number | null | undefined)[]

/**
 * Neutralise spreadsheet formula injection.
 *
 * A cell beginning =, +, - or @ is executed by Excel when the file is opened,
 * so a value such as `=HYPERLINK(...)` typed into a name field becomes a live
 * formula in whatever machine opens the export.
 */
export function safeCell(value: string): string {
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`
  return value
}

export function csvEscape(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value)
  return `"${safeCell(raw).replace(/"/g, '""')}"`
}

/**
 * The filters an export understands, read from the query string.
 *
 * Shared with the on-screen list deliberately: an export that parsed its own
 * parameters could drift from what the administrator is looking at, and then a
 * download would no longer be "this list, as a file".
 */
export function filtersFromParams(url: URL): ApplicationFilters {
  return {
    q: url.searchParams.get('q') ?? undefined,
    status: url.searchParams.get('status') ?? undefined,
    departmentId: url.searchParams.get('departmentId') ?? undefined,
    countryId: url.searchParams.get('countryId') ?? undefined,
    stateId: url.searchParams.get('stateId') ?? undefined,
    churchRegionId: url.searchParams.get('churchRegionId') ?? undefined,
    churchProvinceId: url.searchParams.get('churchProvinceId') ?? undefined,
    ageRange: url.searchParams.get('ageRange') ?? undefined,
    confirmed: url.searchParams.get('confirmed') ?? undefined,
    participation: url.searchParams.get('participation') ?? undefined,
    submittedFrom: url.searchParams.get('submittedFrom') ?? undefined,
    submittedTo: url.searchParams.get('submittedTo') ?? undefined,
    imported: url.searchParams.get('imported') ?? undefined,
  }
}

export function csvResponse(columns: readonly string[], rows: ExportRow[], filename: string) {
  const csv = [
    columns.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ].join('\r\n')

  // The BOM makes Excel read the file as UTF-8 rather than the system codepage,
  // which is the difference between "Adébáyò" and "AdÃ©bÃ¡yÃ²".
  return new NextResponse('﻿' + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export async function xlsxResponse(
  columns: readonly string[],
  rows: ExportRow[],
  filename: string,
  sheetName: string,
) {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'MMPraise Volunteer Registration'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] })

  sheet.addRow([...columns])
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF1E4' } }

  for (const row of rows) sheet.addRow(row.map((cell) => safeCell(String(cell ?? ''))))

  sheet.columns.forEach((column) => {
    let width = 12
    column.eachCell?.({ includeEmpty: false }, (cell) => {
      width = Math.max(width, Math.min(40, String(cell.value ?? '').length + 2))
    })
    column.width = width
  })
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } }

  const buffer = await workbook.xlsx.writeBuffer()

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

/** `mmpraise-volunteers-2027-03-01.csv` — dated so two downloads never collide. */
export function exportFilename(stem: string, format: 'csv' | 'xlsx'): string {
  return `${stem}-${new Date().toISOString().slice(0, 10)}.${format}`
}
