import type { DBSchema } from 'idb'
import type { Bill, BillItem, Category, Contract, CostEntry, Document, Property, Reminder, User, WasteCost, SyncQueueItem } from '../domain/models/entities'

export const DATABASE_NAME = 'kostenblick'
export const DATABASE_VERSION = 1

export const STORE_NAMES = {
  users: 'users',
  properties: 'properties',
  bills: 'bills',
  billItems: 'billItems',
  categories: 'categories',
  costEntries: 'costEntries',
  wasteCosts: 'wasteCosts',
  contracts: 'contracts',
  reminders: 'reminders',
  documents: 'documents',
  syncQueue: 'syncQueue',
} as const

export type StoreName = keyof typeof STORE_NAMES

export interface KostenblickDB extends DBSchema {
  users: { key: string; value: User; indexes: { userId: string; updatedAt: string; deletedAt: string } }
  properties: { key: string; value: Property; indexes: { userId: string; updatedAt: string; deletedAt: string } }
  bills: { key: string; value: Bill; indexes: { userId: string; year: number; propertyId: string; updatedAt: string; deletedAt: string } }
  billItems: { key: string; value: BillItem; indexes: { billId: string; categoryId: string; updatedAt: string; deletedAt: string } }
  categories: { key: string; value: Category; indexes: { type: string } }
  costEntries: { key: string; value: CostEntry; indexes: { userId: string; categoryId: string; date: string; period: string; updatedAt: string; deletedAt: string } }
  wasteCosts: { key: string; value: WasteCost; indexes: { userId: string; year: number; category: string; updatedAt: string; deletedAt: string } }
  contracts: { key: string; value: Contract; indexes: { userId: string; categoryId: string; endDate: string; calculatedCancellationDate: string; updatedAt: string; deletedAt: string } }
  reminders: { key: string; value: Reminder; indexes: { userId: string; contractId: string; reminderDate: string; status: string; updatedAt: string; deletedAt: string } }
  documents: { key: string; value: Document; indexes: { userId: string; type: string; updatedAt: string; deletedAt: string } }
  syncQueue: { key: string; value: SyncQueueItem; indexes: { entityType: string; entityId: string; queuedAt: string } }
}
