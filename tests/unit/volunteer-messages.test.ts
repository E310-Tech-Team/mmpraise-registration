import { describe, expect, it } from 'vitest'
import { volunteerMessageEmail } from '@/lib/mail/templates'
import { pickMessageFilters, sendMessageSchema } from '@/lib/validation/messages'

const valid = {
  subject: 'Rehearsal moved',
  body: 'Saturday rehearsal is now at 4pm.\nBring water.',
  sendEmail: false,
  selection: { mode: 'filter', filters: { status: 'APPROVED' } },
  expectedCount: 12,
}

describe('sendMessageSchema', () => {
  it('accepts a message to the filtered list, keeping line breaks', () => {
    const parsed = sendMessageSchema.safeParse(valid)
    expect(parsed.success).toBe(true)
    expect(parsed.data?.body).toContain('\n')
  })

  it('requires a subject and a body', () => {
    expect(sendMessageSchema.safeParse({ ...valid, subject: '  ' }).success).toBe(false)
    expect(sendMessageSchema.safeParse({ ...valid, body: '' }).success).toBe(false)
  })

  it('caps the length of both', () => {
    expect(sendMessageSchema.safeParse({ ...valid, subject: 'x'.repeat(151) }).success).toBe(false)
    expect(sendMessageSchema.safeParse({ ...valid, body: 'x'.repeat(4001) }).success).toBe(false)
  })

  it('needs a positive confirmed count — the counted-confirm contract', () => {
    expect(sendMessageSchema.safeParse({ ...valid, expectedCount: 0 }).success).toBe(false)
  })

  it('rejects filter keys the applicant list does not have', () => {
    const smuggled = { ...valid, selection: { mode: 'filter', filters: { userId: 'someone' } } }
    expect(sendMessageSchema.safeParse(smuggled).success).toBe(false)
  })

  it('accepts a single named volunteer', () => {
    expect(sendMessageSchema.safeParse({ ...valid, selection: { mode: 'individual', userId: 'cuid123' } }).success).toBe(true)
  })
})

describe('pickMessageFilters', () => {
  it('keeps only real filter keys with values, dropping page and sort', () => {
    expect(pickMessageFilters({ status: 'APPROVED', page: '3', sort: 'name', q: '', countryId: ['ng', 'gh'] })).toEqual({
      status: 'APPROVED',
      countryId: 'ng',
    })
  })
})

describe('volunteerMessageEmail', () => {
  it('carries the subject and a link to the inbox, never the message itself', () => {
    const email = volunteerMessageEmail({ name: 'Ada', subject: 'Rehearsal moved', inboxUrl: 'https://mmpraise.org/dashboard/messages' })
    expect(email.subject).toContain('Rehearsal moved')
    expect(email.text).toContain('https://mmpraise.org/dashboard/messages')
    expect(email.html).toContain('https://mmpraise.org/dashboard/messages')
  })

  it('escapes the subject in the HTML', () => {
    const email = volunteerMessageEmail({ name: 'Ada', subject: '<script>x</script>', inboxUrl: 'https://mmpraise.org' })
    expect(email.html).not.toContain('<script>x</script>')
  })
})
