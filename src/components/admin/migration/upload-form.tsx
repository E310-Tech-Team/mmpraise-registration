'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Download, ShieldAlert, UploadCloud } from 'lucide-react'
import {
  downloadTemplateAction,
  uploadBatchAction,
} from '@/app/(admin)/admin/previous-participants/actions'
import { Checkbox, ErrorSummary, Field, TextArea, TextInput, describedBy } from '@/components/ui/form'
import { Alert, Button, buttonClass } from '@/components/ui/primitives'
import type { FieldErrors } from '@/lib/actions/result'

/**
 * Step one of the import: describe the file and upload it.
 *
 * Nothing is written to the volunteer tables here. The upload is stored, the
 * header row is read, and the administrator is taken to the mapping screen —
 * so an accidental upload costs nothing but a batch they can cancel.
 *
 * The invitation checkbox sets an *intent*, not an action. Invitations are
 * always queued explicitly afterwards, once the import has finished and the
 * results have been read; the box only saves that decision so the batch screen
 * can remind them.
 */
export function MigrationUploadForm() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [intendToInvite, setIntendToInvite] = useState(false)

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setErrors({})
    setFormError(null)

    const formData = new FormData(event.currentTarget)

    startTransition(async () => {
      // Caught so a failed upload stays on the form instead of the error screen.
      const result = await uploadBatchAction(formData).catch(() => null)
      if (!result) {
        setFormError('The file could not be uploaded. Please try again.')
        document.getElementById('upload-errors')?.focus()
        return
      }
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {})
        setFormError(result.fieldErrors ? null : result.error)
        document.getElementById('upload-errors')?.focus()
        return
      }
      router.push(`/admin/previous-participants/${result.data.batchId}`)
    })
  }

  function downloadTemplate() {
    startTransition(async () => {
      const result = await downloadTemplateAction()
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      saveCsv(result.data.filename, result.data.csv)
    })
  }

  const summary = Object.entries(errors).map(([field, message]) => ({
    field: `upload-${field}`,
    message,
  }))

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <ErrorSummary id="upload-errors" errors={summary} />
      {formError && (
        <Alert tone="danger" title="Could not start this import">
          {formError}
        </Alert>
      )}

      <Alert tone="info" title="What happens to this file" icon={<ShieldAlert className="size-5" />}>
        It is stored privately and deleted 30 days after the import finishes. Columns that look like
        passwords or tokens are never read. No password is ever imported, generated or emailed —
        people set their own through the ordinary reset flow.
      </Alert>

      <Field
        label="Name this import"
        htmlFor="upload-name"
        required
        help="Something you will recognise in a list months from now."
        error={errors.name}
      >
        <TextInput
          id="upload-name"
          name="name"
          required
          placeholder="2024 volunteers from the department spreadsheet"
          aria-describedby={describedBy('upload-name', { help: true, error: errors.name })}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label="Which edition did these people serve at?"
          htmlFor="upload-sourceEdition"
          required
          help="Stored against each person as their previous participation."
          error={errors.sourceEdition}
        >
          <TextInput
            id="upload-sourceEdition"
            name="sourceEdition"
            required
            placeholder="84 Hours Marathon Messiah’s Praise 2026"
            aria-describedby={describedBy('upload-sourceEdition', { help: true, error: errors.sourceEdition })}
          />
        </Field>

        <Field
          label="Year"
          htmlFor="upload-sourceYear"
          help="Four digits, used for sorting and reports."
          error={errors.sourceYear}
        >
          <TextInput
            id="upload-sourceYear"
            name="sourceYear"
            inputMode="numeric"
            placeholder="2026"
            aria-describedby={describedBy('upload-sourceYear', { help: true, error: errors.sourceYear })}
          />
        </Field>
      </div>

      <Field
        label="Notes"
        htmlFor="upload-sourceNote"
        help="Where the list came from, or anything the next administrator should know."
        error={errors.sourceNote}
      >
        <TextArea
          id="upload-sourceNote"
          name="sourceNote"
          rows={3}
          aria-describedby={describedBy('upload-sourceNote', { help: true, error: errors.sourceNote })}
        />
      </Field>

      <Field
        label="CSV file"
        htmlFor="upload-file"
        required
        help="Save your spreadsheet as CSV first. Up to 20,000 rows and 12 MB."
        error={errors.file}
      >
        <input
          id="upload-file"
          name="file"
          type="file"
          accept=".csv,text/csv"
          required
          onChange={(event) => setFilename(event.currentTarget.files?.[0]?.name ?? null)}
          aria-invalid={Boolean(errors.file) || undefined}
          aria-describedby={describedBy('upload-file', { help: true, error: errors.file })}
          className="block w-full rounded-field border border-line-strong bg-surface px-4 py-3 text-sm text-body file:mr-4 file:rounded-pill file:border-0 file:bg-primary file:px-4 file:py-2 file:font-display file:text-xs file:font-bold file:uppercase file:tracking-wide file:text-white hover:file:bg-primary-hover"
        />
        {filename && (
          <p className="mt-2 text-sm text-muted">
            Selected: <span className="font-medium text-ink">{filename}</span>
          </p>
        )}
      </Field>

      <Checkbox
        name="sendInvitations"
        checked={intendToInvite}
        onChange={setIntendToInvite}
        label="I intend to invite the people this import creates"
        description="Saves the decision only. Invitations are always confirmed separately, after the import has finished and you have read the results."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" isLoading={pending} size="lg">
          <UploadCloud aria-hidden className="size-4" />
          Upload and continue
        </Button>
        <button type="button" onClick={downloadTemplate} className={buttonClass({ variant: 'outline', size: 'md' })}>
          <Download aria-hidden className="size-4" />
          Download the template
        </button>
      </div>
    </form>
  )
}

/**
 * Save a generated CSV without a round trip to a route handler.
 *
 * The bytes already exist in memory after the action returns; a blob URL avoids
 * a second permission check and a second audit record for the same download.
 */
export function saveCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
