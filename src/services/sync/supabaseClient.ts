import type { SupabaseClient } from '@supabase/supabase-js'
import { getSyncServerConfig } from './syncSettings'

let cached: { key: string; client: SupabaseClient } | undefined

/**
 * The Supabase client for the configured server, created lazily and only
 * when sync is configured - an unconfigured app never loads a connection.
 * The session (after the e-mail code login) is persisted by supabase-js in
 * this origin's localStorage, i.e. inside the installed PWA itself.
 * supabase-js is loaded on demand (own chunk), so devices without sync
 * never download it.
 */
export async function getSupabaseClient(): Promise<SupabaseClient | undefined> {
  const config = getSyncServerConfig()
  if (!config) return undefined
  const key = `${config.url}|${config.anonKey}`
  if (cached?.key !== key) {
    const { createClient } = await import('@supabase/supabase-js')
    cached = {
      key,
      client: createClient(config.url, config.anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      }),
    }
  }
  return cached.client
}

export async function requireSupabaseClient(): Promise<SupabaseClient> {
  const client = await getSupabaseClient()
  if (!client) throw new Error('Synchronisierung ist nicht eingerichtet.')
  return client
}

/** Test hook: forget the cached client (e.g. after the config changed). */
export function resetSupabaseClient(): void {
  cached = undefined
}
