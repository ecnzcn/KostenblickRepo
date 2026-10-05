import type { ContractMonth, FixedCostRow } from '../../domain/usecases/fixedCosts/contractComparison'
import { formatCurrency } from '../../utils/formatters'

/** One month of a contract in words, e.g. "erwartet 39,99 €, abgebucht 44,99 €". */
export function describeMonth(entry: ContractMonth): string {
  switch (entry.status) {
    case 'ok':
      return `${formatCurrency(entry.actual)} – wie vereinbart`
    case 'deviation':
      return `erwartet ${formatCurrency(entry.expected ?? 0)}, abgebucht ${formatCurrency(entry.actual)}`
    case 'missing':
      return 'Abbuchung fehlt'
    case 'open':
      return 'noch nicht vollständig importiert'
    case 'none':
      return 'keine Abbuchung'
    case 'info':
      return `${formatCurrency(entry.actual)} abgebucht`
  }
}

/** Status of a contract in the fixed cost overview. */
export function describeFixedCostRow(row: FixedCostRow): string {
  switch (row.status) {
    case 'unlinked':
      return 'Keine Buchung verknüpft'
    case 'yearly_not_due':
      return 'Jährlich – in diesem Monat nicht abgebucht'
    case 'open':
      return 'Noch keine Abbuchung – Monat nicht vollständig importiert'
    case 'none':
      return row.cadence === 'irregular' ? 'Unregelmäßig – in diesem Monat keine Abbuchung' : 'Keine Abbuchung in diesem Monat'
    case 'missing':
      return 'Abbuchung fehlt'
    case 'info':
      return `Unregelmäßig – ${formatCurrency(row.actual)} abgebucht`
    case 'ok':
      return row.debitExpected !== undefined ? 'Jahresbetrag wie vereinbart' : 'Wie vereinbart'
    case 'deviation':
      return `${row.debitExpected !== undefined ? 'Jahresbetrag: ' : ''}erwartet ${formatCurrency(row.debitExpected ?? row.expected)}, abgebucht ${formatCurrency(row.actual)}`
  }
}

export function isWarning(status: FixedCostRow['status']): boolean {
  return status === 'missing' || status === 'deviation'
}
