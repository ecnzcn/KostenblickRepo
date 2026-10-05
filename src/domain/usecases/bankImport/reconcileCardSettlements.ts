import { CREDIT_CARD_UNITEMIZED_CATEGORY_ID } from '../../../constants/categories'
import { CREDIT_CARD_BOOKING_TEXT } from '../../models/bankImport'
import type { Account, Transaction } from '../../models/entities'
import { GIRO_CARD_SETTLEMENT_TEXT } from './classifyBankRow'

/** Days the giro debit may follow the card's "Lastschrift" (fixtures: 4-6). */
export const SETTLEMENT_PAIRING_WINDOW_DAYS = 10

const DAY_MS = 86_400_000

function cents(amount: number): number {
  return Math.round(Math.abs(amount) * 100)
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS)
}

function isGiroSettlement(transaction: Transaction): boolean {
  return transaction.amount < 0 && transaction.bookingText.replace(/\s+/g, ' ').trim().toUpperCase() === GIRO_CARD_SETTLEMENT_TEXT
}

type Desired = Pick<Transaction, 'flowType' | 'transferPairId' | 'categoryId' | 'categorySource'>

function withState(transaction: Transaction, desired: Desired): Transaction | undefined {
  // A category the user picked by hand stays, whatever the pairing says.
  const keepCategory = transaction.categorySource === 'manual'
  const next: Transaction = {
    ...transaction,
    flowType: desired.flowType,
    transferPairId: desired.transferPairId,
    categoryId: keepCategory ? transaction.categoryId : desired.categoryId,
    categorySource: keepCategory ? transaction.categorySource : desired.categorySource,
  }
  if (next.transferPairId === undefined) delete next.transferPairId
  if (next.categoryId === undefined) delete next.categoryId
  const changed =
    next.flowType !== transaction.flowType ||
    next.transferPairId !== transaction.transferPairId ||
    next.categoryId !== transaction.categoryId ||
    next.categorySource !== transaction.categorySource
  return changed ? next : undefined
}

/**
 * Giro ↔ credit card settlement pairs (14A, 4.3 / O-1). Pure: returns only
 * the bookings whose state changes. Never touches a booking whose flowType
 * the user set by hand.
 *
 * - A giro "EIGENE KREDITKARTENABRECHN." and a card "Lastschrift" with the
 *   same amount to the cent, the giro debit 0-10 days later, form a pair:
 *   both are transfers (never an expense). Closest dates pair first, 1:1.
 * - A card "Lastschrift" is always a transfer, paired or not.
 * - An unpaired giro settlement is an expense "Kreditkarte (nicht
 *   aufgeschlüsselt)" - unless card bookings for its period are already
 *   imported (since the last paired "Lastschrift" before it). Then it counts
 *   provisionally as a transfer, so those card bookings are not counted a
 *   second time; the UI asks for the missing card export.
 */
export function reconcileCardSettlements(transactions: readonly Transaction[], accounts: readonly Account[]): Transaction[] {
  const accountType = new Map(accounts.map((account) => [account.id, account.type]))
  const automatic = (transaction: Transaction) => transaction.flowTypeSource !== 'manual'
  const onCard = (transaction: Transaction) => accountType.get(transaction.accountId) === 'credit_card'

  const giroSettlements = transactions.filter(
    (transaction) => automatic(transaction) && accountType.get(transaction.accountId) === 'giro' && isGiroSettlement(transaction),
  )
  const cardSettlements = transactions.filter(
    (transaction) =>
      automatic(transaction) &&
      onCard(transaction) &&
      transaction.amount > 0 &&
      transaction.bookingText === CREDIT_CARD_BOOKING_TEXT.settlement,
  )
  const cardBookingDates = transactions
    .filter((transaction) => onCard(transaction) && transaction.bookingText !== CREDIT_CARD_BOOKING_TEXT.settlement)
    .map((transaction) => transaction.bookingDate)

  const candidates: { giro: Transaction; card: Transaction; distance: number }[] = []
  for (const giro of giroSettlements) {
    for (const card of cardSettlements) {
      const distance = daysBetween(card.bookingDate, giro.bookingDate)
      if (cents(giro.amount) === cents(card.amount) && distance >= 0 && distance <= SETTLEMENT_PAIRING_WINDOW_DAYS) {
        candidates.push({ giro, card, distance })
      }
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.giro.bookingDate.localeCompare(b.giro.bookingDate) || a.giro.id.localeCompare(b.giro.id))

  const partner = new Map<string, string>()
  for (const { giro, card } of candidates) {
    if (partner.has(giro.id) || partner.has(card.id)) continue
    partner.set(giro.id, card.id)
    partner.set(card.id, giro.id)
  }

  const pairedCardDates = cardSettlements.filter((card) => partner.has(card.id)).map((card) => card.bookingDate)
  const changes: Transaction[] = []
  const push = (change: Transaction | undefined) => {
    if (change) changes.push(change)
  }

  for (const card of cardSettlements) {
    push(withState(card, { flowType: 'transfer', transferPairId: partner.get(card.id), categorySource: 'none' }))
  }
  for (const giro of giroSettlements) {
    const pairId = partner.get(giro.id)
    if (pairId) {
      push(withState(giro, { flowType: 'transfer', transferPairId: pairId, categorySource: 'none' }))
      continue
    }
    const periodStart = pairedCardDates.filter((date) => date < giro.bookingDate).sort().at(-1)
    const cardDataForPeriod =
      periodStart !== undefined && cardBookingDates.some((date) => date > periodStart && date <= giro.bookingDate)
    push(
      withState(
        giro,
        cardDataForPeriod
          ? { flowType: 'transfer', categorySource: 'none' }
          : { flowType: 'expense', categoryId: CREDIT_CARD_UNITEMIZED_CATEGORY_ID, categorySource: 'rule' },
      ),
    )
  }
  return changes
}

/** A transfer without partner on the giro side: counted as transfer only
 * because card bookings for its period exist - the card export is behind. */
export function isProvisionalSettlement(transaction: Transaction): boolean {
  return (
    transaction.flowType === 'transfer' &&
    transaction.flowTypeSource !== 'manual' &&
    !transaction.transferPairId &&
    isGiroSettlement(transaction)
  )
}
