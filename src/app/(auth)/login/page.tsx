import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SignInForm } from '@/components/auth/sign-in-form'
import { Card, CardBody, CardHeader } from '@/components/ui/primitives'
import { getSessionUser } from '@/lib/auth/session'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string; reset?: string; verified?: string }>
}) {
  const user = await getSessionUser()
  if (user) redirect('/dashboard')

  const params = await searchParams

  return (
    <Card>
      <CardHeader title="Sign in" description="Welcome back — confirm your availability or manage your volunteer profile." />
      <CardBody>
        {params.reset === '1' && (
          <p className="mb-5 rounded-card border border-success/30 bg-success-subtle p-4 text-sm text-body" role="status">
            Your password has been updated. Sign in with your new password.
          </p>
        )}
        {params.verified === '1' && (
          <p className="mb-5 rounded-card border border-success/30 bg-success-subtle p-4 text-sm text-body" role="status">
            Your email address is confirmed. You can sign in now.
          </p>
        )}
        <SignInForm redirectTo={params.redirectTo} />
      </CardBody>
    </Card>
  )
}
