import type { ImportBatchCounts } from '../../models/entities'
import type { KeyedBankRow } from './dedupeKey'

export interface ImportPlan {
  newRows: KeyedBankRow[]
  duplicateRows: KeyedBankRow[]
  counts: ImportBatchCounts
  /** YYYY-MM-DD over all booked rows of the file; undefined without any. */
  periodFrom?: string
  periodTo?: string
}

/** Splits a keyed statement against the keys already stored for this
 * account. Pure - the caller loads the existing keys once (not per row). */
export function planImport(existingKeys: ReadonlySet<string>, rows: readonly KeyedBankRow[], pendingCount: number): ImportPlan {
  const newRows: KeyedBankRow[] = []
  const duplicateRows: KeyedBankRow[] = []
  for (const row of rows) (existingKeys.has(row.dedupeKey) ? duplicateRows : newRows).push(row)

  const dates = rows.map((row) => row.bookingDate).sort()
  return {
    newRows,
    duplicateRows,
    counts: {
      total: rows.length + pendingCount,
      new: newRows.length,
      duplicates: duplicateRows.length,
      skippedPending: pendingCount,
    },
    periodFrom: dates[0],
    periodTo: dates[dates.length - 1],
  }
}
