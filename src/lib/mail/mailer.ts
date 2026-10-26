import 'server-only'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import nodemailer, { type Transporter } from 'nodemailer'
import { env } from '@/lib/env'

/**
 * Mail delivery.
 *
 * When SMTP_HOST is configured the message is sent over SMTP. Otherwise — the
 * default in development and test — the rendered message is written to
 * ./storage/mail so the team can inspect exactly what a volunteer would receive
 * without needing a mail server or risking real delivery.
 */
export type MailMessage = {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

let transporter: Transporter | null = null

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null
  if (transporter) return transporter
  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
  })
  return transporter
}

export async function sendMail(message: MailMessage): Promise<{ delivered: boolean; path?: string }> {
  const transport = getTransporter()

  if (!transport) {
    const dir = path.resolve(process.cwd(), 'storage', 'mail')
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeTo = message.to.replace(/[^a-z0-9@._-]/gi, '_')
    const file = path.join(dir, `${stamp}__${safeTo}.html`)
    await writeFile(
      file,
      `<!-- To: ${message.to}\n     Subject: ${message.subject} -->\n${message.html}`,
      'utf8',
    )
    console.info(`[mail] SMTP not configured — wrote "${message.subject}" to ${file}`)
    return { delivered: false, path: file }
  }

  await transport.sendMail({
    from: env.MAIL_FROM,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
    replyTo: message.replyTo ?? env.SUPPORT_EMAIL,
  })
  return { delivered: true }
}

/**
 * Send without letting a mail failure break the user's request.
 * Registration must still succeed if the mail server is briefly unavailable.
 */
export async function sendMailSafely(message: MailMessage): Promise<boolean> {
  try {
    await sendMail(message)
    return true
  } catch (error) {
    console.error('[mail] delivery failed', { to: message.to, subject: message.subject, error })
    return false
  }
}

/** Which transport a send would use right now. */
export function getMailerMode(): 'smtp' | 'file' {
  return env.SMTP_HOST ? 'smtp' : 'file'
}

export type MailSendResult = {
  /** The transport accepted the message (or the dev file was written). */
  accepted: boolean
  /** 'smtp' = real acceptance; 'file' = written to ./storage/mail in dev. */
  mode: 'smtp' | 'file'
  error?: string
}

/**
 * Send and say what actually happened — for callers that *record* outcomes.
 *
 * `sendMailSafely`'s boolean deliberately hides the dev/file distinction, which
 * is fine for fire-and-forget transactional mail but poisonous for outreach
 * reporting: a run marked "sent" in development would be indistinguishable from
 * a real one. Recording `mode` alongside the outcome is what keeps "Sent"
 * honest — it always means "this transport accepted it", and the transport is
 * named.
 */
export async function sendMailTracked(message: MailMessage): Promise<MailSendResult> {
  const mode = getMailerMode()
  try {
    await sendMail(message)
    return { accepted: true, mode }
  } catch (error) {
    console.error('[mail] delivery failed', { to: message.to, subject: message.subject, error })
    return {
      accepted: false,
      mode,
      error: error instanceof Error ? error.message.slice(0, 500) : 'Mail transport error',
    }
  }
}
