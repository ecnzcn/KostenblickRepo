// Runs under the Node environment rather than jsdom, for the same reason
// as documentStorage.test.ts: byte-level Blob correctness is exactly what
// this file tests, and jsdom's Blob implementation is the one part of the
// stack this project has already found unreliable for that.
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { base64ToBlob, blobToBase64 } from './base64'

describe('blobToBase64 / base64ToBlob', () => {
  it('round-trips small text content losslessly', async () => {
    const original = new Blob(['Hallo Kostenblick'], { type: 'text/plain' })
    const base64 = await blobToBase64(original)
    const restored = base64ToBlob(base64, original.type)

    expect(restored.type).toBe('text/plain')
    expect(await restored.text()).toBe('Hallo Kostenblick')
  })

  it('round-trips arbitrary binary bytes (not just printable text)', async () => {
    const bytes = new Uint8Array([0, 1, 2, 253, 254, 255, 127, 128])
    const original = new Blob([bytes], { type: 'application/octet-stream' })

    const base64 = await blobToBase64(original)
    const restored = base64ToBlob(base64, original.type)
    const restoredBytes = new Uint8Array(await restored.arrayBuffer())

    expect([...restoredBytes]).toEqual([...bytes])
  })

  it('round-trips content large enough to require chunked conversion', async () => {
    // Larger than the 0x8000-byte chunk size used internally, so this
    // exercises the chunk-boundary logic instead of always taking the
    // single-chunk path.
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256)
    const original = new Blob([bytes], { type: 'application/octet-stream' })

    const base64 = await blobToBase64(original)
    const restored = base64ToBlob(base64, original.type)
    const restoredBytes = new Uint8Array(await restored.arrayBuffer())

    expect(restoredBytes.length).toBe(bytes.length)
    expect([...restoredBytes]).toEqual([...bytes])
  })

  it('preserves an empty blob', async () => {
    const original = new Blob([], { type: 'application/pdf' })
    const base64 = await blobToBase64(original)
    const restored = base64ToBlob(base64, original.type)

    expect(restored.size).toBe(0)
  })
})
