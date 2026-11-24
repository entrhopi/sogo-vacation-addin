import { useEffect, useMemo, useState } from 'react'
import { ApiError, type VacationResponse } from './api'
import type { MessageKey, Translator } from './i18n'
import {
  formFromView,
  isDirty,
  patchFromForm,
  validateForm,
  type VacationFormState,
  type ValidationError,
} from './vacation-form'

const VALIDATION_KEYS: Record<ValidationError, MessageKey> = {
  messageRequired: 'validationMessage',
  dateRequired: 'validationDate',
  dateOrder: 'validationDateOrder',
  timeRequired: 'validationTime',
}

const SAVE_ERROR_KEYS: Record<string, MessageKey> = {
  BAD_CREDENTIALS: 'errorBadCredentials',
  MAILBOX_NOT_FOUND: 'errorMailboxNotFound',
  RATE_LIMITED: 'errorRateLimited',
  IMAP_UNAVAILABLE: 'errorImapUnavailable',
  SOGO_UNAVAILABLE: 'errorSogoUnavailable',
  INVALID_REQUEST: 'errorInvalidSettings',
  NETWORK: 'errorNetwork',
}

export interface VacationEditorProps {
  mailbox: string
  data: VacationResponse
  t: Translator
  onSave: (patch: Record<string, unknown>) => Promise<void>
}

export function VacationEditor({ mailbox, data, t, onSave }: VacationEditorProps) {
  const initial = useMemo(() => formFromView(data.vacation), [data])
  const [form, setForm] = useState<VacationFormState>(initial)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    setForm(formFromView(data.vacation))
  }, [data])

  const validation = validateForm(form)
  const dirty = isDirty(form, initial)
  const canSave = dirty && validation === null && !saving

  function update<K extends keyof VacationFormState>(key: K, value: VacationFormState[K]): void {
    setForm((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  async function save(): Promise<void> {
    setSaving(true)
    setError(null)
    try {
      await onSave(
        patchFromForm(form, {
          seedAddresses: data.configured ? undefined : [mailbox],
        }),
      )
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2_500)
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught : new ApiError('UNEXPECTED', 'Unexpected error'),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="editor">
      <label className="switch">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(event) => update('enabled', event.target.checked)}
        />
        <span>{t('enabledLabel')}</span>
      </label>

      <div className="row">
        <label className="row__check">
          <input
            type="checkbox"
            checked={form.startDateEnabled}
            onChange={(event) => update('startDateEnabled', event.target.checked)}
          />
          <span>{t('from')}</span>
        </label>
        <input
          type="date"
          value={form.startDate}
          disabled={!form.startDateEnabled}
          onChange={(event) => update('startDate', event.target.value)}
        />
        <label className="row__check">
          <input
            type="checkbox"
            checked={form.startTimeEnabled}
            disabled={!form.startDateEnabled}
            onChange={(event) => update('startTimeEnabled', event.target.checked)}
          />
          <span>{t('time')}</span>
        </label>
        <input
          type="time"
          value={form.startTime}
          disabled={!form.startDateEnabled || !form.startTimeEnabled}
          onChange={(event) => update('startTime', event.target.value)}
        />
      </div>

      <div className="row">
        <label className="row__check">
          <input
            type="checkbox"
            checked={form.endDateEnabled}
            onChange={(event) => update('endDateEnabled', event.target.checked)}
          />
          <span>{t('until')}</span>
        </label>
        <input
          type="date"
          value={form.endDate}
          disabled={!form.endDateEnabled}
          onChange={(event) => update('endDate', event.target.value)}
        />
        <label className="row__check">
          <input
            type="checkbox"
            checked={form.endTimeEnabled}
            disabled={!form.endDateEnabled}
            onChange={(event) => update('endTimeEnabled', event.target.checked)}
          />
          <span>{t('time')}</span>
        </label>
        <input
          type="time"
          value={form.endTime}
          disabled={!form.endDateEnabled || !form.endTimeEnabled}
          onChange={(event) => update('endTime', event.target.value)}
        />
      </div>

      <label className="row__check">
        <input
          type="checkbox"
          checked={form.customSubjectEnabled}
          onChange={(event) => update('customSubjectEnabled', event.target.checked)}
        />
        <span>{t('customSubject')}</span>
      </label>
      <input
        type="text"
        value={form.subject}
        disabled={!form.customSubjectEnabled}
        maxLength={500}
        onChange={(event) => update('subject', event.target.value)}
      />

      <label className="field">
        <span>{t('message')}</span>
        <textarea
          value={form.message}
          rows={6}
          maxLength={10_000}
          onChange={(event) => update('message', event.target.value)}
        />
      </label>

      <label className="row__check">
        <input
          type="checkbox"
          checked={form.ignoreLists}
          onChange={(event) => update('ignoreLists', event.target.checked)}
        />
        <span>{t('ignoreLists')}</span>
      </label>

      {validation && <p className="validation">{t(VALIDATION_KEYS[validation])}</p>}

      {error && (
        <section className="error" role="alert">
          <h2>{t('saveErrorTitle')}</h2>
          <p>{t(SAVE_ERROR_KEYS[error.code] ?? 'errorGeneric')}</p>
          <p className="error__meta">
            <code>{error.code}</code>
            {error.retryable ? ` · ${t('retryHint')}` : ''}
          </p>
        </section>
      )}

      <div className="actions">
        <button type="button" onClick={() => void save()} disabled={!canSave}>
          {saving ? t('saving') : t('save')}
        </button>
        {saved && <span className="success">{t('saved')}</span>}
      </div>

      <p className="note note--muted">{t('noteLive')}</p>
    </section>
  )
}
