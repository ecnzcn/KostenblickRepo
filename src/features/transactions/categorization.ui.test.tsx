import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ROUTES, transactionDetailPath } from '../../constants/navigation'
import { deleteDatabase } from '../../database/database'
import type { Transaction } from '../../domain/models/entities'
import { categoryRuleRepository, transactionRepository } from '../../domain/repositories/financeRepositories'
import { commitImport, prepareImport } from '../../domain/usecases/bankImport/importTransactions'
import { createRule } from '../../domain/usecases/categorization/transactionCategorization'
import { SettingsPage } from '../settings/SettingsPage'
import { CategoryRulesPage } from './CategoryRulesPage'
import { TransactionDetailPage } from './TransactionDetailPage'
import { TransactionsPage } from './TransactionsPage'

// jsdom gives import.meta.url a web URL; vitest runs from the repo root.
async function importFixture(name: string): Promise<void> {
  const file = new File([readFileSync(`src/test/fixtures/sparkasse/${name}`)], name)
  const result = await prepareImport(file)
  if (!result.ok) throw new Error(result.error)
  await commitImport(result.preview)
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={ROUTES.transactions} element={<TransactionsPage />} />
        <Route path={ROUTES.transactionDetailPattern} element={<TransactionDetailPage />} />
        <Route path={ROUTES.categoryRules} element={<CategoryRulesPage />} />
        <Route path={ROUTES.settings} element={<SettingsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function bookingsOf(counterpartyName: string): Promise<Transaction[]> {
  return (await transactionRepository.getAll()).filter((entry) => entry.counterpartyName === counterpartyName)
}

beforeEach(async () => {
  localStorage.clear()
  await deleteDatabase()
})

describe('uncategorized bookings', () => {
  it('lists them on the Buchungen page and links to the detail', async () => {
    await importFixture('sparkasse-giro-edgecases.csv')
    renderAt(ROUTES.transactions)
    expect(await screen.findByText('Ohne Kategorie')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Gegenpartei Ölmühle/ })).toBeInTheDocument()
  })
})

describe('booking detail', () => {
  it('assigns a category by hand and offers "Immer so zuordnen?"', async () => {
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    const [booking, ...others] = (await bookingsOf('Gegenpartei 005')).filter((entry) => entry.amount < 0)
    renderAt(transactionDetailPath(booking?.id ?? ''))

    fireEvent.change(await screen.findByLabelText('Zuordnung'), { target: { value: 'category:clothing' } })
    expect(await screen.findByText('Immer so zuordnen?')).toBeInTheDocument()
    expect(await screen.findByText(/Auch auf \d+ passende bestehende Buchung/)).toBeInTheDocument()
    expect(await screen.findByText('Zuordnung von dir zugeordnet.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Regel anlegen' }))
    expect(await screen.findByText(/Regel gespeichert/)).toBeInTheDocument()
    expect(await categoryRuleRepository.getAll()).toHaveLength(1)

    const after = await bookingsOf('Gegenpartei 005')
    expect(after.find((entry) => entry.id === booking?.id)).toMatchObject({ categoryId: 'clothing', categorySource: 'manual' })
    expect(others.length).toBeGreaterThan(0)
    expect(after.filter((entry) => entry.amount < 0).every((entry) => entry.categoryId === 'clothing')).toBe(true)
  })

  it('"Nur diese Buchung" saves no rule', async () => {
    await importFixture('sparkasse-giro-edgecases.csv')
    const [booking] = await bookingsOf('Gegenpartei Ölmühle')
    renderAt(transactionDetailPath(booking?.id ?? ''))

    fireEvent.change(await screen.findByLabelText('Zuordnung'), { target: { value: 'category:other_income' } })
    fireEvent.click(await screen.findByRole('button', { name: 'Nur diese Buchung' }))
    await waitFor(() => expect(screen.queryByText('Immer so zuordnen?')).not.toBeInTheDocument())
    expect(await categoryRuleRepository.getAll()).toEqual([])
    expect(await transactionRepository.getById(booking?.id ?? '')).toMatchObject({ categoryId: 'other_income', flowType: 'income' })
  })

  it('shows the paired card statement', async () => {
    await importFixture('sparkasse-giro-camt-v2-sample.csv')
    await importFixture('sparkasse-kreditkarte-sample.csv')
    const [settlement] = (await transactionRepository.getAll()).filter((entry) => entry.amount === -2232.77)
    renderAt(transactionDetailPath(settlement?.id ?? ''))
    expect(await screen.findByText(/Verknüpft mit/)).toHaveTextContent('der Lastschrift der Kreditkarte vom 14.09.2026')
    expect(screen.getByText(/Umbuchung – zählt weder als Einnahme noch als Ausgabe/)).toBeInTheDocument()
  })

  it('says when a booking does not exist', async () => {
    renderAt(transactionDetailPath('missing'))
    expect(await screen.findByText('Buchung nicht gefunden')).toBeInTheDocument()
  })
})

describe('rules page', () => {
  it('explains how rules come about when there are none', async () => {
    renderAt(ROUTES.categoryRules)
    expect(await screen.findByText('Noch keine eigenen Regeln')).toBeInTheDocument()
  })

  it('lists and deletes a rule after confirmation', async () => {
    await createRule({ field: 'counterpartyName', matchType: 'contains', pattern: 'Rewe', choice: { kind: 'category', categoryId: 'groceries' }, applyToExisting: false })
    renderAt(ROUTES.categoryRules)
    expect(await screen.findByText('Name der Gegenpartei enthält „Rewe“')).toBeInTheDocument()
    expect(screen.getByText('→ Lebensmittel')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Regel löschen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
    expect(await screen.findByText('Noch keine eigenen Regeln')).toBeInTheDocument()
  })

  it('is linked from Mehr', () => {
    renderAt(ROUTES.settings)
    expect(screen.getByRole('link', { name: 'Kategorieregeln' })).toHaveAttribute('href', ROUTES.categoryRules)
  })
})
