import { z } from 'zod'

/**
 * SOGo stores the vacation settings as a plain JSON object under the `Vacation`
 * key of the user defaults. It mixes booleans and 0/1 integers, and SOGo's own
 * UI can add keys we do not know about (weekday rules, for example).
 *
 * Rule of thumb: reading normalises into a typed view, writing merges into the
 * *raw* object so unknown keys survive. `Preferences/save` replaces the whole
 * `Vacation` object, so dropping unknown keys would silently reset settings the
 * user configured in SOGo itself.
 */
export interface VacationView {
  enabled: boolean
  autoReplyText: string
  customSubjectEnabled: boolean
  customSubject: string
  startDateEnabled: boolean
  startDate: number | null
  endDateEnabled: boolean
  endDate: number | null
  startTimeEnabled: boolean
  startTime: string | null
  endTimeEnabled: boolean
  endTime: string | null
  daysBetweenResponse: number
  autoReplyEmailAddresses: string[]
  ignoreLists: boolean
  alwaysSend: boolean
  discardMails: boolean
}

export type RawVacation = Record<string, unknown>

export const DEFAULT_DAYS_BETWEEN_RESPONSE = 7

function asBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

/**
 * Epoch seconds. SOGo writes integers; tolerate numeric strings because a
 * round trip through some clients has produced them before.
 */
function asNullableEpochSeconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asInteger(value: unknown, fallback: number): number {
  const parsed = asNullableEpochSeconds(value)
  return parsed === null ? fallback : Math.trunc(parsed)
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string')
}

export function isRawVacation(value: unknown): value is RawVacation {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toVacationView(raw: RawVacation | null): VacationView {
  const source = raw ?? {}
  return {
    enabled: asBoolean(source.enabled),
    autoReplyText: asString(source.autoReplyText),
    customSubjectEnabled: asBoolean(source.customSubjectEnabled),
    customSubject: asString(source.customSubject),
    startDateEnabled: asBoolean(source.startDateEnabled),
    startDate: asNullableEpochSeconds(source.startDate),
    endDateEnabled: asBoolean(source.endDateEnabled),
    endDate: asNullableEpochSeconds(source.endDate),
    startTimeEnabled: asBoolean(source.startTimeEnabled),
    startTime: asNullableString(source.startTime),
    endTimeEnabled: asBoolean(source.endTimeEnabled),
    endTime: asNullableString(source.endTime),
    daysBetweenResponse: asInteger(
      source.daysBetweenResponse,
      DEFAULT_DAYS_BETWEEN_RESPONSE,
    ),
    autoReplyEmailAddresses: asStringArray(source.autoReplyEmailAddresses),
    ignoreLists: asBoolean(source.ignoreLists),
    alwaysSend: asBoolean(source.alwaysSend),
    discardMails: asBoolean(source.discardMails),
  }
}

/**
 * Overlays `patch` on the raw object, keeping every key neither side removed.
 * `undefined` values are ignored so callers can build partial patches; `null`
 * deletes the key, which matters for SOGo fields it would otherwise try to
 * interpret as a date/time.
 */
export function mergeVacation(
  current: RawVacation | null,
  patch: Record<string, unknown>,
): RawVacation {
  const merged: RawVacation = { ...(current ?? {}) }
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue
    }
    if (value === null) {
      delete merged[key]
      continue
    }
    merged[key] = value
  }
  return merged
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/
const MAX_EPOCH_SECONDS = 253_402_300_799

/**
 * Validation for what the add-in may change. Only the MVP surface is writable;
 * unknown keys are stripped so a client cannot smuggle arbitrary data into
 * SOGo's defaults document.
 */
export const vacationPatchSchema = z
  .object({
    enabled: z.boolean(),
    autoReplyText: z.string().max(10_000),
    customSubjectEnabled: z.boolean(),
    customSubject: z.string().max(500),
    startDateEnabled: z.boolean(),
    startDate: z.number().int().min(0).max(MAX_EPOCH_SECONDS).nullable(),
    endDateEnabled: z.boolean(),
    endDate: z.number().int().min(0).max(MAX_EPOCH_SECONDS).nullable(),
    startTimeEnabled: z.boolean(),
    startTime: z.string().regex(TIME_OF_DAY, 'Expected HH:MM').nullable(),
    endTimeEnabled: z.boolean(),
    endTime: z.string().regex(TIME_OF_DAY, 'Expected HH:MM').nullable(),
    daysBetweenResponse: z.number().int().min(0).max(365),
    autoReplyEmailAddresses: z.array(z.email()).min(1).max(20),
    ignoreLists: z.boolean(),
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, {
    message: 'At least one setting is required',
  })

export type VacationPatch = z.infer<typeof vacationPatchSchema>

