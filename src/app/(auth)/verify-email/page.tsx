import type { Metadata } from 'next'
import Link from 'next/link'
import { CheckCircle2, MailWarning } from 'lucide-react'
import { verifyEmailAction } from '@/app/(auth)/actions'
import { ResendVerification } from '@/components/auth/resend-verification'
import { Alert, buttonClass, Card, CardBody, CardHeader } from '@/components/ui/primitives'
import { getSessionUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Confirm your email address' }

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const user = await getSessionUser()

  // A token in the URL means the visitor followed the link from their inbox.
  if (token) {
    const result = await verifyEmailAction(token)

    return (
      <Card>
        <CardHeader title={result.ok ? 'Email confirmed' : 'Confirmation failed'} />
        <CardBody className="space-y-5">
          {result.ok ? (
            <>
              <Alert tone="success" title="Your email address is confirmed" icon={<CheckCircle2 className="size-5" />}>
                {result.data.alreadyVerified
                  ? 'This address was already confirmed — nothing further to do.'
                  : 'Thank you. You will now receive registration and volunteer updates at this address.'}
              </Alert>
              <Link href={user ? '/apply' : '/login?verified=1'} className={buttonClass({ size: 'lg', className: 'w-full' })}>
                {user ? 'Confirm your availability' : 'Sign in'}
              </Link>
            </>
          ) : (
            <>
              <Alert tone="danger" title="We could not confirm your email" icon={<MailWarning className="size-5" />}>
                {result.error}
              </Alert>
              {user ? <ResendVerification /> : (
                <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
                  Sign in to request a new link
                </Link>
              )}
            </>
          )}
        </CardBody>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader
        title="Confirm your email address"
        description="We sent you a confirmation link. Please open it to finish setting up your account."
      />
      <CardBody className="space-y-5">
        {user ? (
          <>
            <p className="text-sm text-body">
              The link was sent to <strong className="text-ink">{user.email}</strong>. It expires in 24 hours.
            </p>
            <p className="text-sm text-muted">
              You can confirm your availability now — confirmation is only required before your
              application is reviewed.
            </p>
            <ResendVerification />
            <Link href="/apply" className="inline-block font-semibold text-primary underline underline-offset-4">
              Confirm your availability
            </Link>
          </>
        ) : (
          <Link href="/login" className="font-semibold text-primary underline underline-offset-4">
            Sign in to resend the confirmation email
          </Link>
        )}
      </CardBody>
    </Card>
  )
}
