import type { Account, CategoryRule, ImportBatch, SavingsGoal, Transaction } from '../models/entities'
import { STORE_NAMES } from '../../database/schema'
import { IndexedDBSimpleRepository } from '../../database/repository'

// Local-only (Phase 14): plain repositories with hard delete. They never
// write to the syncQueue because these stores are not SYNC_ENTITY_TYPES.
export const accountRepository = new IndexedDBSimpleRepository<Account, 'accounts'>(STORE_NAMES.accounts)
export const transactionRepository = new IndexedDBSimpleRepository<Transaction, 'transactions'>(STORE_NAMES.transactions)
export const importBatchRepository = new IndexedDBSimpleRepository<ImportBatch, 'importBatches'>(STORE_NAMES.importBatches)
export const categoryRuleRepository = new IndexedDBSimpleRepository<CategoryRule, 'categoryRules'>(STORE_NAMES.categoryRules)
export const savingsGoalRepository = new IndexedDBSimpleRepository<SavingsGoal, 'savingsGoals'>(STORE_NAMES.savingsGoals)
