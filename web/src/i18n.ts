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

  enabledLabel: 'Reply automatically while I am away',
  from: 'From',
  until: 'Until',
  time: 'Time',
  customSubject: 'Use a custom subject',
  message: 'Message',
  ignoreLists: 'Skip mailing lists and bulk mail',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  noteLive: 'Changes take effect immediately. The reply is sent by your mail server.',
  noteCredentials: 'The password stays in memory unless you choose to remember it on this device.',
  savedAccounts: 'Saved on this device',
  chooseAccount: 'Choose a mailbox…',
  rememberLabel: 'Remember the password on this device',
  forgetPassword: 'Forget saved password',

  validationMessage: 'Add a message before enabling the reply.',
  validationDate: 'Pick a valid date.',
  validationDateOrder: 'The end date must not be before the start date.',
  validationTime: 'Use a valid time (HH:MM).',

  saveErrorTitle: 'Could not save the settings',
  errorTitle: 'Could not load the settings',
  errorBadCredentials: 'Wrong username or password.',
  errorMailboxNotFound: 'SOGo does not know this mailbox (for example an alias).',
  errorRateLimited: 'Too many attempts. Wait a moment and try again.',
  errorImapUnavailable: 'The mail server cannot be reached right now.',
  errorSogoUnavailable: 'SOGo cannot be reached right now.',
  errorInvalidSettings: 'The server rejected these settings.',
  errorNetwork: 'The out-of-office service cannot be reached.',
  errorGeneric: 'The request failed.',
  retryHint: 'You can retry this request.',
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

  enabledLabel: 'Automatisch antworten, solange ich abwesend bin',
  from: 'Von',
  until: 'Bis',
  time: 'Uhrzeit',
  customSubject: 'Eigenen Betreff verwenden',
  message: 'Nachricht',
  ignoreLists: 'Mailinglisten und Massenmails überspringen',
  save: 'Speichern',
  saving: 'Wird gespeichert…',
  saved: 'Gespeichert',
  noteLive: 'Änderungen gelten sofort. Die Antwort versendet dein Mailserver.',
  noteCredentials: 'Das Passwort bleibt im Arbeitsspeicher, sofern du es nicht auf diesem Gerät speicherst.',
  savedAccounts: 'Auf diesem Gerät gespeichert',
  chooseAccount: 'Postfach wählen…',
  rememberLabel: 'Passwort auf diesem Gerät speichern',
  forgetPassword: 'Gespeichertes Passwort löschen',

  validationMessage: 'Bitte eine Nachricht eingeben, bevor die Antwort aktiviert wird.',
  validationDate: 'Bitte ein gültiges Datum wählen.',
  validationDateOrder: 'Das Enddatum darf nicht vor dem Startdatum liegen.',
  validationTime: 'Bitte eine gültige Uhrzeit wählen (HH:MM).',

  saveErrorTitle: 'Einstellungen konnten nicht gespeichert werden',
  errorTitle: 'Einstellungen konnten nicht geladen werden',
  errorBadCredentials: 'Benutzername oder Passwort ist falsch.',
  errorMailboxNotFound: 'SOGo kennt dieses Postfach nicht (zum Beispiel ein Alias).',
  errorRateLimited: 'Zu viele Versuche. Bitte kurz warten.',
  errorImapUnavailable: 'Der Mailserver ist derzeit nicht erreichbar.',
  errorSogoUnavailable: 'SOGo ist derzeit nicht erreichbar.',
  errorInvalidSettings: 'Der Server hat diese Einstellungen abgelehnt.',
  errorNetwork: 'Der Abwesenheitsdienst ist nicht erreichbar.',
  errorGeneric: 'Die Anfrage ist fehlgeschlagen.',
  retryHint: 'Die Anfrage kann wiederholt werden.',
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
