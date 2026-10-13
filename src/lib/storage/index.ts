import 'server-only'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '@/lib/env'

/**
 * Object storage abstraction.
 *
 * Two drivers share one interface so development can use the local disk while
 * production uses S3-compatible storage, with no call-site changes.
 *
 * Security properties that both drivers must preserve:
 *  - Keys are random UUIDs, never derived from user-supplied filenames.
 *  - Local files are written outside ./public, so the web server cannot serve
 *    them directly; all reads go through an authorised route handler.
 *  - S3 objects are stored private; nothing is ever made publicly readable.
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
}

class LocalDriver implements StorageDriver {
  private root = path.resolve(process.cwd(), env.STORAGE_LOCAL_PATH)

  private resolve(key: string) {
    const target = path.resolve(this.root, key)
    // Defence in depth: refuse anything that escapes the storage root.
    if (!target.startsWith(this.root + path.sep) && target !== this.root) {
      throw new Error('Invalid storage key')
    }
    return target
  }

  async put(key: string, body: Buffer) {
    const target = this.resolve(key)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body, { mode: 0o600 })
  }

  async get(key: string) {
    return readFile(this.resolve(key))
  }

  async delete(key: string) {
    await unlink(this.resolve(key)).catch(() => undefined)
  }
}

class S3Driver implements StorageDriver {
  private clientPromise: Promise<import('@aws-sdk/client-s3').S3Client> | null = null

  private client() {
    if (!this.clientPromise) {
      this.clientPromise = import('@aws-sdk/client-s3').then(
        ({ S3Client }) =>
          new S3Client({
            region: env.S3_REGION,
            endpoint: env.S3_ENDPOINT || undefined,
            forcePathStyle: env.S3_FORCE_PATH_STYLE,
            credentials:
              env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
                ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }
                : undefined,
          }),
      )
    }
    return this.clientPromise
  }

  private bucket() {
    if (!env.S3_BUCKET) throw new Error('S3_BUCKET is not configured')
    return env.S3_BUCKET
  }

  async put(key: string, body: Buffer, contentType: string) {
    const [client, { PutObjectCommand }] = await Promise.all([this.client(), import('@aws-sdk/client-s3')])
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket(),
        Key: key,
        Body: body,
        ContentType: contentType,
        ACL: 'private',
        // Only when configured — see S3_SERVER_SIDE_ENCRYPTION in env.ts.
        ...(env.S3_SERVER_SIDE_ENCRYPTION ? { ServerSideEncryption: env.S3_SERVER_SIDE_ENCRYPTION } : {}),
      }),
    )
  }

  async get(key: string) {
    const [client, { GetObjectCommand }] = await Promise.all([this.client(), import('@aws-sdk/client-s3')])
    const result = await client.send(new GetObjectCommand({ Bucket: this.bucket(), Key: key }))
    const bytes = await result.Body?.transformToByteArray()
    if (!bytes) throw new Error('Object not found')
    return Buffer.from(bytes)
  }

  async delete(key: string) {
    const [client, { DeleteObjectCommand }] = await Promise.all([this.client(), import('@aws-sdk/client-s3')])
    await client.send(new DeleteObjectCommand({ Bucket: this.bucket(), Key: key }))
  }
}

export const storage: StorageDriver = env.STORAGE_DRIVER === 's3' ? new S3Driver() : new LocalDriver()

/** Build an unguessable storage key. Extensions are chosen by us, never by the user. */
export function buildStorageKey(prefix: string, extension: string): string {
  const now = new Date()
  const yyyy = now.getUTCFullYear()
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${prefix}/${yyyy}/${mm}/${randomUUID()}.${extension.replace(/[^a-z0-9]/gi, '')}`
}
