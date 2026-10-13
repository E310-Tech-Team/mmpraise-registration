import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from '@/lib/db-errors'

/**
 * The shapes below are the ones Prisma actually produces. The driver-adapter
 * one is copied from a production log: no `target`, the column only under
 * `driverAdapterError.cause.constraint`. Missing it sent ~210 volunteers a
 * "check your connection" error instead of "that number is already registered".
 */
function adapterError(constraint: { fields: string[] } | { index: string }) {
  const driverAdapterError = Object.assign(new Error('UniqueConstraintViolation'), {
    cause: { kind: 'UniqueConstraintViolation', originalCode: '23505', constraint },
  })
  return { code: 'P2002', meta: { modelName: 'User', driverAdapterError } }
}

describe('isUniqueViolation', () => {
  it('recognises the driver-adapter shape, which has no target', () => {
    expect(isUniqueViolation(adapterError({ fields: ['phone'] }), 'phone')).toBe(true)
    expect(isUniqueViolation(adapterError({ index: 'users_phone_key' }), 'phone')).toBe(true)
  })

  it('still recognises the classic target shapes', () => {
    expect(isUniqueViolation({ code: 'P2002', meta: { target: ['phone'] } }, 'phone')).toBe(true)
    expect(isUniqueViolation({ code: 'P2002', meta: { target: 'users_phone_key' } }, 'phone')).toBe(true)
  })

  it('does not claim a violation on a different column', () => {
    expect(isUniqueViolation(adapterError({ fields: ['email'] }), 'phone')).toBe(false)
    expect(isUniqueViolation({ code: 'P2002', meta: { target: ['email'] } }, 'phone')).toBe(false)
  })

  it('ignores anything that is not a unique violation', () => {
    expect(isUniqueViolation({ code: 'P2003', meta: { target: ['phone'] } }, 'phone')).toBe(false)
    expect(isUniqueViolation({ code: 'P2002' }, 'phone')).toBe(false)
    expect(isUniqueViolation(new Error('phone'), 'phone')).toBe(false)
    expect(isUniqueViolation(null, 'phone')).toBe(false)
    expect(isUniqueViolation(undefined, 'phone')).toBe(false)
  })
})
