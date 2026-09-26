import { describe, expect, it } from 'vitest'
import type { Category, Contract } from '../../domain/models/entities'
import {
  DEFAULT_CONTRACT_FILTERS,
  filterAndSortContracts,
  getContractCategoryIds,
  type ContractFilterOptions,
} from './contractFilters'

const NOW = new Date('2026-09-26T12:00:00.000Z')

let counter = 0
function contract(overrides: Partial<Contract> = {}): Contract {
  counter += 1
  return {
    id: overrides.id ?? `c${counter}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    syncVersion: 1,
    userId: 'local-user',
    categoryId: 'internet',
    provider: 'Telekom',
    monthlyCost: 40,
    startDate: '2025-01-01T00:00:00.000Z',
    autoRenewal: true,
    reminderEnabled: true,
    ...overrides,
  }
}

function category(id: string, name: string): Category {
  return { id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', name, icon: '📄', type: 'contract' }
}

const categoriesById = new Map<string, Category>([
  ['internet', category('internet', 'Internet')],
  ['electricity', category('electricity', 'Strom')],
])

function apply(contracts: Contract[], options: Partial<ContractFilterOptions> = {}): Contract[] {
  return filterAndSortContracts(contracts, categoriesById, { ...DEFAULT_CONTRACT_FILTERS, ...options }, NOW)
}

describe('filterAndSortContracts - search', () => {
  it('shows all contracts for an empty search text', () => {
    const contracts = [contract({ provider: 'Telekom' }), contract({ provider: 'Vodafone' })]
    expect(apply(contracts)).toHaveLength(2)
  })

  it('matches a partial, case-insensitive substring of the provider', () => {
    const contracts = [contract({ provider: 'Telekom' }), contract({ provider: 'Vodafone' })]
    expect(apply(contracts, { search: 'tele' }).map((c) => c.provider)).toEqual(['Telekom'])
    expect(apply(contracts, { search: 'TELE' }).map((c) => c.provider)).toEqual(['Telekom'])
  })

  it('matches the tariff field', () => {
    const contracts = [contract({ provider: 'Telekom', tariff: 'MagentaZuhause XL' }), contract({ provider: 'Vodafone' })]
    expect(apply(contracts, { search: 'magenta' }).map((c) => c.provider)).toEqual(['Telekom'])
  })

  it('matches the category name', () => {
    const contracts = [
      contract({ provider: 'Telekom', categoryId: 'internet' }),
      contract({ provider: 'EnBW', categoryId: 'electricity' }),
    ]
    expect(apply(contracts, { search: 'strom' }).map((c) => c.provider)).toEqual(['EnBW'])
  })

  it('returns nothing for a search with no match', () => {
    const contracts = [contract({ provider: 'Telekom' })]
    expect(apply(contracts, { search: 'does-not-exist' })).toHaveLength(0)
  })

  it('trims whitespace-only search to "no filter"', () => {
    const contracts = [contract({ provider: 'Telekom' })]
    expect(apply(contracts, { search: '   ' })).toHaveLength(1)
  })
})

describe('filterAndSortContracts - status filter', () => {
  it('"all" includes both active and inactive contracts', () => {
    const active = contract({ startDate: '2020-01-01T00:00:00.000Z' })
    const ended = contract({ startDate: '2020-01-01T00:00:00.000Z', endDate: '2021-01-01T00:00:00.000Z' })
    expect(apply([active, ended], { statusFilter: 'all' })).toHaveLength(2)
  })

  it('"active" uses the existing isContractActive() definition, not a second one', () => {
    const active = contract({ id: 'active', startDate: '2020-01-01T00:00:00.000Z' })
    const ended = contract({ id: 'ended', startDate: '2020-01-01T00:00:00.000Z', endDate: '2021-01-01T00:00:00.000Z' })
    const future = contract({ id: 'future', startDate: '2099-01-01T00:00:00.000Z' })
    const result = apply([active, ended, future], { statusFilter: 'active' })
    expect(result.map((c) => c.id)).toEqual(['active'])
  })

  it('"inactive" returns ended and not-yet-started contracts', () => {
    const active = contract({ id: 'active', startDate: '2020-01-01T00:00:00.000Z' })
    const ended = contract({ id: 'ended', startDate: '2020-01-01T00:00:00.000Z', endDate: '2021-01-01T00:00:00.000Z' })
    const future = contract({ id: 'future', startDate: '2099-01-01T00:00:00.000Z' })
    const result = apply([active, ended, future], { statusFilter: 'inactive' })
    expect(result.map((c) => c.id).sort()).toEqual(['ended', 'future'])
  })
})

describe('filterAndSortContracts - category filter', () => {
  it('"all" includes every category', () => {
    const contracts = [contract({ categoryId: 'internet' }), contract({ categoryId: 'electricity' })]
    expect(apply(contracts, { categoryFilter: 'all' })).toHaveLength(2)
  })

  it('a specific category id only returns matching contracts', () => {
    const internet = contract({ id: 'i1', categoryId: 'internet' })
    const electricity = contract({ id: 'e1', categoryId: 'electricity' })
    const result = apply([internet, electricity], { categoryFilter: 'electricity' })
    expect(result.map((c) => c.id)).toEqual(['e1'])
  })
})

describe('filterAndSortContracts - reminder filter', () => {
  it('"enabled" only returns contracts with reminderEnabled: true', () => {
    const on = contract({ id: 'on', reminderEnabled: true })
    const off = contract({ id: 'off', reminderEnabled: false })
    expect(apply([on, off], { reminderFilter: 'enabled' }).map((c) => c.id)).toEqual(['on'])
  })

  it('"disabled" only returns contracts with reminderEnabled: false', () => {
    const on = contract({ id: 'on', reminderEnabled: true })
    const off = contract({ id: 'off', reminderEnabled: false })
    expect(apply([on, off], { reminderFilter: 'disabled' }).map((c) => c.id)).toEqual(['off'])
  })

  it('resetting to the defaults clears every filter and the search text', () => {
    const on = contract({ id: 'on', reminderEnabled: true, provider: 'Telekom' })
    const off = contract({ id: 'off', reminderEnabled: false, provider: 'Vodafone' })
    const narrowed = apply([on, off], { reminderFilter: 'enabled', search: 'telekom' })
    expect(narrowed).toHaveLength(1)
    expect(apply([on, off], DEFAULT_CONTRACT_FILTERS)).toHaveLength(2)
  })
})

describe('filterAndSortContracts - sorting', () => {
  it('provider_asc / provider_desc sort alphabetically', () => {
    const a = contract({ id: 'a', provider: 'Alpha' })
    const b = contract({ id: 'b', provider: 'Beta' })
    expect(apply([b, a], { sort: 'provider_asc' }).map((c) => c.id)).toEqual(['a', 'b'])
    expect(apply([a, b], { sort: 'provider_desc' }).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('provider sort breaks ties deterministically for equal provider names', () => {
    const a = contract({ id: 'a', provider: 'Telekom', createdAt: '2026-01-01T00:00:00.000Z' })
    const b = contract({ id: 'b', provider: 'Telekom', createdAt: '2026-02-01T00:00:00.000Z' })
    // Newest createdAt first, per the shared tiebreak() convention.
    expect(apply([a, b], { sort: 'provider_asc' }).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('monthly_cost_desc / monthly_cost_asc sort numerically, not as formatted strings', () => {
    const cheap = contract({ id: 'cheap', monthlyCost: 9 })
    const expensive = contract({ id: 'expensive', monthlyCost: 100 })
    // A naive string sort would put "100" before "9".
    expect(apply([cheap, expensive], { sort: 'monthly_cost_asc' }).map((c) => c.id)).toEqual(['cheap', 'expensive'])
    expect(apply([cheap, expensive], { sort: 'monthly_cost_desc' }).map((c) => c.id)).toEqual(['expensive', 'cheap'])
  })

  it('monthly_cost sort breaks ties deterministically for equal amounts', () => {
    const a = contract({ id: 'a', monthlyCost: 40, createdAt: '2026-01-01T00:00:00.000Z' })
    const b = contract({ id: 'b', monthlyCost: 40, createdAt: '2026-02-01T00:00:00.000Z' })
    expect(apply([a, b], { sort: 'monthly_cost_asc' }).map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('start_date_desc / start_date_asc sort by the actual date value, not a formatted string', () => {
    // '2025-02-01' sorts before '2025-10-01' as a date, but after it as a
    // naive "day/month/year"-formatted string comparison would.
    const feb = contract({ id: 'feb', startDate: '2025-02-01T00:00:00.000Z' })
    const oct = contract({ id: 'oct', startDate: '2025-10-01T00:00:00.000Z' })
    expect(apply([oct, feb], { sort: 'start_date_asc' }).map((c) => c.id)).toEqual(['feb', 'oct'])
    expect(apply([feb, oct], { sort: 'start_date_desc' }).map((c) => c.id)).toEqual(['oct', 'feb'])
  })

  it('upcoming_deadline (the default) matches the pre-existing behavior: soonest relevant deadline first, then providerless/expired ones alphabetically', () => {
    const soon = contract({ id: 'soon', provider: 'Zeta', calculatedCancellationDate: '2026-10-01T00:00:00.000Z' })
    const later = contract({ id: 'later', provider: 'Alpha', calculatedCancellationDate: '2026-12-01T00:00:00.000Z' })
    const expired = contract({ id: 'expired', provider: 'Beta', calculatedCancellationDate: '2020-01-01T00:00:00.000Z' })
    const none = contract({ id: 'none', provider: 'Gamma' })

    const result = apply([none, expired, later, soon], { sort: 'upcoming_deadline' })
    expect(result.map((c) => c.id)).toEqual(['soon', 'later', 'expired', 'none'])
  })

  it('default filters use upcoming_deadline without it being set explicitly', () => {
    expect(DEFAULT_CONTRACT_FILTERS.sort).toBe('upcoming_deadline')
  })
})

describe('filterAndSortContracts - combinations', () => {
  it('search + status filter combine', () => {
    const activeMatch = contract({ id: 'am', provider: 'Telekom Mobil', startDate: '2020-01-01T00:00:00.000Z' })
    const inactiveMatch = contract({
      id: 'im',
      provider: 'Telekom DSL',
      startDate: '2020-01-01T00:00:00.000Z',
      endDate: '2021-01-01T00:00:00.000Z',
    })
    const activeNonMatch = contract({ id: 'an', provider: 'Vodafone', startDate: '2020-01-01T00:00:00.000Z' })

    const result = apply([activeMatch, inactiveMatch, activeNonMatch], { search: 'telekom', statusFilter: 'active' })
    expect(result.map((c) => c.id)).toEqual(['am'])
  })

  it('search + sort combine', () => {
    const a = contract({ id: 'a', provider: 'Telekom Mobil', monthlyCost: 20 })
    const b = contract({ id: 'b', provider: 'Telekom DSL', monthlyCost: 50 })
    const c = contract({ id: 'c', provider: 'Vodafone', monthlyCost: 5 })

    const result = apply([a, b, c], { search: 'telekom', sort: 'monthly_cost_desc' })
    expect(result.map((x) => x.id)).toEqual(['b', 'a'])
  })

  it('filter + sort combine', () => {
    const on1 = contract({ id: 'on1', reminderEnabled: true, monthlyCost: 80 })
    const on2 = contract({ id: 'on2', reminderEnabled: true, monthlyCost: 20 })
    const off = contract({ id: 'off', reminderEnabled: false, monthlyCost: 999 })

    const result = apply([on1, on2, off], { reminderFilter: 'enabled', sort: 'monthly_cost_asc' })
    expect(result.map((c) => c.id)).toEqual(['on2', 'on1'])
  })

  it('search + filter + sort all combine at once', () => {
    const match = contract({
      id: 'match',
      provider: 'Telekom Mobil',
      categoryId: 'internet',
      reminderEnabled: true,
      startDate: '2020-01-01T00:00:00.000Z',
      monthlyCost: 30,
    })
    const wrongCategory = contract({
      id: 'wrong-category',
      provider: 'Telekom Strom',
      categoryId: 'electricity',
      reminderEnabled: true,
      startDate: '2020-01-01T00:00:00.000Z',
      monthlyCost: 10,
    })
    const wrongReminder = contract({
      id: 'wrong-reminder',
      provider: 'Telekom Kabel',
      categoryId: 'internet',
      reminderEnabled: false,
      startDate: '2020-01-01T00:00:00.000Z',
      monthlyCost: 5,
    })
    const cheaperMatch = contract({
      id: 'cheaper-match',
      provider: 'Telekom Festnetz',
      categoryId: 'internet',
      reminderEnabled: true,
      startDate: '2020-01-01T00:00:00.000Z',
      monthlyCost: 15,
    })

    const result = apply([match, wrongCategory, wrongReminder, cheaperMatch], {
      search: 'telekom',
      categoryFilter: 'internet',
      reminderFilter: 'enabled',
      sort: 'monthly_cost_asc',
    })
    expect(result.map((c) => c.id)).toEqual(['cheaper-match', 'match'])
  })
})

describe('getContractCategoryIds', () => {
  it('returns every category actually used, without duplicates', () => {
    const contracts = [
      contract({ categoryId: 'internet' }),
      contract({ categoryId: 'electricity' }),
      contract({ categoryId: 'internet' }),
    ]
    expect(getContractCategoryIds(contracts).sort()).toEqual(['electricity', 'internet'])
  })

  it('returns an empty list for no contracts', () => {
    expect(getContractCategoryIds([])).toEqual([])
  })
})

describe('filterAndSortContracts - empty inputs', () => {
  it('returns an empty list for an empty contract list', () => {
    expect(apply([])).toEqual([])
  })
})
