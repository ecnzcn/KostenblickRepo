import { readFileSync } from 'node:fs'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '../../components/feedback/ToastProvider'
import { ROUTES, contractDetailPath, transactionDetailPath } from '../../constants/navigation'
import { deleteDatabase } from '../../database/database'
import { transactionRepository } from '../../domain/repositories/financeRepositories'
import { commitImport, prepareImport } from '../../domain/usecases/bankImport/importTransactions'
import { createContract, type ContractInput } from '../../domain/usecases/contracts'
import { linkContract } from '../../domain/usecases/fixedCosts/contractLinks'
import { formatCurrency } from '../../utils/formatters'
import { TransactionDetailPage } from '../transactions/TransactionDetailPage'
import { ContractDetailPage } from './ContractDetailPage'
import { ContractsPage } from './ContractsPage'
import { FixedCostsPage } from './FixedCostsPage'

// jsdom gives import.meta.url a web URL; vitest runs from the repo root.
async function importGiro(): Promise<void> {
  const name = 'sparkasse-giro-camt-v2-sample.csv'
  const result = await prepareImport(new File([readFileSync(`src/test/fixtures/sparkasse/${name}`)], name))
  if (!result.ok) throw new Error(result.error)
  await commitImport(result.preview)
}

function renderAt(path: string) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={ROUTES.contracts} element={<ContractsPage />} />
          <Route path={ROUTES.fixedCosts} element={<FixedCostsPage />} />
          <Route path={ROUTES.contractDetailPattern} element={<ContractDetailPage />} />
          <Route path={ROUTES.transactionDetailPattern} element={<TransactionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  )
}

/** Testing Library normalizes the no-break space of formatted amounts. */
function eur(amount: number): string {
  return formatCurrency(amount).replace(/\s/g, ' ')
}

const POWER: ContractInput = {
  categoryId: 'electricity',
  provider: 'Stadtwerke',
  monthlyCost: 85.33,
  startDate: '2025-01-01',
  autoRenewal: true,
  reminderEnabled: false,
}

const PHONE: ContractInput = { ...POWER, provider: 'Telekom', categoryId: 'telecom', monthlyCost: 13.99 }

beforeEach(async () => {
  await deleteDatabase()
})

describe('contract detail: Abbuchungen', () => {
  it('points to the import while no bookings exist', async () => {
    const contract = await createContract(POWER)
    renderAt(contractDetailPath(contract.id))
    expect(await screen.findByRole('link', { name: 'Sparkassen-CSV importieren' })).toHaveAttribute('href', ROUTES.transactionsImport)
  })

  it('links a suggested debit on confirmation and unlinks it again', async () => {
    await importGiro()
    const contract = await createContract(POWER)
    renderAt(contractDetailPath(contract.id))

    expect(await screen.findByText('Passt eine dieser Abbuchungen?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Stadtwerke Muster GmbH zuordnen' }))
    expect(await screen.findByText('Verknüpft über: Mandatsreferenz ist „MANDAT-0002“')).toBeInTheDocument()
    expect(screen.getByText(/Unregelmäßige Abbuchungen/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Verknüpfung aufheben' }))
    fireEvent.click(screen.getByRole('button', { name: 'Aufheben' }))
    expect(await screen.findByText('Noch keine Buchung mit diesem Vertrag verknüpft.')).toBeInTheDocument()
    expect((await transactionRepository.getAll()).some((entry) => entry.contractId)).toBe(false)
  })

  it('names a deviation from the contract value', async () => {
    await importGiro()
    const contract = await createContract(PHONE)
    await linkContract(contract.id, { field: 'mandateReference', matchType: 'equals', pattern: 'MANDAT-0007' })
    renderAt(contractDetailPath(contract.id))

    const months = await screen.findByRole('list', { name: 'Abbuchungen je Monat' })
    expect(within(months).getByText(`erwartet ${eur(13.99)}, abgebucht ${eur(14.47)}`)).toBeInTheDocument()
    expect(screen.getByText('1 Abbuchung weicht vom Vertragswert ab')).toBeInTheDocument()
    expect(screen.getByText('Der Vertragswert ist ein Soll – er zählt nie zu den Ausgaben.')).toBeInTheDocument()
  })
})

describe('fixed costs page', () => {
  it('compares Soll and Ist for the newest fully imported month and switches months', async () => {
    await importGiro()
    const phone = await createContract({ ...PHONE, monthlyCost: 14.47 })
    await createContract(POWER)
    await linkContract(phone.id, { field: 'mandateReference', matchType: 'equals', pattern: 'MANDAT-0007' })
    renderAt(ROUTES.fixedCosts)

    const month = await screen.findByLabelText('Monat')
    expect(month).toHaveDisplayValue('August 2026')
    expect(screen.getByText('Soll (Verträge)').nextSibling).toHaveTextContent(eur(99.8))
    expect(screen.getByText('Ist (abgebucht)').nextSibling).toHaveTextContent(eur(0))
    expect(screen.getByText('Keine Buchung verknüpft')).toBeInTheDocument()
    // The phone debit starts in September - nothing is claimed for August.
    expect(screen.getByText('Keine Abbuchung in diesem Monat')).toBeInTheDocument()
    expect(screen.getByText(/1 Vertrag hat noch keine verknüpfte Buchung/)).toBeInTheDocument()

    fireEvent.change(month, { target: { value: '2026-09' } })
    expect(await screen.findByText('Wie vereinbart')).toBeInTheDocument()
    expect(screen.getByText('Ist (abgebucht)').nextSibling).toHaveTextContent(eur(14.47))
    expect(screen.getByText(/noch nicht vollständig importiert/)).toBeInTheDocument()
  })

  it('has an empty state without contracts and is linked from the contract list', async () => {
    renderAt(ROUTES.fixedCosts)
    expect(await screen.findByText(/Keine aktiven Verträge im/)).toBeInTheDocument()

    await createContract(POWER)
    renderAt(ROUTES.contracts)
    expect(await screen.findByRole('link', { name: /Fixkosten/ })).toHaveAttribute('href', ROUTES.fixedCosts)
  })
})

describe('booking detail: Vertrag', () => {
  it('links a booking to a contract and then shows the contract', async () => {
    await importGiro()
    const contract = await createContract(PHONE)
    const [booking] = (await transactionRepository.getAll()).filter((entry) => entry.mandateReference === 'MANDAT-0007')
    renderAt(transactionDetailPath(booking?.id ?? ''))

    fireEvent.change(await screen.findByLabelText('Vertrag zuordnen'), { target: { value: contract.id } })
    expect(screen.getByText(/Auch andere und künftige Buchungen mit Mandatsreferenz ist „MANDAT-0007“/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Zuordnen' }))

    expect(await screen.findByRole('link', { name: 'Telekom' })).toHaveAttribute('href', contractDetailPath(contract.id))
    expect(await transactionRepository.getById(booking?.id ?? '')).toMatchObject({ contractId: contract.id, categoryId: 'telecom' })
  })
})
