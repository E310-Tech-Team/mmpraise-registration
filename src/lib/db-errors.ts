/**
 * Recognising database errors that deserve a friendly answer rather than a 500.
 */

type PrismaKnownError = {
  code?: string
  meta?: {
    target?: string[] | string
    driverAdapterError?: {
      cause?: { constraint?: { fields?: string[] } | { index?: string } }
    }
  }
}

/**
 * Detect a unique-constraint violation on a specific column.
 *
 * Prisma names the offending column in different places depending on how it
 * reaches the database. The classic engine sets `meta.target`, as either a list
 * of columns or the constraint name ("users_phone_key"). Through a driver
 * adapter — which this app uses, via `@prisma/adapter-pg` — there is no
 * `target` at all: the column is only under
 * `meta.driverAdapterError.cause.constraint`, as `{ fields }` or `{ index }`.
 *
 * Every shape is matched. Checking only `target` is how "that number is already
 * registered" became an unhandled error, shown to volunteers as "check your
 * connection", from September to October 2026.
 */
export function isUniqueViolation(error: unknown, field: string): boolean {
  const prismaError = error as PrismaKnownError | null
  if (prismaError?.code !== 'P2002') return false

  const { target, driverAdapterError } = prismaError.meta ?? {}
  const constraint = driverAdapterError?.cause?.constraint

  const names = [
    ...(Array.isArray(target) ? target : [target]),
    ...(constraint && 'fields' in constraint ? (constraint.fields ?? []) : []),
    constraint && 'index' in constraint ? constraint.index : undefined,
  ]

  return names.some((name) => typeof name === 'string' && name.toLowerCase().includes(field.toLowerCase()))
}
