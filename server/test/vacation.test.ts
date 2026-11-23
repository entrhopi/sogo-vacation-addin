import { describe, expect, it } from 'vitest'
import { isRawVacation, mergeVacation, toVacationView } from '../src/sogo/vacation.js'

describe('toVacationView', () => {
  it('coerces the 0/1 flags SOGo writes', () => {
    const view = toVacationView({
      enabled: 1,
      customSubjectEnabled: 0,
      ignoreLists: 1,
      alwaysSend: 0,
      discardMails: 1,
      autoReplyText: 'Away until Monday',
      customSubject: 'Out of office',
      autoReplyEmailAddresses: ['a@example.org', 42],
      daysBetweenResponse: 3,
    })

    expect(view).toMatchObject({
      enabled: true,
      customSubjectEnabled: false,
      ignoreLists: true,
      alwaysSend: false,
      discardMails: true,
      autoReplyText: 'Away until Monday',
      customSubject: 'Out of office',
      autoReplyEmailAddresses: ['a@example.org'],
      daysBetweenResponse: 3,
    })
  })

  it('applies defaults when no vacation exists yet', () => {
    const view = toVacationView(null)

    expect(view.enabled).toBe(false)
    expect(view.autoReplyText).toBe('')
    expect(view.startDate).toBeNull()
    expect(view.endDate).toBeNull()
    expect(view.startTime).toBeNull()
    expect(view.daysBetweenResponse).toBe(7)
    expect(view.autoReplyEmailAddresses).toEqual([])
  })

  it('tolerates numeric strings for timestamps', () => {
    const view = toVacationView({ startDate: '1764543600', endDate: 'not-a-number' })

    expect(view.startDate).toBe(1764543600)
    expect(view.endDate).toBeNull()
  })
})

describe('mergeVacation', () => {
  it('overlays the patch and keeps unknown SOGo keys', () => {
    const current = {
      enabled: 0,
      autoReplyText: 'old',
      weekdaysEnabled: 1,
      days: ['monday', 'tuesday'],
      somethingNewInSogo: { nested: true },
    }

    const merged = mergeVacation(current, {
      enabled: true,
      autoReplyText: 'new',
    })

    expect(merged).toEqual({
      enabled: true,
      autoReplyText: 'new',
      weekdaysEnabled: 1,
      days: ['monday', 'tuesday'],
      somethingNewInSogo: { nested: true },
    })
  })

  it('ignores undefined patch values', () => {
    const merged = mergeVacation({ enabled: 1 }, { enabled: undefined, autoReplyText: 'x' })

    expect(merged).toEqual({ enabled: 1, autoReplyText: 'x' })
  })

  it('starts from an empty object when there is nothing stored', () => {
    expect(mergeVacation(null, { enabled: true })).toEqual({ enabled: true })
  })

  it('does not mutate the input', () => {
    const current = { enabled: 0 }
    mergeVacation(current, { enabled: true })
    expect(current).toEqual({ enabled: 0 })
  })
})

describe('isRawVacation', () => {
  it('accepts objects and rejects arrays, null and scalars', () => {
    expect(isRawVacation({})).toBe(true)
    expect(isRawVacation([])).toBe(false)
    expect(isRawVacation(null)).toBe(false)
    expect(isRawVacation('x')).toBe(false)
  })
})
