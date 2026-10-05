import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ROUTES } from '../../constants/navigation'
import { deleteDatabase } from '../../database/database'
import { transactionRepository } from '../../domain/repositories/financeRepositories'
import { SettingsPage } from '../settings/SettingsPage'
import { ImportTransactionsPage } from './import/ImportTransactionsPage'
import { TransactionsPage } from './TransactionsPage'

// jsdom gives import.meta.url a web URL; vitest runs from the repo root.
function fixtureFile(name: string): File {
  const bytes = readFileSync(`src/test/fixtures/sparkasse/${name}`)
  return new File([bytes], name, { type: 'text/csv' })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={ROUTES.transactions} element={<TransactionsPage />} />
        <Route path={ROUTES.transactionsImport} element={<ImportTransactionsPage />} />
        <Route path={ROUTES.settings} element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

function selectFile(file: File) {
  const input = screen.getByLabelText(/CSV-Datei auswählen/) as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

async function importEdgeCases() {
  renderAt(ROUTES.transactionsImport)
  selectFile(fixtureFile('sparkasse-giro-edgecases.csv'))
  fireEvent.click(await screen.findByRole('button', { name: '7 Buchungen speichern' }))
  await screen.findByText('7 Buchungen importiert')
}

beforeEach(async () => {
  localStorage.clear()
  await deleteDatabase()
})

describe('Buchungen page', () => {
  it('explains the import when there are no bookings yet', async () => {
    renderAt(ROUTES.transactions)
    expect(await screen.findByText('Noch keine Buchungen')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sparkassen-CSV importieren' })).toHaveAttribute('href', ROUTES.transactionsImport)
  })
})

describe('CSV import', () => {
  it('shows a preview and stores nothing before saving', async () => {
    renderAt(ROUTES.transactionsImport)
    selectFile(fixtureFile('sparkasse-giro-edgecases.csv'))

    expect(await screen.findByText('Vorschau')).toBeInTheDocument()
    expect(screen.getByLabelText('Neues Konto')).toHaveValue('Girokonto ••0001')
    const summary = screen.getByText('Neue Buchungen').closest('dl') as HTMLElement
    expect(within(summary).getByText('Vorgemerkt (übersprungen)').nextSibling).toHaveTextContent('1')
    expect(within(summary).getByText('Einnahmen').nextSibling).toHaveTextContent('1.234,56')
    expect(within(summary).getByText('Ausgaben').nextSibling).toHaveTextContent('726,52')
    expect(await transactionRepository.getAll()).toEqual([])
  })

  it('saves the bookings and offers a backup', async () => {
    await importEdgeCases()
    expect(await transactionRepository.getAll()).toHaveLength(7)
    expect(screen.getByText('Backup erstellen?')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Später' }))
    expect(screen.queryByText('Backup erstellen?')).not.toBeInTheDocument()
  })

  it('lets a second file be imported right away (giro, then card)', async () => {
    await importEdgeCases()
    fireEvent.click(screen.getByRole('button', { name: 'Weitere Datei importieren' }))
    expect(screen.getByLabelText(/CSV-Datei auswählen/)).toBeInTheDocument()
  })

  it('cancelling the preview leaves nothing behind', async () => {
    renderAt(ROUTES.transactionsImport)
    selectFile(fixtureFile('sparkasse-giro-edgecases.csv'))
    fireEvent.click(await screen.findByRole('button', { name: 'Abbrechen' }))

    expect(await screen.findByText('Noch keine Buchungen')).toBeInTheDocument()
    expect(await transactionRepository.getAll()).toEqual([])
  })

  it('refuses a file without a required column', async () => {
    renderAt(ROUTES.transactionsImport)
    selectFile(fixtureFile('sparkasse-giro-fehlende-pflichtspalte.csv'))
    expect(await screen.findByRole('alert')).toHaveTextContent('In der Datei fehlt die Pflichtspalte „Betrag“.')
  })

  it('says so when every booking was imported before', async () => {
    await importEdgeCases()
    renderAt(ROUTES.transactionsImport)
    selectFile(fixtureFile('sparkasse-giro-edgecases.csv'))
    expect(await screen.findByText('Alle Buchungen dieser Datei sind bereits importiert.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /speichern/ })).not.toBeInTheDocument()
  })
})

describe('undo an import', () => {
  it('deletes the import after confirmation', async () => {
    await importEdgeCases()
    renderAt(ROUTES.transactions)

    fireEvent.click(await screen.findByRole('button', { name: 'Import rückgängig machen' }))
    expect(screen.getByText(/Die 7 Buchungen dieses Imports werden gelöscht/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import löschen' }))

    expect(await screen.findByText('Noch keine Buchungen')).toBeInTheDocument()
    expect(await transactionRepository.getAll()).toEqual([])
  })
})

describe('Mehr', () => {
  it('links "Abrechnungen" now that it left the bottom navigation', () => {
    renderAt(ROUTES.settings)
    expect(screen.getByRole('link', { name: 'Abrechnungen' })).toHaveAttribute('href', ROUTES.bills)
  })

  it('reminds to back up bookings imported after the last backup', async () => {
    renderAt(ROUTES.settings)
    expect(await screen.findByTestId('backup-reminder')).toHaveTextContent('Auf diesem Gerät wurde noch kein Backup erstellt.')
  })

  it('names imported bookings that have no backup yet', async () => {
    await importEdgeCases()
    renderAt(ROUTES.settings)
    await waitFor(() => expect(screen.getAllByTestId('backup-reminder').at(-1)).toHaveTextContent('Seitdem wurden Buchungen importiert'))
  })
})
