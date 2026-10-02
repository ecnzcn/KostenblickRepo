import { requireSupabaseClient } from './supabaseClient'

export interface HouseholdSummary {
  id: string
  name: string
}

/**
 * Login with a one-time code sent by e-mail (Phase 13D). A code - not a
 * magic link - because on iOS a link opens Safari, not the installed
 * home-screen PWA, and the two keep separate storage: the session would
 * never reach the app. The code is typed straight into the app instead.
 */
export async function requestLoginCode(email: string): Promise<void> {
  const { error } = await (await requireSupabaseClient()).auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: true },
  })
  if (error) throw error
}

export async function verifyLoginCode(email: string, code: string): Promise<void> {
  const { error } = await (await requireSupabaseClient()).auth.verifyOtp({
    email: email.trim(),
    token: code.replace(/\s+/g, ''),
    type: 'email',
  })
  if (error) throw error
}

export async function getSignedInEmail(): Promise<string | undefined> {
  const { data } = await (await requireSupabaseClient()).auth.getSession()
  return data.session?.user.email ?? undefined
}

export async function signOut(): Promise<void> {
  const { error } = await (await requireSupabaseClient()).auth.signOut()
  if (error) throw error
}

/** Households the signed-in user belongs to (RLS returns only those). */
export async function listMyHouseholds(): Promise<HouseholdSummary[]> {
  const { data, error } = await (await requireSupabaseClient()).from('households').select('id,name').order('created_at')
  if (error) throw error
  return (data ?? []) as HouseholdSummary[]
}

export async function createHousehold(name: string): Promise<HouseholdSummary> {
  const { data, error } = await (await requireSupabaseClient()).rpc('create_household', { p_name: name })
  if (error) throw error
  return { id: data as string, name: name.trim() || 'Mein Haushalt' }
}

export async function createInviteCode(householdId: string): Promise<string> {
  const { data, error } = await (await requireSupabaseClient()).rpc('create_household_invite', { p_household: householdId })
  if (error) throw error
  return data as string
}

export async function joinHousehold(code: string): Promise<HouseholdSummary> {
  const { data, error } = await (await requireSupabaseClient()).rpc('join_household', { p_code: code })
  if (error) throw error
  const row = (data as Array<{ household_id: string; household_name: string }> | null)?.[0]
  if (!row) throw new Error('invalid_invite')
  return { id: row.household_id, name: row.household_name }
}
