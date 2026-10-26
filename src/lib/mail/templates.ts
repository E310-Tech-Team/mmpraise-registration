import { env } from '@/lib/env'
import type { MailMessage } from './mailer'

/**
 * Email templates.
 *
 * Plain, table-free HTML with inline styles — the most reliable thing across
 * Gmail, Outlook and mobile clients. Every template also ships a text part.
 *
 * Privacy rule enforced here: no template ever includes health information,
 * emergency-contact details or any other restricted field.
 */

const BRAND = '#d63a02'
const INK = '#1c0d0a'
const BODY = '#353535'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function layout(heading: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:24px;background:#faf7f5;font-family:Helvetica,Arial,sans-serif;color:${BODY};line-height:1.6;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5d7d1;border-radius:14px;overflow:hidden;">
    <div style="background:${INK};padding:20px 28px;">
      <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">MMPraise Volunteers</span>
    </div>
    <div style="padding:28px;">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.25;color:${INK};text-transform:uppercase;">${escapeHtml(heading)}</h1>
      ${bodyHtml}
    </div>
    <div style="padding:18px 28px;border-top:1px solid #e5d7d1;font-size:13px;color:#5a5a5a;">
      Need help? Contact <a href="mailto:${env.SUPPORT_EMAIL}" style="color:${BRAND};">${env.SUPPORT_EMAIL}</a>.<br>
      ${escapeHtml(env.APP_NAME)}
    </div>
  </div>
</body></html>`
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;">
    <a href="${href}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:700;text-transform:uppercase;font-size:14px;">${escapeHtml(label)}</a>
  </p>
  <p style="font-size:13px;color:#5a5a5a;word-break:break-all;">If the button does not work, copy this link into your browser:<br>${href}</p>`
}

export function verificationEmail(params: { name: string; url: string }): MailMessage {
  const html = layout(
    'Confirm your email address',
    `<p>Hello ${escapeHtml(params.name)},</p>
     <p>Thank you for starting your MMPraise volunteer registration. Please confirm your email address so we can keep you updated about your application.</p>
     ${button(params.url, 'Confirm email address')}
     <p style="font-size:13px;color:#5a5a5a;">This link expires in 24 hours. If you did not create this account you can safely ignore this message.</p>`,
  )
  return {
    to: '',
    subject: 'Confirm your MMPraise volunteer email address',
    html,
    text: `Hello ${params.name},\n\nConfirm your email address to continue your MMPraise volunteer registration:\n${params.url}\n\nThis link expires in 24 hours.`,
  }
}

export function passwordResetEmail(params: { name: string; url: string }): MailMessage {
  const html = layout(
    'Reset your password',
    `<p>Hello ${escapeHtml(params.name)},</p>
     <p>We received a request to reset the password for your MMPraise volunteer account.</p>
     ${button(params.url, 'Reset password')}
     <p style="font-size:13px;color:#5a5a5a;">This link expires in 60 minutes and can be used once. If you did not request a reset, no action is needed — your password has not changed.</p>`,
  )
  return {
    to: '',
    subject: 'Reset your MMPraise volunteer password',
    html,
    text: `Hello ${params.name},\n\nReset your MMPraise volunteer password:\n${params.url}\n\nThis link expires in 60 minutes. If you did not request it, ignore this email.`,
  }
}

export function submissionEmail(params: {
  name: string
  registrationId: string
  department: string
  submittedAt: string
  loginUrl: string
}): MailMessage {
  const rows = [
    ['Name', params.name],
    ['Registration ID', params.registrationId],
    ['Department', params.department],
    ['Date submitted', params.submittedAt],
  ]
    .map(
      ([label, value]) =>
        `<tr><td style="padding:8px 0;color:#5a5a5a;font-size:14px;">${escapeHtml(label)}</td>
             <td style="padding:8px 0;color:${INK};font-weight:600;font-size:14px;text-align:right;">${escapeHtml(value)}</td></tr>`,
    )
    .join('')

  const html = layout(
    'Registration received',
    `<p>Hello ${escapeHtml(params.name)},</p>
     <p>Your volunteer registration has been received. Please keep your registration ID for reference.</p>
     <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5d7d1;border-bottom:1px solid #e5d7d1;margin:16px 0;">${rows}</table>
     <h2 style="font-size:16px;color:${INK};text-transform:uppercase;margin:24px 0 8px;">What happens next</h2>
     <ol style="padding-left:18px;margin:0 0 16px;">
       <li>Our team reviews your application against your chosen department.</li>
       <li>You will receive an email when your status changes.</li>
       <li>If you are approved, we will send shift details and briefing information.</li>
     </ol>
     ${button(params.loginUrl, 'View your volunteer profile')}`,
  )

  return {
    to: '',
    subject: `MMPraise volunteer registration received — ${params.registrationId}`,
    html,
    text: `Hello ${params.name},\n\nYour MMPraise volunteer registration has been received.\n\nRegistration ID: ${params.registrationId}\nDepartment: ${params.department}\nSubmitted: ${params.submittedAt}\n\nWhat happens next:\n1. Our team reviews your application.\n2. You will be emailed when your status changes.\n3. Approved volunteers receive shift details and briefing information.\n\nView your profile: ${params.loginUrl}`,
  }
}

export function statusChangeEmail(params: {
  name: string
  registrationId: string
  status: string
  department: string
  message?: string | null
  loginUrl: string
}): MailMessage {
  const html = layout(
    'Your application status has changed',
    `<p>Hello ${escapeHtml(params.name)},</p>
     <p>The status of your volunteer application <strong>${escapeHtml(params.registrationId)}</strong> (${escapeHtml(params.department)}) is now:</p>
     <p style="font-size:20px;font-weight:700;color:${INK};text-transform:uppercase;margin:12px 0;">${escapeHtml(params.status)}</p>
     ${params.message ? `<p style="background:#fff1ea;border:1px solid #ffd3c2;border-radius:10px;padding:12px 16px;">${escapeHtml(params.message)}</p>` : ''}
     ${button(params.loginUrl, 'Open your dashboard')}`,
  )
  return {
    to: '',
    subject: `MMPraise volunteer application ${params.registrationId} — ${params.status}`,
    html,
    text: `Hello ${params.name},\n\nYour application ${params.registrationId} (${params.department}) is now: ${params.status}.\n${params.message ? `\n${params.message}\n` : ''}\nOpen your dashboard: ${params.loginUrl}`,
  }
}

/** First sentences of an announcement, cut at a word, for the email preview. */
export function announcementPreview(body: string, limit = 160): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  if (flat.length <= limit) return flat
  const cut = flat.slice(0, limit)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 80))}…`
}

/**
 * A notification that an announcement is waiting — never the announcement.
 *
 * The full message lives on the dashboard and the email carries only the title
 * and a preview, by decision: volunteers sign in to read it. That keeps the
 * portal the single place an announcement exists (an edit or expiry is never
 * contradicted by a stale copy in ten thousand inboxes) and keeps the mail
 * itself low-value if forwarded or mis-sent.
 */
export function announcementEmail(params: { name: string; title: string; body: string; loginUrl: string }): MailMessage {
  const preview = announcementPreview(params.body)

  const html = layout(
    params.title,
    `<p>Hello ${escapeHtml(params.name)},</p>
     <p>There is a new announcement for MMPraise volunteers:</p>
     <p style="background:#fff1ea;border:1px solid #ffd3c2;border-radius:10px;padding:12px 16px;">
       <strong>${escapeHtml(params.title)}</strong><br>${escapeHtml(preview)}
     </p>
     <p>Sign in to read the full announcement on your dashboard.</p>
     ${button(params.loginUrl, 'Read it on your dashboard')}`,
  )
  return {
    to: '',
    subject: `MMPraise volunteers — ${params.title}`,
    html,
    text: `Hello ${params.name},\n\nThere is a new announcement for MMPraise volunteers:\n\n${params.title}\n${preview}\n\nSign in to read the full announcement: ${params.loginUrl}`,
  }
}

/**
 * Invitation to someone whose details were migrated from a previous edition.
 *
 * Contains no password, no reset token and no profile data beyond the person's
 * first name. It deliberately routes them through "Forgot your password?"
 * rather than embedding a link that would grant access: a bulk mail-out of
 * live credentials is a breach waiting for one forwarded message, and the
 * ordinary reset flow already proves control of the mailbox.
 */
export function migrationInvitationEmail(params: {
  name: string
  edition: string
  loginUrl: string
  resetUrl: string
  supportEmail: string
}): MailMessage {
  const html = layout(
    'Your MMPraise account is ready',
    `<p>Hello ${escapeHtml(params.name)},</p>
     <p>You are receiving this because you took part in Marathon Messiah’s Praise ${escapeHtml(params.edition)}. We have moved your record onto our new volunteer platform, so <strong>you do not need to create another account</strong>.</p>
     <p>To get in, set a password on the account you already have:</p>
     <ol style="padding-left:18px;color:#353535;">
       <li>Go to the sign-in page.</li>
       <li>Choose <strong>“Forgot your password?”</strong></li>
       <li>Enter this same email address.</li>
       <li>Follow the secure link we send you and choose a password.</li>
     </ol>
     ${button(params.resetUrl, 'Set your password')}
     <p style="font-size:13px;color:#5a5a5a;">Or sign in here once you have: ${escapeHtml(params.loginUrl)}</p>
     <p>After signing in you will be asked to check your details are still correct, and to complete anything we now need for the current edition.</p>
     <p style="font-size:13px;color:#5a5a5a;">Please do not forward the password link we send you — it gives access to your account. If you did not expect this email, you can ignore it; nothing changes until you set a password. Questions? Write to ${escapeHtml(params.supportEmail)}.</p>`,
  )

  const text = `Hello ${params.name},

You are receiving this because you took part in Marathon Messiah's Praise ${params.edition}. We have moved your record onto our new volunteer platform, so you do not need to create another account.

To get in, set a password on the account you already have:
  1. Go to ${params.loginUrl}
  2. Choose "Forgot your password?"
  3. Enter this same email address.
  4. Follow the secure link we send you and choose a password.

Set your password: ${params.resetUrl}

After signing in you will be asked to check your details are still correct, and to complete anything we now need for the current edition.

Please do not forward the password link we send you - it gives access to your account. If you did not expect this email, you can ignore it; nothing changes until you set a password.

Questions? Write to ${params.supportEmail}.`

  // `to` is filled in by the caller, matching the other templates here.
  return { to: '', subject: 'Your MMPraise volunteer account is ready', html, text }
}

/**
 * Reminder to someone whose migrated account has never been activated.
 *
 * Same security posture as the invitation: no token, no credential — the
 * button leads to the ordinary forgot-password flow, which proves control of
 * the mailbox before granting anything.
 */
export function reminderUnactivatedEmail(params: {
  name: string
  edition: string
  resetUrl: string
  supportEmail: string
}): MailMessage {
  const html = layout(
    'Your volunteer account is still waiting',
    `<p>Hello ${escapeHtml(params.name)},</p>
     <p>A while ago we wrote to say your Marathon Messiah’s Praise volunteer record had moved to our new platform. Your account is still waiting — <strong>you do not need to register again</strong>, just set a password:</p>
     ${button(params.resetUrl, 'Set your password')}
     <p>Enter this same email address on that page and follow the secure link we send you.</p>
     <p style="font-size:13px;color:#5a5a5a;">If you would rather not volunteer this time, you can simply ignore this email — nothing changes until you set a password. Questions? Write to ${escapeHtml(params.supportEmail)}.</p>`,
  )

  const text = `Hello ${params.name},

A while ago we wrote to say your Marathon Messiah's Praise volunteer record had moved to our new platform. Your account is still waiting - you do not need to register again, just set a password:

${params.resetUrl}

Enter this same email address on that page and follow the secure link we send you.

If you would rather not volunteer this time, you can simply ignore this email - nothing changes until you set a password.

Questions? Write to ${params.supportEmail}.`

  return { to: '', subject: 'Your MMPraise volunteer account is still waiting', html, text }
}

/**
 * Reminder to someone who can sign in but has not confirmed availability for
 * the edition. Covers migrated and fresh registrants alike; the ask is the
 * same two-minute confirmation either way.
 */
export function reminderUnconfirmedEmail(params: {
  name: string
  edition: string
  applyUrl: string
  supportEmail: string
}): MailMessage {
  const html = layout(
    `Are you serving at the ${escapeHtml(params.edition)} edition?`,
    `<p>Hello ${escapeHtml(params.name)},</p>
     <p>Planning for Marathon Messiah’s Praise ${escapeHtml(params.edition)} is under way, and we have not yet heard whether you are available to serve this edition.</p>
     <p>Confirming takes about two minutes — sign in, tell us your availability and department, and you are done:</p>
     ${button(params.applyUrl, 'Confirm your availability')}
     <p style="font-size:13px;color:#5a5a5a;">If you cannot serve this time, no reply is needed — we will simply plan without you, and you are always welcome back. Questions? Write to ${escapeHtml(params.supportEmail)}.</p>`,
  )

  const text = `Hello ${params.name},

Planning for Marathon Messiah's Praise ${params.edition} is under way, and we have not yet heard whether you are available to serve this edition.

Confirming takes about two minutes - sign in, tell us your availability and department, and you are done:

${params.applyUrl}

If you cannot serve this time, no reply is needed - we will simply plan without you, and you are always welcome back.

Questions? Write to ${params.supportEmail}.`

  return {
    to: '',
    subject: `Are you serving at Marathon Messiah's Praise ${params.edition}?`,
    html,
    text,
  }
}
