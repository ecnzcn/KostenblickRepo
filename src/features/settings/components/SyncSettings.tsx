import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { TextField } from '../../../components/form/fields'
import {
  createHousehold,
  createInviteCode,
  getSignedInEmail,
  joinHousehold,
  listMyHouseholds,
  requestLoginCode,
  signOut,
  verifyLoginCode,
  type HouseholdSummary,
} from '../../../services/sync/accountService'
import { adoptLocalDataIntoHousehold, clearLocalSyncData, countLocalSyncRecords } from '../../../services/sync/householdData'
import { resetSupabaseClient } from '../../../services/sync/supabaseClient'
import { describeSyncError } from '../../../services/sync/syncErrors'
import { runSync } from '../../../services/sync/syncService'
import {
  clearConflictLog,
  getConflictLog,
  getHouseholdMembership,
  getSyncServerConfig,
  getSyncStatus,
  resetSyncCursor,
  saveHouseholdMembership,
  saveSyncServerConfig,
  type HouseholdMembership,
} from '../../../services/sync/syncSettings'
import type { SyncConflictEntry } from '../../../services/sync/syncTypes'
import { downloadBackup } from '../downloadBackup'

type Pending =
  | { kind: 'create'; name: string; localCount: number }
  | { kind: 'connect'; household: HouseholdSummary; localCount: number }

type View =
  | { kind: 'loading' }
  | { kind: 'setup' }
  | { kind: 'login'; step: 'email' | 'code'; email: string }
  | { kind: 'choose'; email: string; households: HouseholdSummary[] }
  | { kind: 'confirm'; email: string; pending: Pending }
  | { kind: 'active'; email: string; membership: HouseholdMembership }

const ENTITY_LABELS: Record<string, string> = {
  properties: 'Objekt',
  bills: 'Abrechnung',
  billItems: 'Kostenposition',
  costEntries: 'Kosteneintrag',
  wasteCosts: 'Müllkosten',
  contracts: 'Vertrag',
  reminders: 'Erinnerung',
  documents: 'Dokument',
}

const PRIMARY = 'min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-60'
const SECONDARY =
  'min-h-11 rounded-xl border border-neutral-300 bg-white px-4 text-sm font-medium text-neutral-700 disabled:opacity-60'

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}

function describeConflict(entry: SyncConflictEntry): string {
  const label = ENTITY_LABELS[entry.entityType] ?? entry.entityType
  const kept = entry.winner === 'server' ? 'Version des anderen Geräts behalten' : 'Version dieses Geräts behalten'
  return `${label} · ${kept} · ${formatDateTime(entry.resolvedAt)}`
}

/** Works out which step of the setup this device is in. */
async function resolveView(): Promise<{ view: View; error?: string }> {
  if (!getSyncServerConfig()) return { view: { kind: 'setup' } }
  try {
    const email = await getSignedInEmail()
    if (!email) return { view: { kind: 'login', step: 'email', email: '' } }
    const membership = getHouseholdMembership()
    if (membership) return { view: { kind: 'active', email, membership } }
    return { view: { kind: 'choose', email, households: await listMyHouseholds() } }
  } catch (caught) {
    return { view: { kind: 'login', step: 'email', email: '' }, error: describeSyncError(caught) }
  }
}

/**
 * Phase 13D/13E: connect this device to a Supabase sync server, log in with
 * an e-mail code, create or join a household (two equal members) and sync.
 * Every step that changes local data (handing it to a household, replacing
 * it) needs an explicit confirmation, with a backup offered first.
 */
export function SyncSettings() {
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [notice, setNotice] = useState<string>()

  const refresh = useCallback(async () => {
    const resolved = await resolveView()
    setView(resolved.view)
    setError(resolved.error)
  }, [])

  useEffect(() => {
    let active = true
    void resolveView().then((resolved) => {
      if (!active) return
      setView(resolved.view)
      setError(resolved.error)
    })
    return () => {
      active = false
    }
  }, [])

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(undefined)
    setNotice(undefined)
    try {
      await action()
    } catch (caught) {
      setError(describeSyncError(caught))
    } finally {
      setBusy(false)
    }
  }

  async function finishConnect(household: HouseholdSummary, mode: 'merge' | 'replace', email: string) {
    if (mode === 'replace') await clearLocalSyncData()
    else await adoptLocalDataIntoHousehold(household.id)
    const membership = { householdId: household.id, householdName: household.name }
    saveHouseholdMembership(membership)
    resetSyncCursor(household.id)
    setView({ kind: 'active', email, membership })
    const outcome = await runSync()
    if (outcome.kind === 'error') setError(outcome.message)
    else setNotice('Dieses Gerät ist verbunden und synchronisiert.')
  }

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold text-neutral-900">Synchronisierung</h2>
      <p className="mt-1 text-xs text-neutral-500">
        Gleicht deine Daten zwischen mehreren Geräten und Personen eines Haushalts ab. Die App funktioniert weiterhin
        vollständig offline; abgeglichen wird beim Öffnen, bei Rückkehr in die App und auf Knopfdruck. Dokument-Dateien
        werden noch nicht übertragen, nur ihre Angaben.
      </p>

      <div className="mt-4">
        {view.kind === 'loading' ? <p className="text-sm text-neutral-500">Wird geladen …</p> : null}
        {view.kind === 'setup' ? <ServerSetup busy={busy} onSaved={() => void refresh()} /> : null}
        {view.kind === 'login' ? (
          <LoginForm
            view={view}
            busy={busy}
            onRequest={(email) =>
              run(async () => {
                await requestLoginCode(email)
                setView({ kind: 'login', step: 'code', email })
              })
            }
            onVerify={(code) =>
              run(async () => {
                await verifyLoginCode(view.email, code)
                await refresh()
              })
            }
            onBack={() => setView({ kind: 'login', step: 'email', email: view.email })}
            onChangeServer={() => {
              saveSyncServerConfig(undefined)
              resetSupabaseClient()
              setView({ kind: 'setup' })
            }}
          />
        ) : null}
        {view.kind === 'choose' ? (
          <HouseholdChooser
            households={view.households}
            busy={busy}
            onCreate={(name) =>
              run(async () => {
                const localCount = await countLocalSyncRecords()
                if (localCount > 0) {
                  setView({ kind: 'confirm', email: view.email, pending: { kind: 'create', name, localCount } })
                  return
                }
                await finishConnect(await createHousehold(name), 'merge', view.email)
              })
            }
            onConnect={(household) =>
              run(async () => {
                const localCount = await countLocalSyncRecords()
                if (localCount > 0) {
                  setView({ kind: 'confirm', email: view.email, pending: { kind: 'connect', household, localCount } })
                  return
                }
                await finishConnect(household, 'merge', view.email)
              })
            }
            onJoin={(code) =>
              run(async () => {
                const household = await joinHousehold(code)
                const localCount = await countLocalSyncRecords()
                if (localCount > 0) {
                  setView({ kind: 'confirm', email: view.email, pending: { kind: 'connect', household, localCount } })
                  return
                }
                await finishConnect(household, 'merge', view.email)
              })
            }
            onSignOut={() =>
              run(async () => {
                await signOut()
                await refresh()
              })
            }
          />
        ) : null}
        {view.kind === 'confirm' ? (
          <ConfirmLocalData
            pending={view.pending}
            busy={busy}
            onBackup={() => run(downloadBackup)}
            onCancel={() => void refresh()}
            onConfirm={(mode) =>
              run(async () => {
                const household =
                  view.pending.kind === 'create' ? await createHousehold(view.pending.name) : view.pending.household
                await finishConnect(household, mode, view.email)
              })
            }
          />
        ) : null}
        {view.kind === 'active' ? (
          <ActiveSync
            email={view.email}
            membership={view.membership}
            busy={busy}
            onSync={() =>
              run(async () => {
                const outcome = await runSync()
                if (outcome.kind === 'error') setError(outcome.message)
                else if (outcome.kind === 'success')
                  setNotice(
                    `Synchronisiert: ${outcome.result.pushed} gesendet, ${outcome.result.pulled} empfangen.`,
                  )
                else setError('Synchronisierung nicht möglich - bitte erneut anmelden.')
              })
            }
            onSignOut={() =>
              run(async () => {
                await signOut()
                saveHouseholdMembership(undefined)
                await refresh()
              })
            }
          />
        ) : null}
      </div>

      {notice ? (
        <p className="mt-3 text-sm text-green-700" role="status">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

function ServerSetup({ busy, onSaved }: { busy: boolean; onSaved: () => void }) {
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [invalid, setInvalid] = useState(false)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!/^https:\/\/\S+$/.test(url.trim()) || anonKey.trim().length < 20) {
      setInvalid(true)
      return
    }
    saveSyncServerConfig({ url, anonKey })
    resetSupabaseClient()
    onSaved()
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <p className="text-sm text-neutral-700">
        Trage die Daten deines Supabase-Projekts ein (Dashboard → Project Settings → API).
      </p>
      <TextField
        id="sync-url"
        label="Project URL"
        type="url"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="https://xyz.supabase.co"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      <TextField
        id="sync-key"
        label="Anon- bzw. Publishable-Key"
        autoCapitalize="off"
        autoCorrect="off"
        value={anonKey}
        onChange={(event) => setAnonKey(event.target.value)}
      />
      {invalid ? (
        <p className="text-sm text-red-600" role="alert">
          Bitte eine https-Adresse und den vollständigen Schlüssel eintragen.
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={`${PRIMARY} self-start`}>
        Server speichern
      </button>
    </form>
  )
}

function LoginForm({
  view,
  busy,
  onRequest,
  onVerify,
  onBack,
  onChangeServer,
}: {
  view: Extract<View, { kind: 'login' }>
  busy: boolean
  onRequest: (email: string) => void
  onVerify: (code: string) => void
  onBack: () => void
  onChangeServer: () => void
}) {
  const [email, setEmail] = useState(view.email)
  const [code, setCode] = useState('')

  if (view.step === 'code') {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          onVerify(code)
        }}
      >
        <p className="text-sm text-neutral-700">
          Wir haben einen Code an <span className="font-medium">{view.email}</span> geschickt. Gib ihn hier ein.
        </p>
        <TextField
          id="sync-code"
          label="Code aus der E-Mail"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={busy || code.trim().length < 6} className={PRIMARY}>
            Anmelden
          </button>
          <button type="button" onClick={onBack} disabled={busy} className={SECONDARY}>
            Andere E-Mail
          </button>
        </div>
      </form>
    )
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        onRequest(email)
      }}
    >
      <p className="text-sm text-neutral-700">Melde dich mit deiner E-Mail-Adresse an. Du bekommst einen Code.</p>
      <TextField
        id="sync-email"
        label="E-Mail-Adresse"
        type="email"
        autoComplete="email"
        autoCapitalize="off"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy || !email.includes('@')} className={PRIMARY}>
          Code senden
        </button>
        <button type="button" onClick={onChangeServer} disabled={busy} className={SECONDARY}>
          Server ändern
        </button>
      </div>
    </form>
  )
}

function HouseholdChooser({
  households,
  busy,
  onCreate,
  onConnect,
  onJoin,
  onSignOut,
}: {
  households: HouseholdSummary[]
  busy: boolean
  onCreate: (name: string) => void
  onConnect: (household: HouseholdSummary) => void
  onJoin: (code: string) => void
  onSignOut: () => void
}) {
  const [name, setName] = useState('Mein Haushalt')
  const [code, setCode] = useState('')

  return (
    <div className="flex flex-col gap-4">
      {households.length > 0 ? (
        <div>
          <h3 className="text-sm font-semibold text-neutral-900">Deine Haushalte</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {households.map((household) => (
              <li key={household.id} className="flex items-center justify-between gap-3">
                <span className="text-sm text-neutral-700">{household.name}</span>
                <button type="button" disabled={busy} onClick={() => onConnect(household)} className={SECONDARY}>
                  Verbinden
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          onCreate(name)
        }}
      >
        <h3 className="text-sm font-semibold text-neutral-900">Neuen Haushalt anlegen</h3>
        <TextField id="sync-household-name" label="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <button type="submit" disabled={busy || !name.trim()} className={`${PRIMARY} self-start`}>
          Haushalt anlegen
        </button>
      </form>

      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          onJoin(code)
        }}
      >
        <h3 className="text-sm font-semibold text-neutral-900">Mit Einladungscode beitreten</h3>
        <TextField
          id="sync-invite"
          label="Einladungscode"
          autoCapitalize="characters"
          autoCorrect="off"
          placeholder="ABCD-1234"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <button type="submit" disabled={busy || code.trim().length < 8} className={`${SECONDARY} self-start`}>
          Beitreten
        </button>
      </form>

      <button type="button" onClick={onSignOut} disabled={busy} className={`${SECONDARY} self-start`}>
        Abmelden
      </button>
    </div>
  )
}

function ConfirmLocalData({
  pending,
  busy,
  onBackup,
  onCancel,
  onConfirm,
}: {
  pending: Pending
  busy: boolean
  onBackup: () => void
  onCancel: () => void
  onConfirm: (mode: 'merge' | 'replace') => void
}) {
  let body: ReactNode
  if (pending.kind === 'create') {
    body = (
      <p className="text-sm text-neutral-800">
        Auf diesem Gerät sind {pending.localCount} Einträge gespeichert. Sie werden dem neuen Haushalt „{pending.name}“
        zugeordnet und hochgeladen.
      </p>
    )
  } else {
    body = (
      <>
        <p className="text-sm text-neutral-800">
          Auf diesem Gerät sind {pending.localCount} Einträge gespeichert. Wie sollen sie mit dem Haushalt „
          {pending.household.name}“ verbunden werden?
        </p>
        <ul className="mt-2 list-disc pl-5 text-sm text-neutral-700">
          <li>
            <span className="font-medium">Zusammenführen:</span> deine Einträge kommen zu den Daten des Haushalts dazu.
          </li>
          <li>
            <span className="font-medium">Ersetzen:</span> deine Einträge werden auf diesem Gerät gelöscht, danach wird
            der Haushalt geladen.
          </li>
        </ul>
      </>
    )
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      {body}
      <p className="mt-2 text-xs text-neutral-600">Wir empfehlen, vorher ein Backup herunterzuladen.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onBackup} disabled={busy} className={SECONDARY}>
          Backup herunterladen
        </button>
        {pending.kind === 'create' ? (
          <button type="button" onClick={() => onConfirm('merge')} disabled={busy} className={PRIMARY}>
            Übernehmen
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onConfirm('merge')} disabled={busy} className={PRIMARY}>
              Zusammenführen
            </button>
            <button type="button" onClick={() => onConfirm('replace')} disabled={busy} className={SECONDARY}>
              Ersetzen
            </button>
          </>
        )}
        <button type="button" onClick={onCancel} disabled={busy} className={SECONDARY}>
          Abbrechen
        </button>
      </div>
    </div>
  )
}

function ActiveSync({
  email,
  membership,
  busy,
  onSync,
  onSignOut,
}: {
  email: string
  membership: HouseholdMembership
  busy: boolean
  onSync: () => void
  onSignOut: () => void
}) {
  const [invite, setInvite] = useState<string>()
  const [inviteError, setInviteError] = useState<string>()
  const [conflicts, setConflicts] = useState(getConflictLog)
  const [showConflicts, setShowConflicts] = useState(false)
  const status = getSyncStatus()

  async function handleInvite() {
    setInviteError(undefined)
    try {
      setInvite(await createInviteCode(membership.householdId))
    } catch (caught) {
      setInviteError(describeSyncError(caught))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-neutral-500">Haushalt</dt>
        <dd className="text-neutral-900">{membership.householdName}</dd>
        <dt className="text-neutral-500">Angemeldet als</dt>
        <dd className="break-all text-neutral-900">{email}</dd>
        <dt className="text-neutral-500">Zuletzt</dt>
        <dd className="text-neutral-900">{status.lastSyncAt ? formatDateTime(status.lastSyncAt) : 'noch nie'}</dd>
      </dl>

      <button type="button" onClick={onSync} disabled={busy} className={`${PRIMARY} self-start`}>
        {busy ? 'Synchronisiert …' : 'Jetzt synchronisieren'}
      </button>

      <div>
        <h3 className="text-sm font-semibold text-neutral-900">Person einladen</h3>
        <p className="mt-1 text-xs text-neutral-500">
          Die eingeladene Person meldet sich mit ihrer eigenen E-Mail an und gibt den Code ein. Er ist 7 Tage gültig und
          einmal verwendbar.
        </p>
        {invite ? (
          <p className="mt-2 font-mono text-lg tracking-widest text-neutral-900" aria-label="Einladungscode">
            {invite}
          </p>
        ) : (
          <button type="button" onClick={handleInvite} disabled={busy} className={`${SECONDARY} mt-2`}>
            Einladungscode erstellen
          </button>
        )}
        {inviteError ? (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {inviteError}
          </p>
        ) : null}
      </div>

      {conflicts.length > 0 ? (
        <div>
          <button
            type="button"
            onClick={() => setShowConflicts((value) => !value)}
            className="text-sm font-medium text-accent"
          >
            {conflicts.length} automatisch gelöste Konflikte {showConflicts ? 'ausblenden' : 'anzeigen'}
          </button>
          {showConflicts ? (
            <div className="mt-2">
              <ul className="flex flex-col gap-1 text-xs text-neutral-600">
                {conflicts.map((entry) => (
                  <li key={`${entry.entityType}:${entry.id}:${entry.resolvedAt}`}>{describeConflict(entry)}</li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  clearConflictLog()
                  setConflicts([])
                }}
                className={`${SECONDARY} mt-2`}
              >
                Protokoll leeren
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <button type="button" onClick={onSignOut} disabled={busy} className={`${SECONDARY} self-start`}>
        Abmelden &amp; Gerät trennen
      </button>
    </div>
  )
}
