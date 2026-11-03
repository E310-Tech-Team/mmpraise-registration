'use client'

import { useMemo } from 'react'
import { savePersonalAction } from '@/app/(volunteer)/apply/actions'
import { PhotoUpload } from '@/components/apply/photo-upload'
import { StepShell } from '@/components/apply/step-shell'
import { useReferenceList } from '@/components/apply/use-reference'
import { useStepForm } from '@/components/apply/use-step-form'
import { Combobox } from '@/components/ui/combobox'
import { Alert } from '@/components/ui/primitives'
import { Checkbox, Field, RadioGroup, TextArea, TextInput } from '@/components/ui/form'
import { toE164 } from '@/lib/validation/common'
import {
  AGE_RANGES,
  ALWAYS_MINOR_RANGES,
  ASK_IF_MINOR_RANGES,
  personalSchema,
  type PersonalFormValues,
} from '@/lib/validation/registration'

type CountryOption = { id: string; iso2: string; name: string; phoneCode: string; hasStates: boolean }
type Lookup = { value: string; label: string; requiresText: boolean }

const LABELS: Record<string, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  gender: 'Gender',
  email: 'Email address',
  phoneLocal: 'Phone number',
  phoneDialCode: 'Country code',
  ageRange: 'Age range',
  isMinor: 'Age confirmation',
  guardianName: 'Parent or guardian name',
  guardianPhone: 'Parent or guardian phone',
  guardianConsent: 'Parental consent',
  countryId: 'Country',
  stateId: 'State or province',
  stateNameOther: 'State or province',
  city: 'City or town',
  addressLine: 'Residential address',
  occupation: 'Occupation',
  occupationOther: 'Occupation (other)',
  education: 'Educational qualification',
  educationOther: 'Qualification (other)',
  emergencyName: 'Emergency contact name',
  emergencyRelationship: 'Emergency contact relationship',
  emergencyPhone: 'Emergency contact phone',
}

export function PersonalStep({
  initialValues,
  countries,
  occupations,
  educationLevels,
}: {
  initialValues: PersonalFormValues
  countries: CountryOption[]
  occupations: Lookup[]
  educationLevels: Lookup[]
}) {
  const form = useStepForm<PersonalFormValues>({
    step: 'personal',
    initialValues,
    schema: personalSchema,
    action: savePersonalAction,
    nextHref: '/apply/church',
    // The stored phone number is always the E.164 combination of the two inputs.
    prepare: (values) => ({ ...values, phone: toE164(values.phoneDialCode, values.phoneLocal) }),
  })

  const dialOptions = useMemo(
    () =>
      countries.map((country) => ({
        value: country.phoneCode,
        label: `${country.name} +${country.phoneCode}`,
        hint: country.iso2,
      })),
    [countries],
  )

  const countryOptions = useMemo(
    () => countries.map((country) => ({ value: country.id, label: country.name })),
    [countries],
  )

  const selectedCountry = countries.find((c) => c.id === form.values.countryId) ?? null
  const hasStates = Boolean(selectedCountry?.hasStates)

  const { items: states, loading: statesLoading, error: statesError } = useReferenceList(
    'states',
    hasStates ? form.values.countryId : null,
  )

  const isAlwaysMinor = ALWAYS_MINOR_RANGES.includes(form.values.ageRange)
  const mustAskMinor = ASK_IF_MINOR_RANGES.includes(form.values.ageRange)
  const isMinor = isAlwaysMinor || (mustAskMinor && form.values.isMinor === true)

  const occupationNeedsText = occupations.find((o) => o.value === form.values.occupation)?.requiresText
  const educationNeedsText = educationLevels.find((o) => o.value === form.values.education)?.requiresText

  return (
    <StepShell
      stepNumber={1}
      title="Personal & Profile Information"
      description="Tell us about yourself, your location, professional background, and emergency contact."
      errors={form.errors}
      errorLabels={LABELS}
      formError={form.formError}
      pending={form.pending}
      saveState={form.saveState}
      onSubmit={form.submit}
      onSaveAndExit={form.saveAndExit}
    >
      {/* 1. Identity & Contact */}
      <section className="space-y-6">
        <h3 className="font-display text-lg font-bold text-ink">Personal Details</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" htmlFor="field-firstName" required error={form.errors.firstName}>
            <TextInput
              id="field-firstName"
              autoComplete="given-name"
              required
              value={form.values.firstName ?? ''}
              onChange={(e) => form.setValue('firstName', e.target.value)}
              invalid={Boolean(form.errors.firstName)}
            />
          </Field>

          <Field label="Last name" htmlFor="field-lastName" required error={form.errors.lastName}>
            <TextInput
              id="field-lastName"
              autoComplete="family-name"
              required
              value={form.values.lastName ?? ''}
              onChange={(e) => form.setValue('lastName', e.target.value)}
              invalid={Boolean(form.errors.lastName)}
            />
          </Field>
        </div>

        <Field label="Gender" required error={form.errors.gender} asFieldset>
          <RadioGroup
            name="gender"
            options={[
              { value: 'MALE', label: 'Male' },
              { value: 'FEMALE', label: 'Female' },
            ]}
            value={form.values.gender ?? ''}
            onChange={(value) => form.setValue('gender', value)}
            invalid={Boolean(form.errors.gender)}
          />
        </Field>

        <Field
          label="Email address"
          htmlFor="field-email"
          required
          error={form.errors.email}
          help="We will send shifts, updates and announcements here."
        >
          <TextInput
            id="field-email"
            type="email"
            autoComplete="email"
            required
            value={form.values.email ?? ''}
            onChange={(e) => form.setValue('email', e.target.value)}
            invalid={Boolean(form.errors.email)}
          />
        </Field>

        <div className="space-y-2">
          <span className="block text-sm font-semibold text-ink">
            Phone number <span className="text-danger">*</span>
          </span>
          <div className="grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)]">
            <Combobox
              id="field-phoneDialCode"
              options={dialOptions}
              value={form.values.phoneDialCode ?? null}
              onChange={(value) => form.setValue('phoneDialCode', value ?? '')}
              placeholder="Country code"
              invalid={Boolean(form.errors.phoneDialCode)}
            />
            <TextInput
              id="field-phoneLocal"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              placeholder="e.g. 801 234 5678"
              value={form.values.phoneLocal ?? ''}
              onChange={(e) => form.setValue('phoneLocal', e.target.value)}
              invalid={Boolean(form.errors.phoneLocal)}
            />
          </div>
          {form.errors.phoneLocal && <p className="text-sm font-medium text-danger">{form.errors.phoneLocal}</p>}
          {form.errors.phoneDialCode && !form.errors.phoneLocal && (
            <p className="text-sm font-medium text-danger">{form.errors.phoneDialCode}</p>
          )}
        </div>

        <Field label="Age range" required error={form.errors.ageRange} asFieldset>
          <RadioGroup
            name="ageRange"
            options={[...AGE_RANGES]}
            value={form.values.ageRange ?? ''}
            onChange={(value) => form.patch({ ageRange: value, isMinor: null })}
            invalid={Boolean(form.errors.ageRange)}
          />
        </Field>

        {mustAskMinor && (
          <Field
            label="Are you under 18 years old?"
            required
            error={form.errors.isMinor}
            help="Volunteers under 18 need parental or guardian consent."
            asFieldset
          >
            <RadioGroup
              name="isMinor"
              options={[
                { value: 'yes', label: 'Yes, I am under 18' },
                { value: 'no', label: 'No, I am 18 or older' },
              ]}
              value={form.values.isMinor === null ? '' : form.values.isMinor ? 'yes' : 'no'}
              onChange={(value) => form.setValue('isMinor', value === 'yes')}
              invalid={Boolean(form.errors.isMinor)}
            />
          </Field>
        )}

        {isMinor && (
          <div className="space-y-4 rounded-card border border-line bg-surface-subtle p-5">
            <Alert tone="info" title="Parental or guardian consent required">
              Volunteers under 18 need a parent or guardian to consent and to be reachable during the event.
            </Alert>
            <Field label="Parent or guardian full name" htmlFor="field-guardianName" required error={form.errors.guardianName}>
              <TextInput
                id="field-guardianName"
                value={form.values.guardianName ?? ''}
                onChange={(e) => form.setValue('guardianName', e.target.value)}
                invalid={Boolean(form.errors.guardianName)}
              />
            </Field>
            <Field label="Parent or guardian phone number" htmlFor="field-guardianPhone" required error={form.errors.guardianPhone}>
              <TextInput
                id="field-guardianPhone"
                type="tel"
                placeholder="+234..."
                value={form.values.guardianPhone ?? ''}
                onChange={(e) => form.setValue('guardianPhone', e.target.value)}
                invalid={Boolean(form.errors.guardianPhone)}
              />
            </Field>
            <Checkbox
              name="guardianConsent"
              checked={form.values.guardianConsent ?? false}
              onChange={(checked) => form.setValue('guardianConsent', checked)}
              invalid={Boolean(form.errors.guardianConsent)}
              label="I confirm that my parent or guardian has consented to my volunteering."
            />
          </div>
        )}

        <div className="space-y-2">
          <span className="block text-sm font-semibold text-ink">Profile photograph</span>
          <p className="text-xs text-muted">
            Upload a clear, recent picture of your face. Used for accreditation and volunteer badge identification.
          </p>
          <PhotoUpload
            documentId={form.values.photoDocumentId}
            onChange={(id) => form.setValue('photoDocumentId', id)}
            error={form.errors.photoDocumentId}
          />
        </div>
      </section>

      {/* 2. Location */}
      <section className="space-y-6 pt-4 border-t border-line">
        <h3 className="font-display text-lg font-bold text-ink">Location</h3>

        <Field label="Country" htmlFor="field-countryId" required error={form.errors.countryId} help="Start typing to search the list.">
          <Combobox
            id="field-countryId"
            options={countryOptions}
            value={form.values.countryId ?? null}
            onChange={(value) => {
              const country = countries.find((c) => c.id === value)
              form.patch({
                countryId: value ?? '',
                countryHasStates: Boolean(country?.hasStates),
                stateId: null,
                stateNameOther: '',
              })
            }}
            placeholder="Search countries"
            invalid={Boolean(form.errors.countryId)}
          />
        </Field>

        {hasStates ? (
          <Field
            label="State or province"
            htmlFor="field-stateId"
            required
            error={form.errors.stateId}
            help={statesLoading ? 'Loading states…' : undefined}
          >
            {statesError ? (
              <Alert tone="danger">Could not load states for this country. Please try again.</Alert>
            ) : (
              <Combobox
                id="field-stateId"
                options={states.map((s) => ({ value: s.id, label: s.name }))}
                value={form.values.stateId ?? null}
                onChange={(value) => form.setValue('stateId', value)}
                placeholder={statesLoading ? 'Loading…' : 'Search states or provinces'}
                disabled={statesLoading || !form.values.countryId}
                invalid={Boolean(form.errors.stateId)}
              />
            )}
          </Field>
        ) : (
          <Field
            label="State, province or region"
            htmlFor="field-stateNameOther"
            required
            error={form.errors.stateNameOther}
            help="Enter the state, province or region name."
          >
            <TextInput
              id="field-stateNameOther"
              value={form.values.stateNameOther ?? ''}
              onChange={(e) => form.setValue('stateNameOther', e.target.value)}
              disabled={!form.values.countryId}
              invalid={Boolean(form.errors.stateNameOther)}
            />
          </Field>
        )}

        <Field label="City or town" htmlFor="field-city" required error={form.errors.city}>
          <TextInput
            id="field-city"
            autoComplete="address-level2"
            required
            value={form.values.city ?? ''}
            onChange={(e) => form.setValue('city', e.target.value)}
            invalid={Boolean(form.errors.city)}
          />
        </Field>

        <Field
          label="Residential address"
          htmlFor="field-addressLine"
          error={form.errors.addressLine}
          help="Optional. Street name, estate or area."
        >
          <TextArea
            id="field-addressLine"
            rows={2}
            autoComplete="street-address"
            value={form.values.addressLine ?? ''}
            onChange={(e) => form.setValue('addressLine', e.target.value)}
            invalid={Boolean(form.errors.addressLine)}
          />
        </Field>
      </section>

      {/* 3. Professional & Educational */}
      <section className="space-y-6 pt-4 border-t border-line">
        <h3 className="font-display text-lg font-bold text-ink">Professional & Education</h3>

        <Field label="Occupation" htmlFor="field-occupation" required error={form.errors.occupation}>
          <Combobox
            id="field-occupation"
            options={occupations.map((o) => ({ value: o.value, label: o.label }))}
            value={form.values.occupation ?? null}
            onChange={(value) => form.patch({ occupation: value ?? '', occupationOther: '' })}
            placeholder="Search occupations"
            invalid={Boolean(form.errors.occupation)}
          />
        </Field>

        {occupationNeedsText && (
          <Field
            label="Please specify your occupation"
            htmlFor="field-occupationOther"
            required
            error={form.errors.occupationOther}
          >
            <TextInput
              id="field-occupationOther"
              required
              value={form.values.occupationOther ?? ''}
              onChange={(e) => form.setValue('occupationOther', e.target.value)}
              invalid={Boolean(form.errors.occupationOther)}
            />
          </Field>
        )}

        <Field label="Educational qualification" htmlFor="field-education" required error={form.errors.education}>
          <Combobox
            id="field-education"
            options={educationLevels.map((e) => ({ value: e.value, label: e.label }))}
            value={form.values.education ?? null}
            onChange={(value) => form.patch({ education: value ?? '', educationOther: '' })}
            placeholder="Search qualifications"
            invalid={Boolean(form.errors.education)}
          />
        </Field>

        {educationNeedsText && (
          <Field
            label="Please specify your qualification"
            htmlFor="field-educationOther"
            required
            error={form.errors.educationOther}
          >
            <TextInput
              id="field-educationOther"
              required
              value={form.values.educationOther ?? ''}
              onChange={(e) => form.setValue('educationOther', e.target.value)}
              invalid={Boolean(form.errors.educationOther)}
            />
          </Field>
        )}
      </section>

      {/* 4. Emergency Contact (moved to Personal, remove country code under it) */}
      <section className="space-y-6 pt-4 border-t border-line">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">Emergency Contact</h3>
          <p className="text-xs text-muted">Who should we contact if you need help during the event?</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name" htmlFor="field-emergencyName" required error={form.errors.emergencyName}>
            <TextInput
              id="field-emergencyName"
              placeholder="e.g. Jane Doe"
              value={form.values.emergencyName ?? ''}
              onChange={(e) => form.setValue('emergencyName', e.target.value)}
              invalid={Boolean(form.errors.emergencyName)}
            />
          </Field>

          <Field
            label="Relationship"
            htmlFor="field-emergencyRelationship"
            required
            error={form.errors.emergencyRelationship}
          >
            <TextInput
              id="field-emergencyRelationship"
              placeholder="e.g. Spouse, parent, sibling, friend"
              value={form.values.emergencyRelationship ?? ''}
              onChange={(e) => form.setValue('emergencyRelationship', e.target.value)}
              invalid={Boolean(form.errors.emergencyRelationship)}
            />
          </Field>
        </div>

        <Field
          label="Phone number"
          htmlFor="field-emergencyPhone"
          required
          error={form.errors.emergencyPhone}
          help="Direct contact telephone number."
        >
          <TextInput
            id="field-emergencyPhone"
            type="tel"
            inputMode="tel"
            value={form.values.emergencyPhone ?? ''}
            onChange={(e) => form.setValue('emergencyPhone', e.target.value)}
            invalid={Boolean(form.errors.emergencyPhone)}
          />
        </Field>
      </section>
    </StepShell>
  )
}
