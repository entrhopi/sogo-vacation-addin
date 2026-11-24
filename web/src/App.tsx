import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ApiError, getVacation, putVacation, type VacationResponse } from './api'
import {
  forgetPassword,
  listAccounts,
  readPassword,
  savePassword,
  storageAvailable,
  type StoredAccount,
} from './credentials'
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

  const [canStore, setCanStore] = useState(false)
  const [remember, setRemember] = useState(true)
  const [accounts, setAccounts] = useState<StoredAccount[]>([])
  const autoUnlocked = useRef(false)

  const t = useMemo(() => createTranslator(language), [language])

  const storedForCurrent = accounts.some(
    (account) => account.mailbox.toLowerCase() === mailbox.trim().toLowerCase(),
  )

  async function persist(mailboxValue: string, passwordValue: string): Promise<void> {
    if (!canStore) {
      return
    }
    try {
      if (remember) {
        await savePassword(mailboxValue, passwordValue)
      } else {
        await forgetPassword(mailboxValue)
      }
      setAccounts(await listAccounts())
    } catch {
      // Storage failures must never break the request the user asked for.
    }
  }

  async function loadFor(mailboxValue: string, passwordValue: string): Promise<void> {
    setStatus('loading')
    setError(null)
    try {
      const response = await getVacation(mailboxValue, passwordValue)
      setData(response)
      setStatus('ready')
      rememberMailbox(mailboxValue)
      await persist(mailboxValue, passwordValue)
    } catch (caught) {
      setData(null)
      setError(
        caught instanceof ApiError ? caught : new ApiError('UNEXPECTED', 'Unexpected error'),
      )
      setStatus('error')
    }
  }

  useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!storageAvailable()) {
        return
      }
      setCanStore(true)
      try {
        const stored = await listAccounts()
        if (cancelled) {
          return
        }
        setAccounts(stored)

        const remembered = rememberedMailbox()
        const hasStoredPassword = stored.some((account) => account.mailbox === remembered)
        if (!autoUnlocked.current && remembered.length > 0 && hasStoredPassword) {
          autoUnlocked.current = true
          const secret = await readPassword(remembered)
          if (secret && !cancelled) {
            setMailbox(remembered)
            setPassword(secret)
            await loadFor(remembered, secret)
          }
        }
      } catch {
        // Treat any storage problem as "not available" and keep the manual flow.
      }
    })()
    return () => {
      cancelled = true
    }
    // Runs once: it restores the last session, it must not react to form edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    await loadFor(mailbox.trim(), password)
  }

  async function chooseAccount(value: string): Promise<void> {
    if (value.length === 0) {
      return
    }
    setMailbox(value)
    const secret = await readPassword(value)
    if (secret) {
      setPassword(secret)
      await loadFor(value, secret)
    } else {
      setPassword('')
    }
  }

  async function forget(): Promise<void> {
    const target = mailbox.trim()
    try {
      await forgetPassword(target)
      setAccounts(await listAccounts())
    } catch {
      // Nothing to show the user: the record is best-effort.
    }
    setPassword('')
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

      <form className="form" onSubmit={submit}>
        {accounts.length > 0 && (
          <label className="field">
            <span>{t('savedAccounts')}</span>
            <select
              value=""
              onChange={(event) => void chooseAccount(event.target.value)}
            >
              <option value="">{t('chooseAccount')}</option>
              {accounts.map((account) => (
                <option key={account.mailbox} value={account.mailbox}>
                  {account.mailbox}
                </option>
              ))}
            </select>
          </label>
        )}

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

        {canStore && (
          <div className="row__check row__check--wide">
            <label className="row__check">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              <span>{t('rememberLabel')}</span>
            </label>
            {storedForCurrent && (
              <button type="button" className="link" onClick={() => void forget()}>
                {t('forgetPassword')}
              </button>
            )}
          </div>
        )}

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
