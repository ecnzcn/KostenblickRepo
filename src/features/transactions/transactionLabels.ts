import type { Transaction } from '../../domain/models/entities'

/** What a booking is when it has no category to name. */
export function flowLabel(transaction: Pick<Transaction, 'flowType' | 'categoryId'>): string {
  if (transaction.flowType === 'transfer') return 'Umbuchung'
  if (transaction.flowType === 'saving') return 'Sparen'
  return transaction.categoryId ? 'Unbekannte Kategorie' : 'Ohne Kategorie'
}
