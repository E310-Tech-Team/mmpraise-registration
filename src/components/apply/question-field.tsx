'use client'

import { useRef, useState, useTransition } from 'react'
import { FileCheck2, Paperclip } from 'lucide-react'
import { uploadAnswerFileAction } from '@/app/(volunteer)/apply/actions'
import { Alert, Button } from '@/components/ui/primitives'
import { Combobox } from '@/components/ui/combobox'
import {
  CheckboxGroup,
  Field,
  RadioGroup,
  RatingInput,
  TextArea,
  TextInput,
} from '@/components/ui/form'
import type { AnswerValue, QuestionDef } from '@/lib/questions/engine'
import { humanFileSizeLabel } from '@/lib/questions/labels'

/**
 * Renders one department question from its database definition.
 *
 * Every supported question type is handled here, so adding a question in the
 * admin interface needs no front-end change. "Other"-style options reveal a
 * free-text box automatically, driven by the option's requiresText flag.
 */
const RATING_LABELS: Record<number, string> = {
  0: 'Very weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Good',
  4: 'Strong',
  5: 'Very strong',
}

export function QuestionField({
  question,
  value,
  onChange,
  error,
}: {
  question: QuestionDef
  value: AnswerValue | undefined
  onChange: (value: AnswerValue) => void
  error?: string
}) {
  const id = `field-answers.${question.key}`
  const answer = value ?? {}
  const selected = answer.options ?? []

  function setOptions(next: { value: string; otherText?: string | null }[]) {
    onChange({ ...answer, options: next })
  }

  const otherOption = question.options.find((o) => o.requiresText && selected.some((s) => s.value === o.value))

  const commonFieldProps = {
    label: question.label,
    required: question.isRequired,
    error,
    help: question.helpText ?? undefined,
  }

  switch (question.type) {
    case 'TEXT':
    case 'EMAIL':
    case 'TEL':
      return (
        <Field {...commonFieldProps} htmlFor={id}>
          <TextInput
            id={id}
            type={question.type === 'EMAIL' ? 'email' : question.type === 'TEL' ? 'tel' : 'text'}
            inputMode={question.type === 'TEL' ? 'tel' : question.type === 'EMAIL' ? 'email' : undefined}
            maxLength={question.maxLength ?? undefined}
            placeholder={question.placeholder ?? undefined}
            value={answer.text ?? ''}
            onChange={(e) => onChange({ ...answer, text: e.target.value })}
            invalid={Boolean(error)}
          />
        </Field>
      )

    case 'TEXTAREA':
      return (
        <Field {...commonFieldProps} htmlFor={id}>
          <TextArea
            id={id}
            maxLength={question.maxLength ?? 1000}
            placeholder={question.placeholder ?? undefined}
            value={answer.text ?? ''}
            onChange={(e) => onChange({ ...answer, text: e.target.value })}
            invalid={Boolean(error)}
          />
        </Field>
      )

    case 'NUMBER':
      return (
        <Field {...commonFieldProps} htmlFor={id}>
          <TextInput
            id={id}
            type="number"
            inputMode="numeric"
            min={question.minValue ?? undefined}
            max={question.maxValue ?? undefined}
            value={answer.number ?? ''}
            onChange={(e) =>
              onChange({ ...answer, number: e.target.value === '' ? null : Number(e.target.value) })
            }
            invalid={Boolean(error)}
            className="max-w-40"
          />
        </Field>
      )

    case 'DATE':
      return (
        <Field {...commonFieldProps} htmlFor={id}>
          <TextInput
            id={id}
            type="date"
            value={answer.date ?? ''}
            onChange={(e) => onChange({ ...answer, date: e.target.value })}
            invalid={Boolean(error)}
            className="max-w-56"
          />
        </Field>
      )

    case 'RATING':
      return (
        <Field {...commonFieldProps} asFieldset>
          <RatingInput
            name={question.key}
            min={question.ratingMin ?? 0}
            max={question.ratingMax ?? 5}
            value={answer.number ?? null}
            onChange={(number) => onChange({ ...answer, number })}
            labels={RATING_LABELS}
            invalid={Boolean(error)}
          />
        </Field>
      )

    case 'RADIO':
      return (
        <Field {...commonFieldProps} asFieldset>
          <RadioGroup
            name={question.key}
            columns={question.options.length > 4 ? 2 : 1}
            value={selected[0]?.value ?? null}
            onChange={(optionValue) => setOptions([{ value: optionValue }])}
            invalid={Boolean(error)}
            options={question.options.map((o) => ({ value: o.value, label: o.label }))}
          />
          <OtherText
            id={id}
            option={otherOption}
            selected={selected}
            onChange={setOptions}
            invalid={Boolean(error)}
          />
        </Field>
      )

    case 'SELECT':
      return (
        <Field {...commonFieldProps} htmlFor={id}>
          <Combobox
            id={id}
            options={question.options.map((o) => ({ value: o.value, label: o.label }))}
            value={selected[0]?.value ?? null}
            onChange={(optionValue) => setOptions(optionValue ? [{ value: optionValue }] : [])}
            placeholder="Select an option"
            invalid={Boolean(error)}
          />
          <OtherText
            id={id}
            option={otherOption}
            selected={selected}
            onChange={setOptions}
            invalid={Boolean(error)}
          />
        </Field>
      )

    case 'CHECKBOX':
    case 'MULTISELECT':
      return (
        <Field {...commonFieldProps} asFieldset>
          <CheckboxGroup
            name={question.key}
            columns={2}
            values={selected.map((s) => s.value)}
            onToggle={(optionValue, checked) =>
              setOptions(
                checked
                  ? [...selected, { value: optionValue }]
                  : selected.filter((s) => s.value !== optionValue),
              )
            }
            invalid={Boolean(error)}
            options={question.options.map((o) => ({ value: o.value, label: o.label }))}
          />
          <OtherText
            id={id}
            option={otherOption}
            selected={selected}
            onChange={setOptions}
            invalid={Boolean(error)}
          />
        </Field>
      )

    case 'FILE':
      return (
        <Field {...commonFieldProps} htmlFor={id}>
          <FileAnswer
            id={id}
            question={question}
            documentId={answer.documentId ?? null}
            onChange={(documentId) => onChange({ ...answer, documentId })}
            invalid={Boolean(error)}
          />
        </Field>
      )

    default:
      return null
  }
}

/** Free-text box revealed when an "Other" option is chosen. */
function OtherText({
  id,
  option,
  selected,
  onChange,
  invalid,
}: {
  id: string
  option: { value: string; label: string } | undefined
  selected: { value: string; otherText?: string | null }[]
  onChange: (next: { value: string; otherText?: string | null }[]) => void
  invalid?: boolean
}) {
  if (!option) return null
  const current = selected.find((s) => s.value === option.value)

  return (
    <div className="mt-3">
      <label htmlFor={`${id}-other`} className="mb-1 block text-sm font-semibold text-ink">
        Please specify
      </label>
      <TextInput
        id={`${id}-other`}
        maxLength={200}
        value={current?.otherText ?? ''}
        onChange={(event) =>
          onChange(
            selected.map((s) => (s.value === option.value ? { ...s, otherText: event.target.value } : s)),
          )
        }
        invalid={invalid}
      />
    </div>
  )
}

/** File upload for FILE-type questions. */
function FileAnswer({
  id,
  question,
  documentId,
  onChange,
  invalid,
}: {
  id: string
  question: QuestionDef
  documentId: string | null
  onChange: (documentId: string | null) => void
  invalid?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  const accept = question.allowedMimeTypes.length > 0 ? question.allowedMimeTypes.join(',') : 'image/*,application/pdf'

  function upload(file: File | undefined) {
    setError(null)
    if (!file) return
    setFileName(file.name)

    const formData = new FormData()
    formData.append('file', file)

    startTransition(async () => {
      // Caught here so a failed upload stays an inline error — see PhotoUpload.
      const result = await uploadAnswerFileAction(question.id, formData).catch(() => null)
      if (!result?.ok) {
        setError(result?.error ?? 'We could not upload that file. Please try again.')
        setFileName(null)
        return
      }
      onChange(result.data.documentId)
    })
  }

  return (
    <div className="space-y-3">
      <label htmlFor={id} className="sr-only">
        {question.label}
      </label>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(event) => upload(event.target.files?.[0])}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" isLoading={pending} onClick={() => inputRef.current?.click()}>
          {!pending && <Paperclip aria-hidden className="size-4" />}
          {documentId ? 'Replace file' : 'Choose file'}
        </Button>

        {documentId && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <FileCheck2 aria-hidden className="size-4" />
            {fileName ?? 'File uploaded'}
          </span>
        )}
      </div>

      <p className="text-xs text-muted">
        {question.allowedMimeTypes.length > 0
          ? question.allowedMimeTypes.map((m) => m.split('/')[1]!.toUpperCase()).join(', ')
          : 'Image or PDF'}
        {' · '}
        up to {humanFileSizeLabel(question.maxFileSizeKb)}
      </p>

      {(error || invalid) && error && <Alert tone="danger">{error}</Alert>}
    </div>
  )
}
