import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '../components/layout/AppLayout'
import { ROUTES } from '../constants/navigation'
import { BillsPage } from '../features/bills/BillsPage'
import { ContractsPage } from '../features/contracts/ContractsPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { StatisticsPage } from '../features/statistics/StatisticsPage'

export function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path={ROUTES.home} element={<DashboardPage />} />
        <Route path={ROUTES.statistics} element={<StatisticsPage />} />
        <Route path={ROUTES.bills} element={<BillsPage />} />
        <Route path={ROUTES.contracts} element={<ContractsPage />} />
        <Route path={ROUTES.settings} element={<SettingsPage />} />
        <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
      </Routes>
    </AppLayout>
  )
}
