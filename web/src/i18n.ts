export type Language = 'en' | 'de'

const en = {
  title: 'Out of office',
  subtitle: 'The reply is delivered by your own mail server.',
  mailbox: 'Mailbox',
  password: 'Password',
  load: 'Load current settings',
  loading: 'Loading…',
  statusOn: 'Active',
  statusOff: 'Inactive',
  notConfigured: 'This mailbox has no out-of-office settings stored yet.',
  subject: 'Subject',
  message: 'Message',
  period: 'Period',
  notSet: 'not set',
  daysBetween: 'Reply at most every {days} days',
  ignoreLists: 'Skip mailing lists and bulk mail',
  errorTitle: 'Could not load the settings',
  errorBadCredentials: 'Wrong username or password.',
  errorMailboxNotFound: 'SOGo does not know this mailbox (for example an alias).',
  errorRateLimited: 'Too many attempts. Wait a moment and try again.',
  errorImapUnavailable: 'The mail server cannot be reached right now.',
  errorSogoUnavailable: 'SOGo cannot be reached right now.',
  errorNetwork: 'The out-of-office service cannot be reached.',
  errorGeneric: 'The request failed.',
  retryHint: 'You can retry this request.',
  noteCredentials: 'The password is used for this request only and is not stored yet.',
  noteReadOnly: 'Read-only for now. Editing follows in the next step.',
  noSubject: 'No custom subject',
} as const

export type MessageKey = keyof typeof en

const de: Record<MessageKey, string> = {
  title: 'Abwesenheit',
  subtitle: 'Die Antwort wird von deinem eigenen Mailserver versendet.',
  mailbox: 'Postfach',
  password: 'Passwort',
  load: 'Aktuelle Einstellungen laden',
  loading: 'Wird geladen…',
  statusOn: 'Aktiv',
  statusOff: 'Inaktiv',
  notConfigured: 'Für dieses Postfach sind noch keine Abwesenheitseinstellungen gespeichert.',
  subject: 'Betreff',
  message: 'Nachricht',
  period: 'Zeitraum',
  notSet: 'nicht gesetzt',
  daysBetween: 'Höchstens alle {days} Tage antworten',
  ignoreLists: 'Mailinglisten und Massenmails überspringen',
  errorTitle: 'Einstellungen konnten nicht geladen werden',
  errorBadCredentials: 'Benutzername oder Passwort ist falsch.',
  errorMailboxNotFound: 'SOGo kennt dieses Postfach nicht (zum Beispiel ein Alias).',
  errorRateLimited: 'Zu viele Versuche. Bitte kurz warten.',
  errorImapUnavailable: 'Der Mailserver ist derzeit nicht erreichbar.',
  errorSogoUnavailable: 'SOGo ist derzeit nicht erreichbar.',
  errorNetwork: 'Der Abwesenheitsdienst ist nicht erreichbar.',
  errorGeneric: 'Die Anfrage ist fehlgeschlagen.',
  retryHint: 'Die Anfrage kann wiederholt werden.',
  noteCredentials: 'Das Passwort wird nur für diese Anfrage verwendet und noch nicht gespeichert.',
  noteReadOnly: 'Vorerst nur lesend. Bearbeiten folgt im nächsten Schritt.',
  noSubject: 'Kein eigener Betreff',
}

export type Translator = (key: MessageKey, vars?: Record<string, string | number>) => string

export function resolveLanguage(candidate: string | undefined): Language {
  return candidate?.toLowerCase().startsWith('de') ? 'de' : 'en'
}

export function createTranslator(language: Language): Translator {
  const dictionary: Record<MessageKey, string> = language === 'de' ? de : en
  return (key, vars) => {
    let text: string = dictionary[key] ?? en[key] ?? key
    for (const [name, value] of Object.entries(vars ?? {})) {
      text = text.replaceAll(`{${name}}`, String(value))
    }
    return text
  }
}
