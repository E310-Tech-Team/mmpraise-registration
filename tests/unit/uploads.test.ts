import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig from '../../next.config'

/**
 * Two things that stopped every profile photo from September 2026: the S3
 * driver insisting on server-side encryption that the production MinIO cannot
 * do, and Server Actions refusing any body over Next's 1 MB default.
 */

const { sent } = vi.hoisted(() => ({ sent: [] as Record<string, unknown>[] }))

vi.mock('@aws-sdk/client-s3', () => {
  class Command {
    input: Record<string, unknown>
    constructor(input: Record<string, unknown>) {
      this.input = input
    }
  }
  return {
    S3Client: class {
      async send(command: Command) {
        sent.push(command.input)
        return {}
      }
    },
    PutObjectCommand: class extends Command {},
    GetObjectCommand: class extends Command {},
    DeleteObjectCommand: class extends Command {},
  }
})

/** Load the storage module fresh, since it picks its driver from the environment at import. */
async function s3Storage(encryption: string) {
  vi.stubEnv('STORAGE_DRIVER', 's3')
  vi.stubEnv('S3_BUCKET', 'test-bucket')
  vi.stubEnv('S3_SERVER_SIDE_ENCRYPTION', encryption)
  vi.resetModules()
  const { storage } = await import('@/lib/storage')
  return storage
}

describe('S3 storage', () => {
  afterEach(() => {
    sent.length = 0
    vi.unstubAllEnvs()
  })

  it('does not ask for server-side encryption unless configured', async () => {
    const storage = await s3Storage('')
    await storage.put('profile_photo/x.webp', Buffer.from('x'), 'image/webp')

    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toHaveProperty('ServerSideEncryption')
    expect(sent[0]).toMatchObject({ Bucket: 'test-bucket', ACL: 'private' })
  })

  it('asks for it when a store with a key is configured', async () => {
    const storage = await s3Storage('AES256')
    await storage.put('profile_photo/x.webp', Buffer.from('x'), 'image/webp')

    expect(sent[0]).toMatchObject({ ServerSideEncryption: 'AES256' })
  })
})

describe('Server Action body limit', () => {
  function toBytes(limit: string | number | undefined): number {
    if (typeof limit === 'number') return limit
    const match = /^(\d+(?:\.\d+)?)\s*(kb|mb)$/i.exec(limit ?? '')
    if (!match) return 1024 * 1024 // Next's default when unset.
    return Number(match[1]) * 1024 ** (match[2]!.toLowerCase() === 'mb' ? 2 : 1)
  }

  it('fits the largest upload the app accepts, with room for multipart framing', () => {
    const limit = toBytes(nextConfig.experimental?.serverActions?.bodySizeLimit)
    const MB = 1024 * 1024

    expect(limit).toBeGreaterThanOrEqual(5 * MB + 64 * 1024) // Photos: MAX_UPLOAD_MB default.
    expect(limit).toBeGreaterThanOrEqual(12 * MB + 64 * 1024) // Previous-participants CSV import.
  })
})
