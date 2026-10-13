'use client'

import { useRef, useState, useTransition } from 'react'
import { ImagePlus, KeyRound, Trash2, UserRound } from 'lucide-react'
import { changePasswordAction } from '@/app/(auth)/actions'
import {
  cancelAccountDeletionAction,
  requestAccountDeletionAction,
  updateProfilePhotoAction,
} from '@/app/(volunteer)/dashboard/account/actions'
import { Alert, Button } from '@/components/ui/primitives'
import { Field, PasswordInput } from '@/components/ui/form'
import { changePasswordSchema } from '@/lib/validation/auth'
import type { FieldErrors } from '@/lib/actions/result'

export function ChangePasswordForm() {
  const [pending, startTransition] = useTransition()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setMessage(null)

    const parsed = changePasswordSchema.safeParse({ currentPassword, password, confirmPassword })
    if (!parsed.success) {
      const next: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.')
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    setErrors({})
    startTransition(async () => {
      const result = await changePasswordAction({ currentPassword, password, confirmPassword })
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        setMessage(result.fieldErrors ? null : { tone: 'danger', text: result.error })
        return
      }
      setCurrentPassword('')
      setPassword('')
      setConfirmPassword('')
      setMessage({ tone: 'success', text: 'Your password has been changed.' })
    })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {message && <Alert tone={message.tone}>{message.text}</Alert>}

      <Field label="Current password" htmlFor="current-password" required error={errors.currentPassword}>
        <PasswordInput
          id="current-password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={setCurrentPassword}
          invalid={Boolean(errors.currentPassword)}
        />
      </Field>

      <Field label="New password" htmlFor="account-new-password" required error={errors.password}>
        <PasswordInput
          id="account-new-password"
          showMeter
          value={password}
          onChange={setPassword}
          invalid={Boolean(errors.password)}
        />
      </Field>

      <Field label="Confirm new password" htmlFor="account-confirm-password" required error={errors.confirmPassword}>
        <PasswordInput
          id="account-confirm-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          invalid={Boolean(errors.confirmPassword)}
        />
      </Field>

      <Button type="submit" isLoading={pending}>
        {!pending && <KeyRound aria-hidden className="size-4" />}
        Change password
      </Button>
    </form>
  )
}

export function ProfilePhotoForm({ documentId }: { documentId: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [current, setCurrent] = useState(documentId)
  const [error, setError] = useState<string | null>(null)

  function upload(file: File | undefined) {
    setError(null)
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    startTransition(async () => {
      // Caught here so a failed upload stays an inline error rather than
      // replacing the page with the error screen.
      const result = await updateProfilePhotoAction(formData).catch(() => null)
      if (!result?.ok) {
        setError(result?.error ?? 'We could not upload your photo. Please try again.')
        return
      }
      setCurrent(result.data.documentId)
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex size-24 items-center justify-center overflow-hidden rounded-full border-2 border-line bg-surface-sunken">
          {current ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${current}`} alt="Your current profile photograph" className="size-full object-cover" />
          ) : (
            <UserRound aria-hidden className="size-10 text-muted" />
          )}
        </div>

        <div>
          <label htmlFor="account-photo" className="sr-only">
            Choose a profile photograph
          </label>
          <input
            ref={inputRef}
            id="account-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => upload(event.target.files?.[0])}
          />
          <Button type="button" variant="secondary" isLoading={pending} onClick={() => inputRef.current?.click()}>
            {!pending && <ImagePlus aria-hidden className="size-4" />}
            {current ? 'Change photograph' : 'Upload photograph'}
          </Button>
          <p className="mt-2 text-xs text-muted">JPG, PNG or WebP, up to 5 MB.</p>
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  )
}

export function DeletionRequestForm({ requestedAt }: { requestedAt: string | null }) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [requested, setRequested] = useState(requestedAt)

  if (requested) {
    return (
      <div className="space-y-4">
        <Alert tone="warning" title="Deletion requested">
          We received your request on {requested}. An administrator will complete it within 30 days.
          You can cancel until then.
        </Alert>
        <Button
          type="button"
          variant="secondary"
          isLoading={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await cancelAccountDeletionAction()
              if (result.ok) setRequested(null)
            })
          }
        >
          Cancel my deletion request
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-body">
        You can ask us to delete your account and personal information. Some records may be retained
        where we are required to keep them for safeguarding or legal reasons.
      </p>

      {confirming ? (
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="danger"
            isLoading={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await requestAccountDeletionAction()
                if (result.ok) {
                  setRequested(new Date().toLocaleDateString('en-GB'))
                  setConfirming(false)
                }
              })
            }
          >
            <Trash2 aria-hidden className="size-4" />
            Yes, request deletion
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" variant="secondary" onClick={() => setConfirming(true)}>
          <Trash2 aria-hidden className="size-4" />
          Request account deletion
        </Button>
      )}
    </div>
  )
}
