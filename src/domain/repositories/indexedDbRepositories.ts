import type { Bill, BillItem, Contract, CostEntry, Document, Property, Reminder, User, WasteCost } from '../models/entities'
import { STORE_NAMES } from '../../database/schema'
import { IndexedDBRepository } from '../../database/repository'

export const userRepository = new IndexedDBRepository<User, 'users'>(STORE_NAMES.users, 'users')
export const propertyRepository = new IndexedDBRepository<Property, 'properties'>(STORE_NAMES.properties, 'properties')
export const billRepository = new IndexedDBRepository<Bill, 'bills'>(STORE_NAMES.bills, 'bills')
export const billItemRepository = new IndexedDBRepository<BillItem, 'billItems'>(STORE_NAMES.billItems, 'billItems')
export const costEntryRepository = new IndexedDBRepository<CostEntry, 'costEntries'>(STORE_NAMES.costEntries, 'costEntries')
export const wasteCostRepository = new IndexedDBRepository<WasteCost, 'wasteCosts'>(STORE_NAMES.wasteCosts, 'wasteCosts')
export const contractRepository = new IndexedDBRepository<Contract, 'contracts'>(STORE_NAMES.contracts, 'contracts')
export const reminderRepository = new IndexedDBRepository<Reminder, 'reminders'>(STORE_NAMES.reminders, 'reminders')
export const documentRepository = new IndexedDBRepository<Document, 'documents'>(STORE_NAMES.documents, 'documents')
