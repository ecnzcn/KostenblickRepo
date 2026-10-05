import { roundToCents } from '../../../utils/money'
import { formatCurrency, formatMonthKey } from '../../../utils/formatters'
import { isProvisionalSettlement } from '../bankImport/reconcileCardSettlements'
import { buildFixedCostOverview, coverageFromBatches, coveredMonthsByAccount } from '../fixedCosts/contractComparison'
import { addMonths, type MonthKey } from '../fixedCosts/months'
import { compareWithPreviousMonth, expensesByGroup, transactionsInMonth, type FinanceData } from './monthlyOverview'

/**
 * Phase 14H: "Kostenblick-Tipp". Every tip is a rule over real bookings,
 * imports and contracts of the selected month - no generic advice, no
 * text without a data basis. No rule matches → no tip, and the dashboard
 * shows no tip card at all.
 *
 * Order = importance: first what makes the month's figures incomplete or
 * wrong (missing card export, bookings without category), then contract
 * debits that differ from the contract, then notable category changes.
 */

export type TipKind = 'missing_card_export' | 'uncategorized' | 'contract_deviation' | 'contract_missing' | 'category_change'

export interface Tip {
  id: string
  kind: TipKind
  text: string
  link?: { to: string; label: string }
}

/** A category change is only a tip from ±10 % and at least 20 € on. */
export const CATEGORY_CHANGE_MIN_PERCENT = 10
export const CATEGORY_CHANGE_MIN_AMOUNT = 20
export const MAX_TIPS = 3

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`
}

export interface TipLinks {
  transactions: (query: string) => string
  contract: (id: string) => string
}

export function buildTips(data: FinanceData, month: MonthKey, today: string, links: TipLinks): Tip[] {
  const inMonth = transactionsInMonth(data.transactions, month)
  const tips: Tip[] = []
  const monthName = formatMonthKey(month)

  const provisional = inMonth.filter(isProvisionalSettlement).length
  if (provisional > 0) {
    tips.push({
      id: 'missing_card_export',
      kind: 'missing_card_export',
      text: `Für ${plural(provisional, 'Kreditkartenabrechnung', 'Kreditkartenabrechnungen')} im ${monthName} fehlen die Kartenumsätze. Importiere die aktuelle Kreditkarten-CSV, damit die Ausgaben vollständig sind.`,
      link: { to: links.transactions(''), label: 'Zu den Buchungen' },
    })
  }

  const uncategorized = inMonth.filter((entry) => !entry.categoryId && (entry.flowType === 'income' || entry.flowType === 'expense')).length
  if (uncategorized > 0) {
    tips.push({
      id: 'uncategorized',
      kind: 'uncategorized',
      text: `${plural(uncategorized, 'Buchung ist', 'Buchungen sind')} im ${monthName} noch ohne Kategorie. Ordne sie zu, damit „Ausgaben nach Kategorie“ stimmt.`,
      link: { to: links.transactions(`monat=${month}&kategorie=ohne`), label: 'Zuordnen' },
    })
  }

  const fixedCosts = buildFixedCostOverview(data.contracts, month, {
    transactions: data.transactions,
    coveredMonths: coveredMonthsByAccount(coverageFromBatches(data.batches)),
    currentMonth: today.slice(0, 7),
  })
  for (const row of fixedCosts.rows) {
    if (row.status === 'deviation') {
      const expected = row.debitExpected ?? row.expected
      const direction = row.actual > expected ? 'teurer' : 'günstiger'
      tips.push({
        id: `contract_deviation:${row.contract.id}`,
        kind: 'contract_deviation',
        text: `${row.contract.provider} wurde im ${monthName} ${direction} abgebucht als im Vertrag hinterlegt: erwartet ${formatCurrency(expected)}, abgebucht ${formatCurrency(row.actual)}.`,
        link: { to: links.contract(row.contract.id), label: 'Vertrag ansehen' },
      })
    } else if (row.status === 'missing') {
      tips.push({
        id: `contract_missing:${row.contract.id}`,
        kind: 'contract_missing',
        text: `Für ${row.contract.provider} gibt es im ${monthName} keine Abbuchung, obwohl der Monat vollständig importiert ist.`,
        link: { to: links.contract(row.contract.id), label: 'Vertrag ansehen' },
      })
    }
  }

  const comparison = compareWithPreviousMonth(month, data.transactions, data.batches)
  if (!comparison.unavailableReason) {
    const previousMonth = addMonths(month, -1)
    const current = new Map(expensesByGroup(inMonth, data.categories, Number.POSITIVE_INFINITY).map((group) => [group.groupId, group]))
    const previous = expensesByGroup(transactionsInMonth(data.transactions, previousMonth), data.categories, Number.POSITIVE_INFINITY)
    const changes = previous
      .filter((group) => group.groupId !== 'none' && group.amount > 0)
      .map((group) => {
        const now = current.get(group.groupId)?.amount ?? 0
        const difference = roundToCents(now - group.amount)
        return { group, now, difference, percent: (difference / group.amount) * 100 }
      })
      .filter((change) => Math.abs(change.percent) >= CATEGORY_CHANGE_MIN_PERCENT && Math.abs(change.difference) >= CATEGORY_CHANGE_MIN_AMOUNT)
      .sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || a.group.groupId.localeCompare(b.group.groupId))
    const largest = changes[0]
    if (largest) {
      const percent = Math.round(Math.abs(largest.percent))
      const direction = largest.difference < 0 ? 'weniger' : 'mehr'
      tips.push({
        id: `category_change:${largest.group.groupId}`,
        kind: 'category_change',
        text: `Du hast im ${monthName} ${percent} % ${direction} für ${largest.group.name} ausgegeben als im ${formatMonthKey(previousMonth)} (${formatCurrency(largest.now)} statt ${formatCurrency(largest.group.amount)}).`,
        link: { to: links.transactions(`monat=${month}&kategorie=${largest.group.groupId}`), label: 'Buchungen ansehen' },
      })
    }
  }

  return tips.slice(0, MAX_TIPS)
}
