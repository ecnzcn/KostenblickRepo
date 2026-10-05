import type { Account, AccountType } from '../../models/entities'
import { sha256Hex } from '../../../utils/hash'

/**
 * An account is recognised by a salted hash of its IBAN (giro) or masked
 * card number (credit card) - the identifier itself is never stored. The
 * salt is random per account and kept in the Account record, so the hash is
 * a pseudonym, not a lookup-table key (14A, 2.2).
 */

export function last4(identifier: string): string {
  return identifier.replace(/\D/g, '').slice(-4)
}

export function hashAccountIdentifier(identifier: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}|${identifier}`)
}

export function createIdentifierSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The stored account this export belongs to, if any. */
export async function findMatchingAccount(
  accounts: readonly Account[],
  identifier: string,
  type: AccountType,
): Promise<Account | undefined> {
  for (const account of accounts) {
    if (account.type !== type) continue
    if ((await hashAccountIdentifier(identifier, account.identifierSalt)) === account.identifierHash) return account
  }
  return undefined
}
