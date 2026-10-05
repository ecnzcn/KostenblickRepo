import { getDatabase } from '../../../database/database'
import { STORE_NAMES } from '../../../database/schema'
import type { BankRowError, ParsedBankStatement } from '../../models/bankImport'
import type { Account, AccountType, ImportBatch, ImportBatchCounts, Transaction } from '../../models/entities'
import { accountRepository, importBatchRepository, transactionRepository } from '../../repositories/financeRepositories'
import { sha256Hex } from '../../../utils/hash'
import { generateId } from '../../../utils/id'
import { roundToCents } from '../../../utils/money'
import { createIdentifierSalt, findMatchingAccount, hashAccountIdentifier, last4 } from './accountIdentity'
import { classifyBankRow } from './classifyBankRow'
import { computeDedupeKeys, type KeyedBankRow } from './dedupeKey'
import { decodeBankFile } from './decodeBankFile'
import { parseSparkasseCsv } from './parseSparkasseCsv'
import { planImport } from './planImport'
import { isProvisionalSettlement, reconcileCardSettlements } from './reconcileCardSettlements'

/**
 * Phase 14D import flow: prepareImport() reads and checks a file and builds
 * the preview - it writes nothing. Only commitImport() persists, in ONE
 * IndexedDB transaction (account if new, import batch, bookings and the
 * resulting card settlement pairs), so a failure leaves nothing behind.
 * undoImport() deletes a batch's bookings for real and re-pairs the rest.
 */

export interface ImportTotals {
  income: number
  expenses: number
  saved: number
}

export interface ImportPreview {
  filename: string
  fileChecksum: string
  format: ParsedBankStatement['format']
  /** An existing account the file belongs to, or a new one to create. */
  account: Account
  isNewAccount: boolean
  batch: ImportBatch
  /** Built but not stored - nothing exists before commitImport(). */
  newTransactions: Transaction[]
  counts: ImportBatchCounts
  periodFrom?: string
  periodTo?: string
  totals: ImportTotals
  uncategorizedCount: number
  /** A preview with errors cannot be committed (no partial imports). */
  errors: BankRowError[]
}

export type PrepareImportResult = { ok: true; preview: ImportPreview } | { ok: false; error: string }

export interface ImportCommitResult {
  imported: number
  pairedSettlements: number
  provisionalSettlements: number
  /** Earliest card booking on this card, when the import was a card file. */
  cardDataFrom?: string
}

const ACCOUNT_LABELS: Record<AccountType, string> = { giro: 'Girokonto', credit_card: 'Kreditkarte' }

export function suggestAccountName(type: AccountType, identifier: string): string {
  return `${ACCOUNT_LABELS[type]} ••${last4(identifier)}`
}

export function toTransaction(row: KeyedBankRow, account: Account, importBatchId: string, now: string): Transaction {
  const classification = classifyBankRow(row, account.type)
  const transaction: Transaction = {
    id: generateId(),
    accountId: account.id,
    bookingDate: row.bookingDate,
    valueDate: row.valueDate,
    purchaseDate: row.purchaseDate,
    amount: row.amount,
    currency: row.currency,
    counterpartyName: row.counterpartyName,
    counterpartyIban: row.counterpartyIban,
    purpose: row.purpose,
    bookingText: row.bookingText,
    creditorId: row.creditorId,
    mandateReference: row.mandateReference,
    endToEndReference: row.endToEndReference,
    categoryId: classification.categoryId,
    categorySource: classification.categorySource,
    bankCategory: row.bankCategory,
    flowType: classification.flowType,
    flowTypeSource: 'auto',
    originalAmount: row.originalAmount,
    originalCurrency: row.originalCurrency,
    exchangeRate: row.exchangeRate,
    isReversal: classification.isReversal,
    importBatchId,
    dedupeKey: row.dedupeKey,
    createdAt: now,
    updatedAt: now,
  }
  // No `undefined` keys in stored records.
  for (const key of Object.keys(transaction) as (keyof Transaction)[]) {
    if (transaction[key] === undefined) delete transaction[key]
  }
  return transaction
}

/** Income, expenses and savings of a set of bookings. Transfers count
 * nowhere; a reversal (positive expense) lowers the expenses. */
export function sumByFlow(transactions: readonly Transaction[]): ImportTotals {
  let income = 0
  let expenses = 0
  let saved = 0
  for (const transaction of transactions) {
    if (transaction.flowType === 'income') income += transaction.amount
    else if (transaction.flowType === 'expense') expenses -= transaction.amount
    else if (transaction.flowType === 'saving') saved -= transaction.amount
  }
  return { income: roundToCents(income), expenses: roundToCents(expenses), saved: roundToCents(saved) }
}

export async function prepareImport(file: File, now: Date = new Date()): Promise<PrepareImportResult> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const parsed = parseSparkasseCsv(decodeBankFile(bytes))
  if (!parsed.ok) return parsed
  const { statement } = parsed

  const type: AccountType = statement.format === 'sparkasse_giro' ? 'giro' : 'credit_card'
  const nowIso = now.toISOString()
  const existingAccount = await findMatchingAccount(await accountRepository.getAll(), statement.accountIdentifier, type)
  let account = existingAccount
  if (!account) {
    const identifierSalt = createIdentifierSalt()
    account = {
      id: generateId(),
      name: suggestAccountName(type, statement.accountIdentifier),
      bank: 'sparkasse',
      type,
      last4: last4(statement.accountIdentifier),
      identifierSalt,
      identifierHash: await hashAccountIdentifier(statement.accountIdentifier, identifierSalt),
      createdAt: nowIso,
      updatedAt: nowIso,
    }
  }

  const keyed = await computeDedupeKeys(statement, account.identifierHash)
  const existingKeys = new Set(
    existingAccount ? (await transactionRepository.getAllByIndex('accountId', existingAccount.id)).map((entry) => entry.dedupeKey) : [],
  )
  const plan = planImport(existingKeys, keyed, statement.pendingCount)

  const batch: ImportBatch = {
    id: generateId(),
    accountId: account.id,
    filename: file.name,
    fileChecksum: await sha256Hex(bytes),
    importedAt: nowIso,
    periodFrom: plan.periodFrom ?? '',
    periodTo: plan.periodTo ?? '',
    counts: plan.counts,
    createdAt: nowIso,
    updatedAt: nowIso,
  }
  const newTransactions = plan.newRows.map((row) => toTransaction(row, account, batch.id, nowIso))

  return {
    ok: true,
    preview: {
      filename: file.name,
      fileChecksum: batch.fileChecksum,
      format: statement.format,
      account,
      isNewAccount: !existingAccount,
      batch,
      newTransactions,
      counts: plan.counts,
      periodFrom: plan.periodFrom,
      periodTo: plan.periodTo,
      totals: sumByFlow(newTransactions),
      uncategorizedCount: newTransactions.filter(
        (entry) => !entry.categoryId && (entry.flowType === 'income' || entry.flowType === 'expense'),
      ).length,
      errors: statement.errors,
    },
  }
}

export const COMMIT_FAILED_MESSAGE = 'Der Import konnte nicht gespeichert werden. Es wurde nichts verändert.'

export async function commitImport(preview: ImportPreview, accountName?: string): Promise<ImportCommitResult> {
  if (preview.errors.length > 0) throw new Error('Die Datei enthält fehlerhafte Zeilen und kann nicht importiert werden.')
  if (preview.newTransactions.length === 0) throw new Error('Diese Datei enthält keine neuen Buchungen.')

  const db = await getDatabase()
  const tx = db.transaction([STORE_NAMES.accounts, STORE_NAMES.importBatches, STORE_NAMES.transactions], 'readwrite')
  tx.done.catch(() => undefined)
  try {
    const accounts = tx.objectStore(STORE_NAMES.accounts)
    const transactions = tx.objectStore(STORE_NAMES.transactions)
    if (preview.isNewAccount) {
      await accounts.put({ ...preview.account, name: accountName?.trim() || preview.account.name })
    }
    await tx.objectStore(STORE_NAMES.importBatches).put(preview.batch)
    for (const transaction of preview.newTransactions) await transactions.put(transaction)

    const allTransactions = await transactions.getAll()
    const allAccounts = await accounts.getAll()
    const changes = reconcileCardSettlements(allTransactions, allAccounts)
    for (const change of changes) await transactions.put(change)
    await tx.done

    const byId = new Map(allTransactions.map((entry) => [entry.id, entry]))
    for (const change of changes) byId.set(change.id, change)
    const finalState = [...byId.values()]
    const cardDataFrom =
      preview.account.type === 'credit_card'
        ? finalState
            .filter((entry) => entry.accountId === preview.account.id)
            .map((entry) => entry.purchaseDate ?? entry.bookingDate)
            .sort()[0]
        : undefined
    return {
      imported: preview.newTransactions.length,
      pairedSettlements: finalState.filter((entry) => entry.transferPairId && entry.importBatchId === preview.batch.id).length,
      provisionalSettlements: finalState.filter(isProvisionalSettlement).length,
      cardDataFrom,
    }
  } catch {
    try {
      tx.abort()
    } catch {
      // already aborted by the failing request
    }
    throw new Error(COMMIT_FAILED_MESSAGE)
  }
}

export async function undoImport(batchId: string): Promise<void> {
  const db = await getDatabase()
  const tx = db.transaction([STORE_NAMES.accounts, STORE_NAMES.importBatches, STORE_NAMES.transactions], 'readwrite')
  tx.done.catch(() => undefined)
  try {
    const transactions = tx.objectStore(STORE_NAMES.transactions)
    const ofBatch = await transactions.index('importBatchId').getAllKeys(batchId)
    for (const id of ofBatch) await transactions.delete(id)
    await tx.objectStore(STORE_NAMES.importBatches).delete(batchId)

    const changes = reconcileCardSettlements(await transactions.getAll(), await tx.objectStore(STORE_NAMES.accounts).getAll())
    for (const change of changes) await transactions.put(change)
    await tx.done
  } catch {
    try {
      tx.abort()
    } catch {
      // already aborted by the failing request
    }
    throw new Error('Der Import konnte nicht rückgängig gemacht werden. Es wurde nichts verändert.')
  }
}

export interface ImportHistoryEntry {
  batch: ImportBatch
  accountName: string
}

export interface ImportOverview {
  imports: ImportHistoryEntry[]
  transactionCount: number
  /** Giro card statements counted as transfer only provisionally - the
   * card export for their period is missing (O-1). */
  provisionalSettlements: number
}

export async function getImportOverview(): Promise<ImportOverview> {
  const [batches, accounts, transactions] = await Promise.all([
    importBatchRepository.getAll(),
    accountRepository.getAll(),
    transactionRepository.getAll(),
  ])
  const names = new Map(accounts.map((account) => [account.id, account.name]))
  return {
    imports: [...batches]
      .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
      .map((batch) => ({ batch, accountName: names.get(batch.accountId) ?? 'Unbekanntes Konto' })),
    transactionCount: transactions.length,
    provisionalSettlements: transactions.filter(isProvisionalSettlement).length,
  }
}
