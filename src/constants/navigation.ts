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
  contracts: '/vertraege',
  settings: '/mehr',
} as const

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Home', path: ROUTES.home, icon: HomeIcon },
  { label: 'Statistik', path: ROUTES.statistics, icon: StatisticsIcon },
  { label: 'Abrechnungen', path: ROUTES.bills, icon: BillsIcon },
  { label: 'Verträge', path: ROUTES.contracts, icon: ContractsIcon },
  { label: 'Mehr', path: ROUTES.settings, icon: MoreIcon },
]
