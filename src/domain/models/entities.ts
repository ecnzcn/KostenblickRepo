export type ISODateString = string

export interface PersistedEntity {
  id: string
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface SyncableEntity extends PersistedEntity {
  deletedAt: ISODateString | null
  syncVersion: number
}

export type BillType = 'utility' | 'operating_cost' | 'annual_statement'
export type BalanceType = 'credit' | 'payment_due' | 'none'
export type OCRStatus = 'pending' | 'processing' | 'needs_review' | 'verified' | 'failed' | 'not_started'
export type CategoryType = 'cost' | 'contract' | 'both'
export type CostSource = 'bill' | 'contract' | 'manual' | 'import'
export type CancellationUnit = 'days' | 'weeks' | 'months' | 'years'
export type ReminderType = 'cancellation' | 'contract_end' | 'custom'
export type ReminderStatus = 'pending' | 'sent' | 'dismissed'
export type DocumentType = 'bill' | 'contract' | 'waste' | 'other'
export type WasteCategory = 'residual' | 'organic' | 'paper' | 'recycling' | 'other'

export interface User extends SyncableEntity {
  displayName: string
  email?: string
}

export interface Property extends SyncableEntity {
  userId: string
  name: string
  address?: string
}

export interface Bill extends SyncableEntity {
  userId: string
  propertyId?: string
  type: BillType
  year: number
  periodStart?: ISODateString
  periodEnd?: ISODateString
  totalAmount: number
  advancePayments: number
  balance: number
  balanceType: BalanceType
  documentId?: string
  ocrStatus: OCRStatus
}

export interface BillItem extends SyncableEntity {
  billId: string
  categoryId?: string
  description: string
  amount: number
  confidence: number
  sourceText?: string
  manuallyVerified: boolean
}

export interface Category extends PersistedEntity {
  name: string
  icon: string
  type: CategoryType
}

export interface CostEntry extends SyncableEntity {
  userId: string
  categoryId: string
  amount: number
  date: ISODateString
  period?: string
  source: CostSource
  contractId?: string
  billId?: string
  notes?: string
}

export interface WasteCost extends SyncableEntity {
  userId: string
  year: number
  category: WasteCategory
  amount: number
  notes?: string
  documentId?: string
}

export interface Contract extends SyncableEntity {
  userId: string
  categoryId: string
  provider: string
  tariff?: string
  contractNumber?: string
  monthlyCost: number
  yearlyCost?: number
  startDate: ISODateString
  endDate?: ISODateString
  cancellationPeriodValue?: number
  cancellationPeriodUnit?: CancellationUnit
  calculatedCancellationDate?: ISODateString
  autoRenewal: boolean
  reminderEnabled: boolean
  documentId?: string
  notes?: string
}

export interface Reminder extends SyncableEntity {
  userId: string
  contractId?: string
  reminderDate: ISODateString
  type: ReminderType
  status: ReminderStatus
}

export interface Document extends SyncableEntity {
  userId: string
  type: DocumentType
  filename: string
  mimeType: string
  size: number
  storagePath: string
  ocrStatus: OCRStatus
  ocrText?: string
  checksum?: string
}

export interface SyncQueueItem extends PersistedEntity {
  entityType: EntityType
  entityId: string
  operation: 'upsert' | 'delete'
  queuedAt: ISODateString
  attempts: number
}

export type EntityType = 'users' | 'properties' | 'bills' | 'billItems' | 'categories' | 'costEntries' | 'wasteCosts' | 'contracts' | 'reminders' | 'documents'

export type EntityMap = {
  users: User
  properties: Property
  bills: Bill
  billItems: BillItem
  categories: Category
  costEntries: CostEntry
  wasteCosts: WasteCost
  contracts: Contract
  reminders: Reminder
  documents: Document
}
