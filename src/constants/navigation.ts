import {
  ContractsIcon,
  HomeIcon,
  MoreIcon,
  StatisticsIcon,
  TransactionsIcon,
} from '../components/icons/NavIcons'
import type { NavItem } from '../types/navigation'

export const ROUTES = {
  home: '/',
  statistics: '/statistik',
  bills: '/abrechnungen',
  billsNew: '/abrechnungen/neu',
  billsImport: '/abrechnungen/import',
  billDetailPattern: '/abrechnungen/:id',
  billEditPattern: '/abrechnungen/:id/bearbeiten',
  contracts: '/vertraege',
  contractsNew: '/vertraege/neu',
  contractDetailPattern: '/vertraege/:id',
  contractEditPattern: '/vertraege/:id/bearbeiten',
  costs: '/kosten',
  costsNew: '/kosten/neu',
  costDetailPattern: '/kosten/:id',
  costEditPattern: '/kosten/:id/bearbeiten',
  reminders: '/erinnerungen',
  documents: '/dokumente',
  documentDetailPattern: '/dokumente/:id',
  waste: '/muell',
  wasteNew: '/muell/neu',
  wasteDetailPattern: '/muell/:id',
  wasteEditPattern: '/muell/:id/bearbeiten',
  costOverview: '/kostenuebersicht',
  transactions: '/buchungen',
  transactionsImport: '/buchungen/import',
  transactionDetailPattern: '/buchungen/:id',
  categoryRules: '/regeln',
  settings: '/mehr',
} as const

export function transactionDetailPath(id: string): string {
  return `/buchungen/${id}`
}

export function billDetailPath(id: string): string {
  return `/abrechnungen/${id}`
}

export function billEditPath(id: string): string {
  return `/abrechnungen/${id}/bearbeiten`
}

export function contractDetailPath(id: string): string {
  return `/vertraege/${id}`
}

export function contractEditPath(id: string): string {
  return `/vertraege/${id}/bearbeiten`
}

export function costDetailPath(id: string): string {
  return `/kosten/${id}`
}

export function costEditPath(id: string): string {
  return `/kosten/${id}/bearbeiten`
}

export function documentDetailPath(id: string): string {
  return `/dokumente/${id}`
}

export function wasteDetailPath(id: string): string {
  return `/muell/${id}`
}

export function wasteEditPath(id: string): string {
  return `/muell/${id}/bearbeiten`
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', path: ROUTES.home, icon: HomeIcon },
  { label: 'Buchungen', path: ROUTES.transactions, icon: TransactionsIcon },
  { label: 'Statistik', path: ROUTES.statistics, icon: StatisticsIcon },
  { label: 'Verträge', path: ROUTES.contracts, icon: ContractsIcon },
  { label: 'Mehr', path: ROUTES.settings, icon: MoreIcon },
]
