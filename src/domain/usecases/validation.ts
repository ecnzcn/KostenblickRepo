import type { Bill, BillItem, Contract } from '../models/entities'

export function validateBill(bill: Bill): string[] {
  const errors: string[] = []
  if (!Number.isInteger(bill.year) || bill.year < 2000 || bill.year > 2200) errors.push('Jahr ist ungültig.')
  if (bill.totalAmount < 0) errors.push('Gesamtbetrag darf nicht negativ sein.')
  if (bill.advancePayments < 0) errors.push('Vorauszahlungen dürfen nicht negativ sein.')
  if (!Number.isFinite(bill.balance)) errors.push('Saldo muss eine gültige Zahl sein.')
  return errors
}

export function validateBillItem(item: BillItem): string[] {
  const errors: string[] = []
  if (!item.description.trim()) errors.push('Bezeichnung darf nicht leer sein.')
  if (!Number.isFinite(item.amount) || item.amount < 0) errors.push('Betrag muss eine nicht-negative Zahl sein.')
  if (item.confidence < 0 || item.confidence > 1) errors.push('Confidence muss zwischen 0 und 1 liegen.')
  return errors
}

export function validateContract(contract: Contract): string[] {
  const errors: string[] = []
  if (!contract.provider.trim()) errors.push('Anbieter darf nicht leer sein.')
  if (!Number.isFinite(contract.monthlyCost) || contract.monthlyCost < 0) errors.push('Monatliche Kosten sind ungültig.')
  if (contract.cancellationPeriodValue !== undefined && contract.cancellationPeriodValue < 0) {
    errors.push('Kündigungsfrist darf nicht negativ sein.')
  }
  if (contract.cancellationPeriodValue !== undefined && contract.cancellationPeriodUnit === undefined) {
    errors.push('Kündigungsfrist benötigt eine Einheit.')
  }
  if (!contract.startDate) errors.push('Vertragsbeginn ist erforderlich.')
  if (
    contract.endDate &&
    contract.startDate &&
    new Date(contract.endDate).getTime() < new Date(contract.startDate).getTime()
  ) {
    errors.push('Vertragsende darf nicht vor Vertragsbeginn liegen.')
  }
  return errors
}

export function sumBillItems(items: BillItem[]): number {
  return items.reduce((sum, item) => sum + item.amount, 0)
}
