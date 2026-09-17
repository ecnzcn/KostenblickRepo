/**
 * Kostenblick V1 is single-user; entities are attributed to a fixed local
 * user id until account/auth support exists. See "Haushaltsmitglieder" in
 * the CLAUDE.md roadmap for the planned multi-user extension.
 */
export const DEFAULT_USER_ID = 'local-user'
