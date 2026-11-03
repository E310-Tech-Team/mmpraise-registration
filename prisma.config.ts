import dotenv from 'dotenv'
import path from 'node:path'
import { defineConfig } from 'prisma/config'

dotenv.config({ path: '.env.local' })
dotenv.config()

/**
 * Prisma 7 configuration.
 *
 * Connection URLs live here rather than in schema.prisma. The runtime client is
 * constructed separately in src/lib/db.ts with the pg driver adapter; this file
 * only configures the CLI (migrate, db push, seed, studio).
 *
 * Tests point at TEST_DATABASE_URL by setting DATABASE_URL before invoking the CLI.
 */
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
})
