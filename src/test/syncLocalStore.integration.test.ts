// Real IndexedDB (fake-indexeddb) behind the sync engine: one device on the
// app's database, a second simulated device pushing through the same fake
// server.
// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteDatabase, getDatabase } from '../database/database'
import { contractRepository } from '../domain/repositories/indexedDbRepositories'
import type { Contract } from '../domain/models/entities'
import { InMemorySyncServer, InMemorySyncTransport } from '../services/sync/InMemorySyncTransport'
import { IndexedDbSyncLocalStore } from '../services/sync/IndexedDbSyncLocalStore'
import { SyncEngine } from '../services/sync/SyncEngine'
import type { PushChange } from '../services/sync/syncTypes'

const contract = (overrides: Partial<Contract> = {}): Contract => ({
  id: 'c1',
  createdAt: '',
  updatedAt: '',
  deletedAt: null,
  syncVersion: 0,
  userId: 'household-1',
  categoryId: 'internet',
  provider: 'Telekom',
  monthlyCost: 40,
  startDate: '2026-01-01T00:00:00.000Z',
  autoRenewal: true,
  reminderEnabled: false,
  ...overrides,
})

function makeEngine(server: InMemorySyncServer) {
  let cursor = 0
  const engine = new SyncEngine(new InMemorySyncTransport(server), new IndexedDbSyncLocalStore(), {
    get: () => cursor,
    set: (value) => (cursor = value),
  })
  return { engine, cursor: () => cursor }
}

function remoteChange(server: InMemorySyncServer, data: Contract, baseRev: number | null) {
  const change: PushChange = { entityType: 'contracts', id: data.id, data, updatedAt: data.updatedAt, baseRev }
  return server.push([change])[0]!
}

beforeEach(async () => {
  await deleteDatabase()
})

describe('IndexedDbSyncLocalStore', () => {
  it('pushes a locally saved record, clears its queue entry and stores the server revision', async () => {
    const server = new InMemorySyncServer()
    const { engine } = makeEngine(server)
    await contractRepository.save(contract())

    const result = await engine.run()
    expect(result.pushed).toBe(1)

    const db = await getDatabase()
    expect(await db.getAll('syncQueue')).toHaveLength(0)
    const stored = (await db.get('contracts', 'c1')) as Contract & { serverRev?: number }
    expect(stored.serverRev).toBe(1)
    expect('serverRev' in server.all()[0]!.data).toBe(false)
  })

  it('writes pulled records without marking them as local changes', async () => {
    const server = new InMemorySyncServer()
    remoteChange(server, contract({ updatedAt: '2026-10-01T10:00:00.000Z', syncVersion: 1 }), null)
    const { engine, cursor } = makeEngine(server)

    await engine.run()

    const db = await getDatabase()
    expect(await db.getAll('syncQueue')).toHaveLength(0)
    const stored = await contractRepository.getById('c1')
    expect(stored?.provider).toBe('Telekom')
    expect(stored?.updatedAt).toBe('2026-10-01T10:00:00.000Z')
    expect(cursor()).toBe(1)
  })

  it('takes over the newer server version when a concurrent local edit loses', async () => {
    const server = new InMemorySyncServer()
    const { engine } = makeEngine(server)
    await contractRepository.save(contract())
    await engine.run()

    // Another device changes the record later than our offline edit.
    const local = await contractRepository.save({ ...(await contractRepository.getById('c1'))!, provider: 'Lokal' })
    remoteChange(server, { ...local, provider: 'Remote', updatedAt: '2999-01-01T00:00:00.000Z', syncVersion: 9 }, 1)

    const result = await engine.run()
    expect(result.conflicts).toHaveLength(1)
    expect(result.conflicts[0]?.winner).toBe('server')
    expect((await contractRepository.getById('c1'))?.provider).toBe('Remote')
    const db = await getDatabase()
    expect(await db.getAll('syncQueue')).toHaveLength(0)
  })

  it('keeps a record pending when it was edited again while its push was in flight', async () => {
    const store = new IndexedDbSyncLocalStore()
    await contractRepository.save(contract())
    const [sent] = await store.getPendingChanges()
    await contractRepository.save({ ...(await contractRepository.getById('c1'))!, provider: 'Neu' })

    await store.acknowledgePush([sent!], [{ entityType: 'contracts', id: 'c1', status: 'applied', rev: 5, conflict: false }])

    const db = await getDatabase()
    expect(await db.getAll('syncQueue')).toHaveLength(1)
    const stored = (await db.get('contracts', 'c1')) as Contract & { serverRev?: number }
    expect(stored.serverRev).toBe(5)
    expect(stored.provider).toBe('Neu')
  })

  it('ignores pulled records that are malformed or of an unknown type', async () => {
    const store = new IndexedDbSyncLocalStore()
    await store.applyPulled([
      { entityType: 'categories' as never, id: 'x', data: contract({ id: 'x' }), updatedAt: '', rev: 1 },
      { entityType: 'contracts', id: 'mismatch', data: contract({ id: 'other', updatedAt: 'x' }), updatedAt: '', rev: 2 },
    ])
    const db = await getDatabase()
    expect(await db.getAll('contracts')).toHaveLength(0)
  })

  it('skips a pulled record already known at the same or a newer revision', async () => {
    const store = new IndexedDbSyncLocalStore()
    const db = await getDatabase()
    await db.put('contracts', { ...contract({ provider: 'Neuer', updatedAt: 'x', syncVersion: 2 }), serverRev: 5 } as never)
    await store.applyPulled([{ entityType: 'contracts', id: 'c1', data: contract({ provider: 'Alt', updatedAt: 'y' }), updatedAt: 'y', rev: 4 }])
    expect((await contractRepository.getById('c1'))?.provider).toBe('Neuer')
  })
})
