import { z } from 'zod'

/**
 * Environment contract. Parsed once at module load so a misconfigured deployment
 * fails immediately and loudly rather than at the first request that needs the value.
 */
const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('MMPraise Volunteer Registration'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  APP_SECRET: z.string().min(32, 'APP_SECRET must be at least 32 characters'),

  DATABASE_URL: z.string().min(1),

  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  SESSION_COOKIE_NAME: z.string().default('mmp_session'),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_PATH: z.string().default('./storage/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(5),

  S3_BUCKET: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_FORCE_PATH_STYLE: bool,
  /**
   * Ask the store to encrypt each object at rest. Off unless set: AWS S3 and
   * Cloudflare R2 encrypt everything by default anyway, and a MinIO without a
   * KMS key rejects every upload that asks — which is how photo uploads broke
   * on 2026-09-16. Set it only where the store has a key configured.
   */
  S3_SERVER_SIDE_ENCRYPTION: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['AES256', 'aws:kms']).optional(),
  ),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool,
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('MMPraise Volunteers <volunteers@mmpraise.org>'),
  SUPPORT_EMAIL: z.string().default('volunteers@mmpraise.org'),

  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_LOGIN_WINDOW_MIN: z.coerce.number().int().positive().default(15),
  RATE_LIMIT_REGISTER_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_REGISTER_WINDOW_MIN: z.coerce.number().int().positive().default(60),
})

function load() {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${issues}`)
  }
  return parsed.data
}

export const env = load()

export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'

/** Guards that must hold before serving production traffic. */
export function assertProductionSafety() {
  if (!isProduction) return
  const problems: string[] = []
  if (env.APP_SECRET.length < 48) problems.push('APP_SECRET should be at least 48 characters in production')
  if (!env.APP_URL.startsWith('https://')) problems.push('APP_URL must use HTTPS in production')
  if (env.STORAGE_DRIVER === 'local') problems.push('STORAGE_DRIVER should be "s3" in production')
  if (!env.SMTP_HOST) problems.push('SMTP_HOST must be configured in production')
  if (problems.length) throw new Error(`Unsafe production configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
}
