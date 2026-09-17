import { beforeEach, describe, expect, it } from 'vitest'
import {
  getEnabledReminderOffsets,
  getReminderIntervalSettings,
  saveReminderIntervalSettings,
} from '../domain/usecases/reminders/reminderSettings'

beforeEach(() => {
  localStorage.clear()
})

describe('reminderSettings', () => {
  it('defaults to all four standard intervals enabled', () => {
    expect(getReminderIntervalSettings()).toEqual({ 90: true, 30: true, 7: true, 1: true })
    expect(getEnabledReminderOffsets()).toEqual([90, 30, 7, 1])
  })

  it('persists a changed selection across reads', () => {
    saveReminderIntervalSettings({ 90: false, 30: true, 7: false, 1: true })
    expect(getEnabledReminderOffsets()).toEqual([30, 1])
  })

  it('falls back to defaults for a corrupted stored value', () => {
    localStorage.setItem('kostenblick.reminderIntervals.v1', 'not json')
    expect(getEnabledReminderOffsets()).toEqual([90, 30, 7, 1])
  })
})
