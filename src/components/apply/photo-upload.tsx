'use client'

import { useRef, useState, useTransition } from 'react'
import { ImagePlus, Trash2, UserRound } from 'lucide-react'
import { uploadProfilePhotoAction } from '@/app/(volunteer)/apply/actions'
import { Alert, Button } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'

const ACCEPT = 'image/jpeg,image/png,image/webp'
const MAX_MB = 5

/**
 * Profile photograph field.
 *
 * Shows an immediate local preview (object URL) while the file uploads, so the
 * volunteer sees their picture without waiting for the round trip. The server
 * re-encodes the image, which strips EXIF data including GPS location.
 */
export function PhotoUpload({
  documentId,
  onChange,
  error,
  describedById,
}: {
  documentId: string | null
  onChange: (documentId: string | null) => void
  error?: string
  describedById?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [preview, setPreview] = useState<string | null>(null)
  const [localError, setLocalError] = useState<string | null>(null)

  const src = preview ?? (documentId ? `/api/files/${documentId}` : null)

  function handleFile(file: File | undefined) {
    setLocalError(null)
    if (!file) return

    if (file.size > MAX_MB * 1024 * 1024) {
      setLocalError(`That image is too large. The maximum is ${MAX_MB} MB.`)
      return
    }
    if (!ACCEPT.split(',').includes(file.type)) {
      setLocalError('Upload a JPG, PNG or WebP image.')
      return
    }

    const objectUrl = URL.createObjectURL(file)
    setPreview(objectUrl)

    const formData = new FormData()
    formData.append('file', file)

    startTransition(async () => {
      // A thrown action (the store refusing the file, a request over the size
      // limit, a dropped connection) must not escape the transition: React
      // hands it to the nearest error boundary, and the volunteer loses the
      // whole page — and everything typed on it — over one photo.
      const result = await uploadProfilePhotoAction(formData).catch(() => null)
      if (!result?.ok) {
        setLocalError(result?.error ?? 'We could not upload your photo. Please try again.')
        setPreview(null)
        URL.revokeObjectURL(objectUrl)
        return
      }
      onChange(result.data.documentId)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-5">
        <div
          className={cn(
            'flex size-28 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-surface-sunken',
            error || localError ? 'border-danger' : 'border-line',
          )}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt="Your profile photograph preview" className="size-full object-cover" />
          ) : (
            <UserRound aria-hidden className="size-10 text-muted" />
          )}
        </div>

        <div className="space-y-2">
          <input
            ref={inputRef}
            id="field-photoDocumentId"
            type="file"
            accept={ACCEPT}
            capture="user"
            className="sr-only"
            aria-describedby={describedById}
            onChange={(event) => handleFile(event.target.files?.[0])}
          />

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={pending}
              onClick={() => inputRef.current?.click()}
            >
              {!pending && <ImagePlus aria-hidden className="size-4" />}
              {documentId ? 'Change photo' : 'Choose photo'}
            </Button>

            {documentId && !pending && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange(null)
                  setPreview(null)
                  if (inputRef.current) inputRef.current.value = ''
                }}
              >
                <Trash2 aria-hidden className="size-4" />
                Remove
              </Button>
            )}
          </div>

          <p className="text-xs text-muted">JPG, PNG or WebP, up to {MAX_MB} MB. A clear head-and-shoulders photo works best.</p>
        </div>
      </div>

      {(localError || error) && <Alert tone="danger">{localError ?? error}</Alert>}
    </div>
  )
}
