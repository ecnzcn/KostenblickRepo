import { describe, expect, it } from 'vitest'
import { getContractStatus } from '../domain/usecases/reminders/contractStatus'
import type { Contract } from '../domain/models/entities'

const now = new Date('2026-09-17T00:00:00.000Z')

const baseContract: Contract = {
  id: 'c1',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  syncVersion: 1,
  userId: 'u1',
  categoryId: 'internet',
  provider: 'Telekom',
  monthlyCost: 40,
  startDate: '2025-01-01T00:00:00.000Z',
  autoRenewal: false,
  reminderEnabled: true,
}

function withDeadline(daysFromNow: number): Contract {
  const date = new Date(now)
  date.setUTCDate(date.getUTCDate() + daysFromNow)
  return { ...baseContract, calculatedCancellationDate: date.toISOString() }
}

describe('getContractStatus', () => {
  it('is "active" when no cancellation deadline is known', () => {
    expect(getContractStatus(baseContract, now)).toBe('active')
  })

  it('is "active" with more than 90 days remaining', () => {
    expect(getContractStatus(withDeadline(91), now)).toBe('active')
  })

  it('is "upcoming" at exactly 90 days remaining', () => {
    expect(getContractStatus(withDeadline(90), now)).toBe('upcoming')
  })

  it('is "upcoming" at 89 days remaining', () => {
    expect(getContractStatus(withDeadline(89), now)).toBe('upcoming')
  })

  it('is "urgent" at exactly 30 days remaining', () => {
    expect(getContractStatus(withDeadline(30), now)).toBe('urgent')
  })

  it('is "urgent" at 29 days remaining', () => {
    expect(getContractStatus(withDeadline(29), now)).toBe('urgent')
  })

  it('is "urgent" at 1 day remaining', () => {
    expect(getContractStatus(withDeadline(1), now)).toBe('urgent')
  })

  it('is "urgent" at 0 days remaining (today)', () => {
    expect(getContractStatus(withDeadline(0), now)).toBe('urgent')
  })

  it('is "expired" once the deadline is 1 day in the past', () => {
    expect(getContractStatus(withDeadline(-1), now)).toBe('expired')
  })
})
