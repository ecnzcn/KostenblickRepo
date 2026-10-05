import { SPARKASSE_CATEGORY_MAP } from '../../../constants/bankCategories'
import {
  CREDIT_CARD_UNITEMIZED_CATEGORY_ID,
  INCOME_CATEGORY_IDS,
  OTHER_INCOME_CATEGORY_ID,
  SALARY_CATEGORY_ID,
  SAVINGS_CATEGORY_ID,
} from '../../../constants/categories'
import { CREDIT_CARD_BOOKING_TEXT, type ParsedBankRow } from '../../models/bankImport'
import type { AccountType, CategorySource, FlowType } from '../../models/entities'

export interface RowClassification {
  flowType: FlowType
  categoryId?: string
  categorySource: CategorySource
  isReversal?: boolean
}

/** What the classification reads - a freshly parsed row and a stored
 * Transaction both have these. */
export type BankBookingFields = Pick<ParsedBankRow, 'bookingText' | 'amount' | 'bankCategory'>
/** Booking texts of a giro debit that settles a credit card statement. */
export const GIRO_CARD_SETTLEMENT_TEXT = 'EIGENE KREDITKARTENABRECHN.'

function bookingTextOf(row: BankBookingFields): string {
  return row.bookingText.replace(/\s+/g, ' ').trim().toUpperCase()
}

function bankSuggestion(row: BankBookingFields, flowType: 'income' | 'expense'): Pick<RowClassification, 'categoryId' | 'categorySource'> {
  const mapped = row.bankCategory ? SPARKASSE_CATEGORY_MAP[row.bankCategory] : undefined
  if (flowType === 'income') {
    if (row.bankCategory === 'Einkommen' && bookingTextOf(row) === 'LOHN GEHALT') {
      return { categoryId: SALARY_CATEGORY_ID, categorySource: 'bank' }
    }
    return mapped && INCOME_CATEGORY_IDS.has(mapped) ? { categoryId: mapped, categorySource: 'bank' } : { categorySource: 'none' }
  }
  return mapped && !INCOME_CATEGORY_IDS.has(mapped) && mapped !== SAVINGS_CATEGORY_ID
    ? { categoryId: mapped, categorySource: 'bank' }
    : { categorySource: 'none' }
}

/**
 * How a freshly imported booking counts, before any user rule (14E) or
 * manual change. Structural rules from the bank's booking text come first,
 * then the sign (positive = income, 14A O-8), then the Sparkasse category as
 * a starting suggestion. Card settlements start as expenses; pairing them
 * with the card statement (reconcileCardSettlements) turns them into
 * transfers.
 */
export function classifyBankRow(row: BankBookingFields, accountType: AccountType): RowClassification {
  const text = bookingTextOf(row)

  if (accountType === 'credit_card') {
    if (row.bookingText === CREDIT_CARD_BOOKING_TEXT.settlement) return { flowType: 'transfer', categorySource: 'none' }
    if (row.bookingText === CREDIT_CARD_BOOKING_TEXT.fee) return { flowType: 'expense', categoryId: 'fees', categorySource: 'rule' }
    return { flowType: row.amount >= 0 ? 'income' : 'expense', categorySource: 'none' }
  }

  if (text === GIRO_CARD_SETTLEMENT_TEXT || text.startsWith('KREDITKARTENABRECHNUNG')) {
    return { flowType: 'expense', categoryId: CREDIT_CARD_UNITEMIZED_CATEGORY_ID, categorySource: 'rule' }
  }
  if (text.startsWith('UEBERTRAG') || row.bankCategory === 'Geldanlage') {
    return { flowType: 'saving', categoryId: SAVINGS_CATEGORY_ID, categorySource: text.startsWith('UEBERTRAG') ? 'rule' : 'bank' }
  }
  if (text === 'LS WIEDERGUTSCHRIFT' || text === 'WIEDERGUTSCHRIFT') {
    return { flowType: 'expense', isReversal: true, ...bankSuggestion(row, 'expense') }
  }
  if (text.startsWith('BARGELDEINZAHLUNG')) {
    return { flowType: 'income', categoryId: OTHER_INCOME_CATEGORY_ID, categorySource: 'rule' }
  }
  if (text === 'ENTGELTABSCHLUSS' || text === 'ABSCHLUSS') {
    return { flowType: 'expense', categoryId: 'fees', categorySource: 'rule' }
  }

  const flowType = row.amount >= 0 ? 'income' : 'expense'
  return { flowType, ...bankSuggestion(row, flowType) }
}
