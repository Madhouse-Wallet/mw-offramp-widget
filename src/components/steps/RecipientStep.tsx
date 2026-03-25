import React, { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { CurrencySelect, countryFlag, isCountryField } from '../ui/CurrencySelect'
import { Spinner } from '../ui/Spinner'
import {
  getAccountRequirements,
  refreshAccountRequirements,
  createRecipient,
} from '../../api/client'
import type {
  OrderState,
  AccountType,
  RequirementsField,
} from '../../types'

const DEFAULT_TRANSFER_PURPOSE = 'verification.transfers.purpose.pay.bills'

interface RecipientStepProps {
  orderState: Partial<OrderState>
  onNext: (data: Partial<OrderState>) => void
  onBack: () => void
  onSessionExpired: () => void
}

export function RecipientStep({ orderState, onNext, onBack, onSessionExpired }: RecipientStepProps) {
  const currency = orderState.currency ?? 'EUR'

  const [accountTypes, setAccountTypes] = useState<AccountType[]>([])
  const [selectedType, setSelectedType] = useState<string>('')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({
    accountHolderName: '',
  })
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [loadingReqs, setLoadingReqs] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [reqError, setReqError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const refreshPendingRef = useRef<string | null>(null)

  useEffect(() => {
    setLoadingReqs(true)
    setReqError(null)
    getAccountRequirements(currency)
      .then((res) => {
        const types = (res.data ?? []).filter((t) => t.type !== 'email')
        setAccountTypes(types)
        if (types.length > 0) {
          setSelectedType(types[0].type)
          prefillDefaults(types[0])
        }
      })
      .catch((err: unknown) => {
        const e = err as Error & { status?: number }
        if (e.status === 401) { onSessionExpired(); return }
        setReqError(e.message || 'Failed to load account requirements')
      })
      .finally(() => setLoadingReqs(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency])

  function prefillDefaults(accountType: AccountType) {
    setFieldValues((prev) => {
      const next = { ...prev }
      for (const group of accountType.fields) {
        for (const field of group.group) {
          if (field.key === 'transferPurpose' && !next[field.key]) {
            const defaultOpt = field.valuesAllowed?.find(
              (v) => v.key === DEFAULT_TRANSFER_PURPOSE,
            )
            if (defaultOpt) next[field.key] = DEFAULT_TRANSFER_PURPOSE
            else if (field.valuesAllowed?.[0]) next[field.key] = field.valuesAllowed[0].key
          }
          if (field.type === 'select' && field.valuesAllowed?.[0] && !next[field.key]) {
            next[field.key] = field.valuesAllowed[0].key
          }
          if (field.type === 'radio' && field.valuesAllowed?.[0] && !next[field.key]) {
            next[field.key] = field.valuesAllowed[0].key
          }
        }
      }
      return next
    })
  }

  const currentAccountType = accountTypes.find((t) => t.type === selectedType)

  const handleTypeChange = (newType: string) => {
    setSelectedType(newType)
    const at = accountTypes.find((t) => t.type === newType)
    if (at) prefillDefaults(at)
    setFieldErrors({})
    setSubmitError(null)
  }

  const doRefresh = useCallback(
    async (changedKey: string, currentValues: Record<string, string>) => {
      if (!selectedType) return
      setRefreshing(true)
      refreshPendingRef.current = changedKey
      try {
        const res = await refreshAccountRequirements(currency, selectedType, currentValues)
        const types = (res.data ?? []).filter((t) => t.type !== 'email')
        setAccountTypes(types)
        const refreshed = types.find((t) => t.type === selectedType)
        if (refreshed) prefillDefaults(refreshed)
      } catch {
        // Non-fatal — keep current fields
      } finally {
        if (refreshPendingRef.current === changedKey) {
          refreshPendingRef.current = null
        }
        setRefreshing(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currency, selectedType],
  )

  function handleFieldChange(field: RequirementsField, value: string) {
    const updated = { ...fieldValues, [field.key]: value }
    setFieldValues(updated)
    if (fieldErrors[field.key]) {
      setFieldErrors((prev) => { const n = { ...prev }; delete n[field.key]; return n })
    }
    if (field.refreshRequirementsOnChange) {
      void doRefresh(field.key, updated)
    }
  }

  function validateFields(): boolean {
    if (!currentAccountType) return false
    const errors: Record<string, string> = {}

    if (!fieldValues.accountHolderName?.trim()) {
      errors.accountHolderName = 'Name is required'
    }

    for (const group of currentAccountType.fields) {
      for (const field of group.group) {
        const val = fieldValues[field.key] ?? ''
        if (field.required && !val.trim()) {
          errors[field.key] = `${field.name} is required`
          continue
        }
        if (val && field.validationRegexp) {
          try {
            const re = new RegExp(field.validationRegexp)
            if (!re.test(val.slice(0, 200))) {
              errors[field.key] = `Invalid ${field.name.toLowerCase()}`
              if (field.example) errors[field.key] += ` (e.g. ${field.example})`
            }
          } catch {
            // Malformed regexp from server — skip client-side validation, server will validate
          }
        }
        if (val && field.minLength && val.length < field.minLength) {
          errors[field.key] = `Must be at least ${field.minLength} characters`
        }
        if (val && field.maxLength && val.length > field.maxLength) {
          errors[field.key] = `Must be at most ${field.maxLength} characters`
        }
      }
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSubmit() {
    if (!validateFields()) return
    if (!currentAccountType) return

    setSubmitting(true)
    setSubmitError(null)

    const details: Record<string, string> = {}
    for (const group of currentAccountType.fields) {
      for (const field of group.group) {
        const val = fieldValues[field.key]
        if (val != null && val !== '') {
          details[field.key] = val
        }
      }
    }

    try {
      const recipient = await createRecipient({
        currency,
        type: selectedType,
        accountHolderName: fieldValues.accountHolderName,
        details,
      })
      onNext({
        recipientId: recipient.id,
        recipientName: recipient.accountHolderName,
        recipientType: recipient.type,
        recipientDetails: recipient.details,
      })
    } catch (err) {
      const e = err as Error & { status?: number }
      if (e.status === 401) { onSessionExpired(); return }
      setSubmitError(e.message || 'Failed to create recipient')
    } finally {
      setSubmitting(false)
    }
  }

  function renderField(field: RequirementsField) {
    const value = fieldValues[field.key] ?? ''
    const error = fieldErrors[field.key]

    if (field.type === 'select' && field.valuesAllowed) {
      const keys = field.valuesAllowed.map((v) => v.key)
      if (isCountryField(keys)) {
        return (
          <CurrencySelect
            key={field.key}
            label={field.name}
            value={value}
            onChange={(val) => handleFieldChange(field, val)}
            options={field.valuesAllowed.map((v) => ({
              value: v.key,
              label: v.name,
              flag: countryFlag(v.key) ?? '🌐',
            }))}
            error={error}
            required={field.required}
          />
        )
      }
      return (
        <Select
          key={field.key}
          label={field.name}
          value={value}
          onChange={(e) => handleFieldChange(field, e.target.value)}
          options={field.valuesAllowed.map((v) => ({ value: v.key, label: v.name }))}
          error={error}
          required={field.required}
        />
      )
    }

    if (field.type === 'radio' && field.valuesAllowed) {
      return (
        <div key={field.key} className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            {field.name}
            {field.required && <span className="ml-1 text-orange-500">*</span>}
          </label>
          <div className="flex flex-wrap gap-3">
            {field.valuesAllowed.map((opt) => (
              <label key={opt.key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name={field.key}
                  value={opt.key}
                  checked={value === opt.key}
                  onChange={() => handleFieldChange(field, opt.key)}
                  className="accent-orange-500"
                />
                <span className="text-sm text-gray-700">{opt.name}</span>
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )
    }

    return (
      <Input
        key={field.key}
        label={field.name}
        type="text"
        value={value}
        onChange={(e) => handleFieldChange(field, e.target.value)}
        placeholder={field.example ?? ''}
        error={error}
        required={field.required}
        minLength={field.minLength}
        maxLength={field.maxLength}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Recipient Details</h2>
        <p className="mt-0.5 text-sm text-gray-500">
          Where should we send {currency}?
        </p>
      </div>

      {loadingReqs ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500">
          <Spinner size={18} />
          <span>Loading account fields…</span>
        </div>
      ) : reqError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {reqError}
        </div>
      ) : (
        <div className="space-y-4">
          {accountTypes.length > 1 && (
            <Select
              label="Account Type"
              value={selectedType}
              onChange={(e) => handleTypeChange(e.target.value)}
              options={accountTypes.map((t) => ({ value: t.type, label: t.title }))}
            />
          )}

          <Input
            label="Account Holder Name"
            type="text"
            value={fieldValues.accountHolderName ?? ''}
            onChange={(e) =>
              setFieldValues((prev) => ({ ...prev, accountHolderName: e.target.value }))
            }
            error={fieldErrors.accountHolderName}
            placeholder="Full legal name"
            required
          />

          {refreshing && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Spinner size={12} />
              <span>Updating fields…</span>
            </div>
          )}
          {currentAccountType?.fields.map((group) =>
            group.group.map((field) => renderField(field)),
          )}

          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {submitError}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button
          variant="primary"
          onClick={() => void handleSubmit()}
          loading={submitting}
          disabled={loadingReqs || !!reqError}
          className="flex-1"
        >
          Continue
        </Button>
      </div>
    </div>
  )
}
