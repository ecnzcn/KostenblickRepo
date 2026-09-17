import {
  BillsIcon,
  ContractsIcon,
  HomeIcon,
  MoreIcon,
  StatisticsIcon,
} from '../components/icons/NavIcons'
import type { NavItem } from '../types/navigation'

export const ROUTES = {
  home: '/',
  statistics: '/statistik',
  bills: '/abrechnungen',
  billsNew: '/abrechnungen/neu',
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
  settings: '/mehr',
} as const

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

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', path: ROUTES.home, icon: HomeIcon },
  { label: 'Statistik', path: ROUTES.statistics, icon: StatisticsIcon },
  { label: 'Abrechnungen', path: ROUTES.bills, icon: BillsIcon },
  { label: 'Verträge', path: ROUTES.contracts, icon: ContractsIcon },
  { label: 'Mehr', path: ROUTES.settings, icon: MoreIcon },
]
