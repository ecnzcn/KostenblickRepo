/**
 * pdfjs-dist 6.x calls `Map.prototype.getOrInsertComputed`/`getOrInsert`
 * (the very new "Map Upsert" proposal) unconditionally in some code paths
 * (observed: `WorkerTransport.getOptionalContentConfig`, reached from a
 * plain `page.render()`). As of writing this is not yet implemented by any
 * shipping browser engine we target (confirmed against a recent Chromium
 * and Node 22), so an unpatched `Map` makes every PDF render throw
 * `TypeError: ...getOrInsertComputed is not a function` - silently
 * breaking every scanned PDF. This is a minimal, spec-shaped polyfill so
 * PDF rendering keeps working until browsers (and pdfjs-dist's minimum
 * supported baseline) catch up; it only defines the methods when they are
 * genuinely missing.
 */
declare global {
  interface Map<K, V> {
    getOrInsert?(key: K, value: V): V
    getOrInsertComputed?(key: K, callback: (key: K) => V): V
  }
}

if (typeof Map.prototype.getOrInsert !== 'function') {
  Map.prototype.getOrInsert = function <K, V>(this: Map<K, V>, key: K, value: V): V {
    if (!this.has(key)) this.set(key, value)
    return this.get(key) as V
  }
}

if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  Map.prototype.getOrInsertComputed = function <K, V>(this: Map<K, V>, key: K, callback: (key: K) => V): V {
    if (!this.has(key)) this.set(key, callback(key))
    return this.get(key) as V
  }
}

export {}
