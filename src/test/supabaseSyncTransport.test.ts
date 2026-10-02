// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseSyncTransport } from '../services/sync/SupabaseSyncTransport'

function fakeClient(rows: unknown[], rpcResult: unknown = []) {
  const calls: Record<string, unknown[]> = {}
  const query = {
    select: vi.fn((...args: unknown[]) => ((calls.select = args), query)),
    eq: vi.fn((...args: unknown[]) => ((calls.eq = args), query)),
    gt: vi.fn((...args: unknown[]) => ((calls.gt = args), query)),
    order: vi.fn((...args: unknown[]) => ((calls.order = args), query)),
    limit: vi.fn((...args: unknown[]) => {
      calls.limit = args
      return Promise.resolve({ data: rows, error: null })
    }),
  }
  const client = {
    from: vi.fn(() => query),
    rpc: vi.fn((...args: unknown[]) => {
      calls.rpc = args
      return Promise.resolve({ data: rpcResult, error: null })
    }),
  }
  return { client: client as unknown as SupabaseClient, calls }
}

describe('SupabaseSyncTransport', () => {
  it('pulls rows of its household after the cursor, ordered by revision, one extra row to detect more', async () => {
    const row = (rev: number | string) => ({ entity_type: 'contracts', id: `c${rev}`, data: { id: `c${rev}` }, updated_at: 'x', rev })
    const { client, calls } = fakeClient([row(4), row('5'), row(6)])
    const page = await new SupabaseSyncTransport(client, 'hh-1').pull(3, 2)

    expect(calls.eq).toEqual(['household_id', 'hh-1'])
    expect(calls.gt).toEqual(['rev', 3])
    expect(calls.order).toEqual(['rev', { ascending: true }])
    expect(calls.limit).toEqual([3])
    expect(page.hasMore).toBe(true)
    expect(page.records.map((r) => r.rev)).toEqual([4, 5])
    expect(page.records[0]).toMatchObject({ entityType: 'contracts', id: 'c4' })
  })

  it('pushes through sync_push and normalises bigint revisions', async () => {
    const { client, calls } = fakeClient([], [
      { entityType: 'contracts', id: 'c1', status: 'applied', rev: '7', conflict: false },
      { entityType: 'contracts', id: 'c2', status: 'rejected', server: { entityType: 'contracts', id: 'c2', data: { id: 'c2' }, updatedAt: 'x', rev: '9' } },
    ])
    const change = { entityType: 'contracts' as const, id: 'c1', data: { id: 'c1' } as never, updatedAt: 'x', baseRev: null }
    const results = await new SupabaseSyncTransport(client, 'hh-1').push([change])

    expect(calls.rpc).toEqual(['sync_push', { p_household: 'hh-1', p_changes: [change] }])
    expect(results[0]).toMatchObject({ status: 'applied', rev: 7 })
    expect(results[1]).toMatchObject({ status: 'rejected', server: { rev: 9 } })
  })

  it('does not call the server for an empty push', async () => {
    const { client } = fakeClient([])
    expect(await new SupabaseSyncTransport(client, 'hh-1').push([])).toEqual([])
    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('throws server errors so the sync run fails without touching local data', async () => {
    const client = { rpc: vi.fn(() => Promise.resolve({ data: null, error: { message: 'not_a_member' } })) }
    await expect(
      new SupabaseSyncTransport(client as unknown as SupabaseClient, 'hh-1').push([
        { entityType: 'contracts', id: 'c1', data: { id: 'c1' } as never, updatedAt: 'x', baseRev: null },
      ]),
    ).rejects.toMatchObject({ message: 'not_a_member' })
  })
})
