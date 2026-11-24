import { useMemo, useState, type FormEvent } from 'react'
import { ApiError, getVacation, putVacation, type VacationResponse } from './api'
import { createTranslator, resolveLanguage, type Language, type MessageKey } from './i18n'
import { VacationEditor } from './VacationEditor'

type Status = 'idle' | 'loading' | 'ready' | 'error'

const LAST_MAILBOX_KEY = 'sogo-ooo.last-mailbox'

const ERROR_KEYS: Record<string, MessageKey> = {
  BAD_CREDENTIALS: 'errorBadCredentials',
  MAILBOX_NOT_FOUND: 'errorMailboxNotFound',
  RATE_LIMITED: 'errorRateLimited',
  IMAP_UNAVAILABLE: 'errorImapUnavailable',
  SOGO_UNAVAILABLE: 'errorSogoUnavailable',
  NETWORK: 'errorNetwork',
}

function rememberedMailbox(): string {
  try {
    return localStorage.getItem(LAST_MAILBOX_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberMailbox(mailbox: string): void {
  try {
    localStorage.setItem(LAST_MAILBOX_KEY, mailbox)
  } catch {
    // Private mode or storage disabled: not remembering is acceptable.
  }
}

export function App() {
  const [mailbox, setMailbox] = useState(rememberedMailbox)
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [data, setData] = useState<VacationResponse | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [language] = useState<Language>(() => resolveLanguage(navigator.language))

  const t = useMemo(() => createTranslator(language), [language])

  async function load(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setStatus('loading')
    setError(null)
    try {
      const response = await getVacation(mailbox.trim(), password)
      setData(response)
      setStatus('ready')
      rememberMailbox(mailbox.trim())
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

      {status === 'ready' && data && (
        <>
          {!data.configured && <p className="hint">{t('notConfigured')}</p>}
          <VacationEditor
            mailbox={mailbox.trim()}
            data={data}
            t={t}
            onSave={async (patch) => {
              const updated = await putVacation(mailbox.trim(), password, patch)
              setData(updated)
            }}
          />
        </>
      )}
    </main>
  )
}
