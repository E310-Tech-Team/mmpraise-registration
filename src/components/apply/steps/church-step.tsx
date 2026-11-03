'use client'

import { saveChurchAction } from '@/app/(volunteer)/apply/actions'
import { StepShell } from '@/components/apply/step-shell'
import { useReferenceList } from '@/components/apply/use-reference'
import { useStepForm } from '@/components/apply/use-step-form'
import { Combobox } from '@/components/ui/combobox'
import { Alert } from '@/components/ui/primitives'
import { Field, RadioGroup, TextInput } from '@/components/ui/form'
import { churchSchema, DENOMINATIONS, type ChurchFormValues } from '@/lib/validation/registration'

const LABELS: Record<string, string> = {
  denomination: 'Denomination',
  churchRegionId: 'RCCG region',
  churchProvinceId: 'RCCG province',
  parishId: 'Parish',
  churchName: 'Church name',
}

export function ChurchStep({
  initialValues,
  regions,
}: {
  initialValues: ChurchFormValues
  regions: { id: string; name: string }[]
}) {
  const form = useStepForm<ChurchFormValues>({
    step: 'church',
    initialValues,
    schema: churchSchema,
    action: saveChurchAction,
    nextHref: '/apply/department',
  })

  const isRccg = form.values.denomination === 'RCCG'
  const isOtherChristian = form.values.denomination === 'OTHER_CHRISTIAN'

  const { items: provinces, loading: provincesLoading, error: provincesError } = useReferenceList(
    'church-provinces',
    isRccg ? form.values.churchRegionId : null,
  )
  const { items: parishes, loading: parishesLoading } = useReferenceList(
    'parishes',
    isRccg ? form.values.churchProvinceId : null,
  )

  return (
    <StepShell
      stepNumber={2}
      title="Church information"
      description="Everyone is welcome to serve. Church details help us group volunteers for briefings."
      errors={form.errors}
      errorLabels={LABELS}
      formError={form.formError}
      pending={form.pending}
      saveState={form.saveState}
      onSubmit={form.submit}
      onSaveAndExit={form.saveAndExit}
    >
      <Field label="Denomination" required error={form.errors.denomination} asFieldset>
        <RadioGroup
          name="denomination"
          value={form.values.denomination ?? null}
          onChange={(value) =>
            // Switching denomination clears the fields that no longer apply.
            form.patch({
              denomination: value,
              churchRegionId: null,
              churchProvinceId: null,
              parishId: null,
              parishNameOther: '',
              churchName: '',
            })
          }
          invalid={Boolean(form.errors.denomination)}
          options={DENOMINATIONS.map((d) => ({ value: d.value, label: d.label }))}
        />
      </Field>

      {isRccg && (
        <div className="space-y-6 rounded-card border border-line bg-surface-sunken p-5">
          <Field label="RCCG region" htmlFor="field-churchRegionId" required error={form.errors.churchRegionId}>
            <Combobox
              id="field-churchRegionId"
              options={regions.map((r) => ({ value: r.id, label: r.name }))}
              value={form.values.churchRegionId ?? null}
              onChange={(value) =>
                form.patch({ churchRegionId: value, churchProvinceId: null, parishId: null, parishNameOther: '' })
              }
              placeholder="Search regions"
              invalid={Boolean(form.errors.churchRegionId)}
            />
          </Field>

          {form.values.churchRegionId && (
            <Field label="RCCG province" htmlFor="field-churchProvinceId" required error={form.errors.churchProvinceId}>
              {provincesError ? (
                <Alert tone="danger">{provincesError}</Alert>
              ) : (
                <Combobox
                  id="field-churchProvinceId"
                  options={provinces.map((p) => ({ value: p.id, label: p.name }))}
                  value={form.values.churchProvinceId ?? null}
                  onChange={(value) => form.patch({ churchProvinceId: value, parishId: null, parishNameOther: '' })}
                  placeholder={provincesLoading ? 'Loading…' : 'Search provinces'}
                  loading={provincesLoading}
                  invalid={Boolean(form.errors.churchProvinceId)}
                  emptyMessage="No provinces listed for this region yet"
                />
              )}
            </Field>
          )}

          {form.values.churchProvinceId && (
            <>
              <Field
                label="Parish"
                htmlFor="field-parishId"
                error={form.errors.parishId}
                help="Choose from the list."
              >
                <Combobox
                  id="field-parishId"
                  options={parishes.map((p) => ({ value: p.id, label: p.name }))}
                  value={form.values.parishId ?? null}
                  onChange={(value) => form.setValue('parishId', value)}
                  placeholder={parishesLoading ? 'Loading…' : 'Search parishes'}
                  loading={parishesLoading}
                  emptyMessage="No parishes listed"
                />
              </Field>
            </>
          )}
        </div>
      )}

      {isOtherChristian && (
        <Field label="Church name" htmlFor="field-churchName" required error={form.errors.churchName}>
          <TextInput
            id="field-churchName"
            maxLength={120}
            value={form.values.churchName ?? ''}
            onChange={(e) => form.setValue('churchName', e.target.value)}
            invalid={Boolean(form.errors.churchName)}
          />
        </Field>
      )}

      {form.values.denomination === 'NON_CHRISTIAN' && (
        <Alert tone="info" title="No further church details needed">
          Thank you — you are very welcome to serve. We will not ask you for church information.
        </Alert>
      )}
    </StepShell>
  )
}
