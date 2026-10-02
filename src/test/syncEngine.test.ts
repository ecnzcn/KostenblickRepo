// Pure sync-engine tests: two (or more) simulated devices against the
// in-memory fake server, no IndexedDB involved.
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { SyncableEntity } from '../domain/models/entities'
import { InMemorySyncServer, InMemorySyncTransport } from '../services/sync/InMemorySyncTransport'
import { SyncEngine, type SyncLocalStore } from '../services/sync/SyncEngine'
import type { PushChange, PushResult, SyncEntityType, SyncRecord } from '../services/sync/syncTypes'

type Entity = SyncableEntity & { name: string; serverRev?: number }

/** Minimal device: records per key, a pending set, a cursor. */
class FakeDevice implements SyncLocalStore {
  readonly records = new Map<string, Entity>()
  readonly pending = new Set<string>()
  cursor = 0
  readonly engine: SyncEngine

  constructor(server: InMemorySyncServer, pushBatchSize = 200, pullPageSize = 500) {
    this.engine = new SyncEngine(
      new InMemorySyncTransport(server),
      this,
      { get: () => this.cursor, set: (value) => (this.cursor = value) },
      { pushBatchSize, pullPageSize, now: () => '2026-10-02T12:00:00.000Z' },
    )
  }

  edit(id: string, name: string, updatedAt: string, type: SyncEntityType = 'contracts'): void {
    const key = `${type}:${id}`
    const current = this.records.get(key)
    this.records.set(key, {
      id,
      name,
      createdAt: current?.createdAt ?? updatedAt,
      updatedAt,
      deletedAt: null,
      syncVersion: (current?.syncVersion ?? 0) + 1,
      serverRev: current?.serverRev,
    })
    this.pending.add(key)
  }

  remove(id: string, updatedAt: string, type: SyncEntityType = 'contracts'): void {
    const key = `${type}:${id}`
    const current = this.records.get(key)!
    this.records.set(key, { ...current, deletedAt: updatedAt, updatedAt, syncVersion: current.syncVersion + 1 })
    this.pending.add(key)
  }

  get(id: string, type: SyncEntityType = 'contracts'): Entity | undefined {
    return this.records.get(`${type}:${id}`)
  }

  async getPendingChanges(): Promise<PushChange[]> {
    return [...this.pending].map((key) => {
      const [entityType, id] = key.split(':') as [SyncEntityType, string]
      const { serverRev, ...data } = this.records.get(key)!
      return { entityType, id, data, updatedAt: data.updatedAt, baseRev: serverRev ?? null }
    })
  }

  async acknowledgePush(sent: PushChange[], results: PushResult[]): Promise<void> {
    for (const result of results) {
      const key = `${result.entityType}:${result.id}`
      const change = sent.find((c) => `${c.entityType}:${c.id}` === key)!
      const current = this.records.get(key)!
      const unchanged = current.updatedAt === change.updatedAt
      if (result.status === 'applied') {
        this.records.set(key, { ...current, serverRev: result.rev })
        if (unchanged) this.pending.delete(key)
      } else if (!unchanged) {
        this.records.set(key, { ...current, serverRev: result.server.rev })
      } else {
        this.records.set(key, { ...(result.server.data as Entity), serverRev: result.server.rev })
        this.pending.delete(key)
      }
    }
  }

  async applyPulled(records: SyncRecord[]): Promise<void> {
    for (const record of records) {
      const key = `${record.entityType}:${record.id}`
      if (this.pending.has(key)) continue
      const current = this.records.get(key)
      if (current?.serverRev !== undefined && current.serverRev >= record.rev) continue
      this.records.set(key, { ...(record.data as Entity), serverRev: record.rev })
    }
  }
}

describe('SyncEngine with two devices', () => {
  it('brings a record created on one device to the other', async () => {
    const server = new InMemorySyncServer()
    const phone = new FakeDevice(server)
    const tablet = new FakeDevice(server)

    phone.edit('c1', 'Strom', '2026-10-01T10:00:00.000Z')
    const first = await phone.engine.run()
    expect(first.pushed).toBe(1)
    expect(phone.pending.size).toBe(0)

    const second = await tablet.engine.run()
    expect(second.pulled).toBe(1)
    expect(tablet.get('c1')?.name).toBe('Strom')
    expect(tablet.get('c1')?.serverRev).toBe(1)
  })

  it('is idempotent: a second run without changes pushes and pulls nothing new', async () => {
    const server = new InMemorySyncServer()
    const phone = new FakeDevice(server)
    phone.edit('c1', 'Strom', '2026-10-01T10:00:00.000Z')
    await phone.engine.run()

    const again = await phone.engine.run()
    expect(again.pushed).toBe(0)
    expect(again.pulled).toBe(0)
    expect(server.all()).toHaveLength(1)
  })

  it('applies sequential edits from both devices without conflicts', async () => {
    const server = new InMemorySyncServer()
    const phone = new FakeDevice(server)
    const tablet = new FakeDevice(server)
    phone.edit('c1', 'Strom', '2026-10-01T10:00:00.000Z')
    await phone.engine.run()
    await tablet.engine.run()

    tablet.edit('c1', 'Strom (neuer Tarif)', '2026-10-01T11:00:00.000Z')
    const tabletRun = await tablet.engine.run()
    expect(tabletRun.conflicts).toEqual([])

    await phone.engine.run()
    expect(phone.get('c1')?.name).toBe('Strom (neuer Tarif)')
  })

  it('resolves a concurrent edit in favour of the newer change and logs the loser (server wins)', async () => {
    const server = new InMemorySyncServer()
    const phone = new FakeDevice(server)
    const tablet = new FakeDevice(server)
    phone.edit('c1', 'Strom', '2026-10-01T10:00:00.000Z')
    await phone.engine.run()
    await tablet.engine.run()

    // Both edit offline; the tablet's edit is newer but reaches the server first.
    phone.edit('c1', 'Phone-Version', '2026-10-01T12:00:00.000Z')
    tablet.edit('c1', 'Tablet-Version', '2026-10-01T13:00:00.000Z')
    await tablet.engine.run()
    const phoneRun = await phone.engine.run()

    expect(phoneRun.conflicts).toHaveLength(1)
    expect(phoneRun.conflicts[0]).toMatchObject({ id: 'c1', winner: 'server' })
    expect((phoneRun.conflicts[0]!.losingVersion as Entity).name).toBe('Phone-Version')
    expect(phone.get('c1')?.name).toBe('Tablet-Version')
    expect(phone.pending.size).toBe(0)
  })

  it('lets a newer local edit win over an older server edit and logs the overwritten version', async () => {
    const server = new InMemorySyncServer()
    const phone = new FakeDevice(server)
    const tablet = new FakeDevice(server)
    phone.edit('c1', 'Strom', '2026-10-01T10:00:00.000Z')
    await phone.engine.run()
    await tablet.engine.run()

    tablet.edit('c1', 'Tablet-Version', '2026-10-01T12:00:00.000Z')
    phone.edit('c1', 'Phone-Version', '2026-10-01T13:00:00.000Z')
    await tablet.engine.run()
    const phoneRun = await phone.engine.run()

    expect(phoneRun.conflicts[0]).toMatchObject({ id: 'c1', winner: 'local' })
    expect((phoneRun.conflicts[0]!.losingVersion as Entity).name).toBe('Tablet-Version')
    await tablet.engine.run()
    expect(tablet.get('c1')?.name).toBe('Phone-Version')
  })

  it('propagates a soft delete as a normal change', async () => {
    const server = new InMemorySyncServer()
    const phone = new FakeDevice(server)
    const tablet = new FakeDevice(server)
    phone.edit('c1', 'Strom', '2026-10-01T10:00:00.000Z')
    await phone.engine.run()
    await tablet.engine.run()

    tablet.remove('c1', '2026-10-01T11:00:00.000Z')
    await tablet.engine.run()
    await phone.engine.run()
    expect(phone.get('c1')?.deletedAt).toBe('2026-10-01T11:00:00.000Z')
  })

  it('never overwrites a pending local change during pull', async () => {
    const server = new InMemorySyncServer()
    const phone = new FakeDevice(server)
    const tablet = new FakeDevice(server)
    phone.edit('c1', 'Strom', '2026-10-01T10:00:00.000Z')
    await phone.engine.run()
    await tablet.engine.run()

    tablet.edit('c1', 'Tablet-Version', '2026-10-01T11:00:00.000Z')
    await tablet.engine.run()
    phone.edit('c1', 'Phone-Version', '2026-10-01T12:00:00.000Z')
    await phone.applyPulled(server.pull(0, 100).records)
    expect(phone.get('c1')?.name).toBe('Phone-Version')
  })

  it('pushes in batches and pulls across several pages', async () => {
    const server = new InMemorySyncServer()
    const phone = new FakeDevice(server, 3)
    const tablet = new FakeDevice(server, 200, 4)
    for (let i = 0; i < 10; i += 1) phone.edit(`c${i}`, `Vertrag ${i}`, `2026-10-01T10:00:0${i}.000Z`)
    await phone.engine.run()
    expect(server.all()).toHaveLength(10)

    const run = await tablet.engine.run()
    expect(run.pulled).toBe(10)
    expect(tablet.records.size).toBe(10)
    expect(tablet.cursor).toBe(10)
  })

  it('keeps entity types apart even for equal ids', async () => {
    const server = new InMemorySyncServer()
    const phone = new FakeDevice(server)
    const tablet = new FakeDevice(server)
    phone.edit('x', 'Vertrag', '2026-10-01T10:00:00.000Z', 'contracts')
    phone.edit('x', 'Abrechnung', '2026-10-01T10:00:00.000Z', 'bills')
    await phone.engine.run()
    await tablet.engine.run()
    expect(tablet.get('x', 'contracts')?.name).toBe('Vertrag')
    expect(tablet.get('x', 'bills')?.name).toBe('Abrechnung')
  })

  it('rejects a server answer for a record that was never sent', async () => {
    const server = new InMemorySyncServer()
    const device = new FakeDevice(server)
    device.edit('c1', 'Strom', '2026-10-01T10:00:00.000Z')
    const bogus = new SyncEngine(
      {
        push: async () => [{ entityType: 'contracts', id: 'other', status: 'applied', rev: 1, conflict: false }],
        pull: async () => ({ records: [], hasMore: false }),
      },
      device,
      { get: () => 0, set: () => {} },
    )
    await expect(bogus.run()).rejects.toThrow('unerwartete Antwort')
  })
})
