import type { Bill } from '../../models/entities'
import { roundToCents } from '../../../utils/money'
import type { MonthlyStatistic } from './statisticsTypes'

function monthKey(year: number, monthIndex0: number): string {
  return `${year}-${String(monthIndex0 + 1).padStart(2, '0')}`
}

/**
 * A Bill is only attributed to a specific calendar month when its period
 * is fully and unambiguously contained within that one month. A typical
 * annual Nebenkostenabrechnung (periodStart = Jan 1, periodEnd = Dec 31)
 * is deliberately NOT attributed to any month - spreading it evenly across
 * 12 months would fabricate precision the data doesn't have (see CLAUDE.md,
 * "Monatliche Entwicklung"). Bills without both period dates are likewise
 * never guessed at.
 */
function attributedMonth(bill: Bill): string | undefined {
  if (!bill.periodStart || !bill.periodEnd) return undefined
  const start = new Date(bill.periodStart)
  const end = new Date(bill.periodEnd)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return undefined
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth()
  if (!sameMonth) return undefined
  return monthKey(start.getUTCFullYear(), start.getUTCMonth())
}

/** All 12 months of `year`, each with `hasActualData: false` unless a bill
 * could genuinely be attributed to it (see attributedMonth). Never fills
 * gaps by distributing other bills' totals. */
export function calculateMonthlyStatistics(bills: Bill[], year: number): MonthlyStatistic[] {
  const amounts = new Map<string, number>()
  for (const bill of bills) {
    const month = attributedMonth(bill)
    if (!month) continue
    amounts.set(month, (amounts.get(month) ?? 0) + bill.totalAmount)
  }

  return Array.from({ length: 12 }, (_, index) => {
    const key = monthKey(year, index)
    const amount = amounts.get(key)
    return {
      month: key,
      amount: amount !== undefined ? roundToCents(amount) : 0,
      hasActualData: amount !== undefined,
    }
  })
}

/** Average cost over only the months with real data (e.g. totalCosts/8 if
 * exactly 8 months have attributable bills) - never yearTotal/12 on
 * incomplete data. undefined when no month has real data. */
export function calculateAverageMonthlyCost(monthlyStatistics: MonthlyStatistic[]): number | undefined {
  const withData = monthlyStatistics.filter((entry) => entry.hasActualData)
  if (withData.length === 0) return undefined
  const total = withData.reduce((sum, entry) => sum + entry.amount, 0)
  return roundToCents(total / withData.length)
}
