import { render, screen, waitFor } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { StatisticsSummaryCard } from './StatisticsSummaryCard'
import { deleteDatabase } from '../../../database/database'
import { billRepository } from '../../../domain/repositories/indexedDbRepositories'
import type { Bill } from '../../../domain/models/entities'

const bill = (overrides: Partial<Bill> = {}): Bill => ({
  id: 'b1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  deletedAt: null,
  syncVersion: 1,
  userId: 'u1',
  type: 'annual_statement',
  year: new Date().getFullYear(),
  totalAmount: 0,
  advancePayments: 0,
  balance: 0,
  balanceType: 'none',
  ocrStatus: 'not_started',
  ...overrides,
})

function renderCard() {
  return render(
    <HashRouter>
      <StatisticsSummaryCard />
    </HashRouter>,
  )
}

describe('StatisticsSummaryCard', () => {
  beforeEach(async () => {
    await deleteDatabase()
  })

  it('renders nothing when there are no bills at all (no duplicate empty-state clutter)', async () => {
    const { container } = renderCard()
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it('links to the Statistics page and shows the current year total once bills exist', async () => {
    await billRepository.save(bill({ totalAmount: 3842 }))
    renderCard()

    await waitFor(() => expect(screen.getByRole('link')).toHaveAttribute('href', '#/statistik'))
    expect(screen.getByText('Noch kein Vorjahresvergleich')).toBeInTheDocument()
  })
})
