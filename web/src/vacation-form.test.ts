import { describe, expect, it } from 'vitest'
import {
  dateFromEpoch,
  epochFromDate,
  formFromView,
  isDirty,
  patchFromForm,
  validateForm,
  type VacationFormState,
} from './vacation-form'
import type { VacationView } from './api'

const view: VacationView = {
  enabled: false,
  autoReplyText: 'Away',
  customSubjectEnabled: true,
  customSubject: 'Out of office',
  startDateEnabled: true,
  startDate: 1_764_543_600,
  endDateEnabled: true,
  endDate: 1_765_148_400,
  startTimeEnabled: false,
  startTime: null,
  endTimeEnabled: false,
  endTime: null,
  daysBetweenResponse: 7,
  autoReplyEmailAddresses: ['user@example.org'],
  ignoreLists: false,
  alwaysSend: false,
  discardMails: false,
}

const base: VacationFormState = {
  enabled: true,
  message: 'Away until Monday',
  customSubjectEnabled: true,
  subject: 'Out of office',
  startDateEnabled: true,
  startDate: '2026-11-25',
  startTimeEnabled: false,
  startTime: '09:00',
  endDateEnabled: true,
  endDate: '2026-12-01',
  endTimeEnabled: false,
  endTime: '17:00',
  ignoreLists: false,
}

describe('date conversion', () => {
  it('round-trips a calendar date through local midnight', () => {
    const epoch = epochFromDate('2026-11-25')
    expect(epoch).toBe(Math.floor(new Date(2026, 10, 25, 0, 0, 0, 0).getTime() / 1_000))
    expect(dateFromEpoch(epoch)).toBe('2026-11-25')
  })

  it('rejects malformed dates', () => {
    expect(epochFromDate('')).toBeNull()
    expect(epochFromDate('25.11.2026')).toBeNull()
    expect(dateFromEpoch(null)).toBe('')
  })
})

describe('validateForm', () => {
  it('accepts a complete form', () => {
    expect(validateForm(base)).toBeNull()
  })

  it('requires a message only when enabling', () => {
    expect(validateForm({ ...base, message: '   ' })).toBe('messageRequired')
    expect(validateForm({ ...base, enabled: false, message: '' })).toBeNull()
  })

  it('requires dates that are switched on', () => {
    expect(validateForm({ ...base, startDate: '' })).toBe('dateRequired')
    expect(validateForm({ ...base, startDateEnabled: false, startDate: '' })).toBeNull()
  })

  it('refuses a window that ends before it starts', () => {
    expect(validateForm({ ...base, startDate: '2026-12-02' })).toBe('dateOrder')
    expect(validateForm({ ...base, startDate: '2026-12-01', endDate: '2026-12-01' })).toBeNull()
  })

  it('requires HH:MM when times are used', () => {
    expect(validateForm({ ...base, startTimeEnabled: true, startTime: '25:00' })).toBe('timeRequired')
    expect(validateForm({ ...base, startTimeEnabled: true, startTime: '08:30' })).toBeNull()
  })
})

describe('patchFromForm', () => {
  it('sends dates as epoch seconds and clears disabled ones', () => {
    const patch = patchFromForm(base)

    expect(patch).toMatchObject({
      enabled: true,
      autoReplyText: 'Away until Monday',
      customSubjectEnabled: true,
      customSubject: 'Out of office',
      startDateEnabled: true,
      startDate: Math.floor(new Date(2026, 10, 25, 0, 0, 0, 0).getTime() / 1_000),
      endDateEnabled: true,
      ignoreLists: false,
    })

    const disabled = patchFromForm({ ...base, startDateEnabled: false })
    expect(disabled.startDate).toBeNull()
    expect(disabled.startTimeEnabled).toBe(false)
    expect(disabled.startTime).toBeNull()
  })

  it('does not send times whose date is disabled', () => {
    const patch = patchFromForm({
      ...base,
      startDateEnabled: false,
      startTimeEnabled: true,
      startTime: '08:00',
    })

    expect(patch.startTimeEnabled).toBe(false)
    expect(patch.startTime).toBeNull()
  })

  it('seeds the reply addresses on the first save only', () => {
    expect(patchFromForm(base, { seedAddresses: ['user@example.org'] })).toHaveProperty(
      'autoReplyEmailAddresses',
      ['user@example.org'],
    )
    expect(patchFromForm(base)).not.toHaveProperty('autoReplyEmailAddresses')
  })
})

describe('formFromView', () => {
  it('maps stored values into form fields', () => {
    const state = formFromView(view)

    expect(state).toMatchObject({
      enabled: false,
      message: 'Away',
      customSubjectEnabled: true,
      subject: 'Out of office',
      startDateEnabled: true,
      endDateEnabled: true,
      ignoreLists: false,
    })
    expect(state.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(state.startTime).toBe('09:00')
  })

  it('is not dirty against itself', () => {
    const state = formFromView(view)
    expect(isDirty(state, state)).toBe(false)
    expect(isDirty({ ...state, enabled: !state.enabled }, state)).toBe(true)
  })
})
