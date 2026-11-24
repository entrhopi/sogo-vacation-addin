import type { VacationView } from './api'

export interface VacationFormState {
  enabled: boolean
  message: string
  customSubjectEnabled: boolean
  subject: string
  startDateEnabled: boolean
  startDate: string
  startTimeEnabled: boolean
  startTime: string
  endDateEnabled: boolean
  endDate: string
  endTimeEnabled: boolean
  endTime: string
  ignoreLists: boolean
}

export const DEFAULT_TIME = '09:00'

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * SOGo stores the *date* and the *time* separately, so this is local midnight,
 * not a timestamp with the time folded in. The conversion uses the browser's
 * timezone; SOGo formats the epoch in the server's timezone, which is why the
 * deployment assumes both are the same (a per-user SOGoTimeZone still overrides
 * it server-side).
 */
export function epochFromDate(value: string): number | null {
  const match = DATE_PATTERN.exec(value)
  if (!match) {
    return null
  }
  const [, year, month, day] = match
  const date = new Date(Number(year), Number(month) - 1, Number(day), 0, 0, 0, 0)
  return Math.floor(date.getTime() / 1_000)
}

export function dateFromEpoch(epoch: number | null): string {
  if (epoch === null) {
    return ''
  }
  const date = new Date(epoch * 1_000)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value)
}

export function formFromView(view: VacationView): VacationFormState {
  return {
    enabled: view.enabled,
    message: view.autoReplyText,
    customSubjectEnabled: view.customSubjectEnabled,
    subject: view.customSubject,
    startDateEnabled: view.startDateEnabled,
    startDate: dateFromEpoch(view.startDate),
    startTimeEnabled: view.startTimeEnabled,
    startTime: view.startTime ?? DEFAULT_TIME,
    endDateEnabled: view.endDateEnabled,
    endDate: dateFromEpoch(view.endDate),
    endTimeEnabled: view.endTimeEnabled,
    endTime: view.endTime ?? DEFAULT_TIME,
    ignoreLists: view.ignoreLists,
  }
}

export type ValidationError = 'messageRequired' | 'dateRequired' | 'dateOrder' | 'timeRequired'

export function validateForm(state: VacationFormState): ValidationError | null {
  if (state.enabled && state.message.trim().length === 0) {
    return 'messageRequired'
  }
  if (state.startDateEnabled && epochFromDate(state.startDate) === null) {
    return 'dateRequired'
  }
  if (state.endDateEnabled && epochFromDate(state.endDate) === null) {
    return 'dateRequired'
  }
  if (state.startTimeEnabled && !isValidTime(state.startTime)) {
    return 'timeRequired'
  }
  if (state.endTimeEnabled && !isValidTime(state.endTime)) {
    return 'timeRequired'
  }
  if (state.startDateEnabled && state.endDateEnabled) {
    const start = epochFromDate(state.startDate)
    const end = epochFromDate(state.endDate)
    if (start !== null && end !== null && start > end) {
      return 'dateOrder'
    }
  }
  return null
}

export interface PatchOptions {
  /**
   * SOGo only replies to the addresses listed in `autoReplyEmailAddresses`. A
   * mailbox that never used the vacation feature has no list, so the first save
   * seeds it with the mailbox itself; afterwards the stored list is preserved.
   */
  seedAddresses?: string[]
}

export function patchFromForm(
  state: VacationFormState,
  options: PatchOptions = {},
): Record<string, unknown> {
  const startDateEnabled = state.startDateEnabled
  const endDateEnabled = state.endDateEnabled

  const patch: Record<string, unknown> = {
    enabled: state.enabled,
    autoReplyText: state.message,
    customSubjectEnabled: state.customSubjectEnabled,
    customSubject: state.subject,
    ignoreLists: state.ignoreLists,

    startDateEnabled,
    startDate: startDateEnabled ? epochFromDate(state.startDate) : null,
    startTimeEnabled: startDateEnabled && state.startTimeEnabled,
    startTime: startDateEnabled && state.startTimeEnabled ? state.startTime : null,

    endDateEnabled,
    endDate: endDateEnabled ? epochFromDate(state.endDate) : null,
    endTimeEnabled: endDateEnabled && state.endTimeEnabled,
    endTime: endDateEnabled && state.endTimeEnabled ? state.endTime : null,
  }

  if (options.seedAddresses && options.seedAddresses.length > 0) {
    patch.autoReplyEmailAddresses = options.seedAddresses
  }

  return patch
}

export function isDirty(current: VacationFormState, initial: VacationFormState): boolean {
  return (Object.keys(current) as (keyof VacationFormState)[]).some(
    (key) => current[key] !== initial[key],
  )
}
