import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError, getVacation, type VacationResponse, type VacationView } from './api'
import { createTranslator, resolveLanguage, type Language, type MessageKey } from './i18n'
import { readOfficeInfo, type OfficeInfo } from './office'

type Status = 'idle' | 'loading' | 'ready' | 'error'

const ERROR_KEYS: Record<string, MessageKey> = {
  BAD_CREDENTIALS: 'errorBadCredentials',
  MAILBOX_NOT_FOUND: 'errorMailboxNotFound',
  RATE_LIMITED: 'errorRateLimited',
  IMAP_UNAVAILABLE: 'errorImapUnavailable',
  SOGO_UNAVAILABLE: 'errorSogoUnavailable',
  NETWORK: 'errorNetwork',
}

function formatDate(epochSeconds: number, language: Language): string {
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
  }).format(new Date(epochSeconds * 1_000))
}

function period(vacation: VacationView, language: Language, t: ReturnType<typeof createTranslator>): string {
  const from = vacation.startDateEnabled && vacation.startDate ? formatDate(vacation.startDate, language) : null
  const to = vacation.endDateEnabled && vacation.endDate ? formatDate(vacation.endDate, language) : null
  if (!from && !to) {
    return t('notSet')
  }
  return `${from ?? '…'} → ${to ?? '…'}`
}

export function App() {
  const [office, setOffice] = useState<OfficeInfo | null>(null)
  const [mailbox, setMailbox] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [data, setData] = useState<VacationResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [language, setLanguage] = useState<Language>(resolveLanguage(navigator.language))

  const t = useMemo(() => createTranslator(language), [language])

  useEffect(() => {
    let cancelled = false
    void readOfficeInfo().then((info) => {
      if (cancelled) {
        return
      }
      setOffice(info)
      setLanguage(resolveLanguage(info.language))
      if (info.email) {
        setMailbox(info.email)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  async function load(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setStatus('loading')
    setError(null)
    try {
      const response = await getVacation(mailbox.trim(), password)
      setData(response)
      setStatus('ready')
    } catch (caught) {
      setData(null)
      setError(
        caught instanceof ApiError ? caught : new ApiError('UNEXPECTED', 'Unexpected error'),
      )
      setStatus('error')
    }
  }

  const vacation = data?.vacation ?? null

  return (
    <main className="pane">
      <header className="pane__header">
        <div>
          <h1>{t('title')}</h1>
          <p className="pane__subtitle">{t('subtitle')}</p>
        </div>
        {vacation && (
          <span className={vacation.enabled ? 'badge badge--on' : 'badge'}>
            {vacation.enabled ? t('statusOn') : t('statusOff')}
          </span>
        )}
      </header>

      {office && (
        <p className="hint">{office.inOutlook ? t('hintOutlook') : t('hintBrowser')}</p>
      )}

      <form className="form" onSubmit={load}>
        <label className="field">
          <span>{t('mailbox')}</span>
          <input
            type="email"
            value={mailbox}
            onChange={(event) => setMailbox(event.target.value)}
            autoComplete="username"
            required
            spellCheck={false}
          />
        </label>

        <label className="field">
          <span>{t('password')}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        <button type="submit" disabled={status === 'loading' || !mailbox || !password}>
          {status === 'loading' ? t('loading') : t('load')}
        </button>
      </form>

      <p className="note">{t('noteCredentials')}</p>

      {status === 'error' && error && (
        <section className="error" role="alert">
          <h2>{t('errorTitle')}</h2>
          <p>{t(ERROR_KEYS[error.code] ?? 'errorGeneric')}</p>
          <p className="error__meta">
            <code>{error.code}</code>
            {error.retryable ? ` · ${t('retryHint')}` : ''}
          </p>
        </section>
      )}

      {status === 'ready' && data && vacation && (
        <section className="state">
          {!data.configured && <p className="hint">{t('notConfigured')}</p>}

          <dl>
            <dt>{t('subject')}</dt>
            <dd>
              {vacation.customSubjectEnabled && vacation.customSubject
                ? vacation.customSubject
                : t('noSubject')}
            </dd>

            <dt>{t('period')}</dt>
            <dd>{period(vacation, language, t)}</dd>

            <dt>{t('message')}</dt>
            <dd className="state__message">{vacation.autoReplyText || '—'}</dd>
          </dl>

          <ul className="facts">
            <li>{t('daysBetween', { days: vacation.daysBetweenResponse })}</li>
            {vacation.ignoreLists && <li>{t('ignoreLists')}</li>}
          </ul>
        </section>
      )}

      <footer className="note note--muted">{t('noteReadOnly')}</footer>
    </main>
  )
}
